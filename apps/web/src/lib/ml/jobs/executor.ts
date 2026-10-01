import "server-only";
import { mlDb } from "../db";
import { contextoMl } from "../contexto";
import { ErroApiExterna } from "../http";
import { abrirPendencia } from "../servicos/pendencias";
import { decidirFalha } from "./backoff";
import { ErroAguardar, ErroCancelado, ErroPermanente } from "./erros";
import { concluirJob, falharJob, logJob, atualizarProgresso, type JobRow } from "./fila";
import { labelJob, type JobType } from "./tipos";

export interface CtxJob {
  job: JobRow;
  log: (nivel: "debug" | "info" | "warn" | "error", mensagem: string, dados?: unknown) => Promise<void>;
  progresso: (p: Record<string, unknown>) => Promise<void>;
  /** Lança ErroCancelado se alguém pediu cancelamento. Chame entre etapas longas. */
  checarCancelamento: () => Promise<void>;
  /** ms até o timeout do job. */
  restanteMs: () => number;
}

export type Handler = (ctx: CtxJob) => Promise<Record<string, unknown> | void>;
export type RegistroHandlers = Partial<Record<JobType, Handler>>;

export type ResultadoExecucao = "succeeded" | "retry" | "dead" | "canceled" | "wait";

async function foiCancelado(jobId: string): Promise<boolean> {
  const { data } = await mlDb().from("ml_jobs").select("cancel_requested").eq("id", jobId).maybeSingle();
  return Boolean((data as { cancel_requested: boolean } | null)?.cancel_requested);
}

export async function executarJob(job: JobRow, handlers: RegistroHandlers): Promise<ResultadoExecucao> {
  const handler = handlers[job.type];
  const inicio = Date.now();
  const limite = inicio + job.timeout_seconds * 1000;

  if (!handler) {
    await falharJob(job, { mensagem: `Não há executor para o tipo ${job.type}.` }, { acao: "dead" });
    return "dead";
  }

  const ctx: CtxJob = {
    job,
    log: (n, m, d) => logJob(job.id, n, m, d),
    progresso: (p) => atualizarProgresso(job.id, p),
    checarCancelamento: async () => {
      if (await foiCancelado(job.id)) throw new ErroCancelado();
    },
    restanteMs: () => limite - Date.now(),
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resultado = await contextoMl.run(
      {
        jobId: job.id,
        actorId: job.created_by,
        actorType: job.created_by ? "user" : "automation",
        cancelado: () => foiCancelado(job.id),
      },
      () =>
        Promise.race([
          handler(ctx),
          new Promise<never>((_, rej) => {
            timer = setTimeout(
              () => rej(new Error(`Tempo limite do job excedido (${job.timeout_seconds}s).`)),
              job.timeout_seconds * 1000,
            );
          }),
        ]),
    );
    clearTimeout(timer);
    await concluirJob(job, resultado ?? null);
    await atualizarAgendamento(job, "succeeded");
    return "succeeded";
  } catch (e) {
    clearTimeout(timer);
    return tratarErro(job, e);
  }
}

async function tratarErro(job: JobRow, e: unknown): Promise<ResultadoExecucao> {
  if (e instanceof ErroAguardar) {
    await logJob(job.id, "info", `Aguardando: ${e.message}`);
    await falharJob(job, { mensagem: e.message }, { acao: "wait", emMs: e.emMs });
    return "wait";
  }
  if (e instanceof ErroCancelado) {
    await logJob(job.id, "warn", "Execução cancelada a pedido.");
    await falharJob(job, { mensagem: e.message }, { acao: "cancel" });
    await atualizarAgendamento(job, "canceled");
    return "canceled";
  }

  let retentavel = true;
  let retryAfter: number | null = null;
  const detalhe: Record<string, unknown> = {};
  let mensagem = e instanceof Error ? e.message : String(e);

  if (e instanceof ErroPermanente) {
    retentavel = false;
    Object.assign(detalhe, e.detalhe ?? {});
  } else if (e instanceof ErroApiExterna) {
    retentavel = e.retentavel;
    retryAfter = e.retryAfterMs;
    Object.assign(detalhe, {
      provider: e.provider,
      operation: e.operation,
      status: e.status,
      tipo: e.tipo,
      request_id: e.requestId,
      resposta: e.corpo,
    });
    if (e.tipo === "quota") mensagem = `${mensagem} (cota/crédito esgotado no provedor)`;
  }
  if (e instanceof Error && e.stack) detalhe.stack = e.stack.split("\n").slice(0, 6).join("\n");

  const decisao = decidirFalha({
    tentativa: job.attempts,
    maxTentativas: job.max_attempts,
    retentavel,
    retryAfterMs: retryAfter,
  });
  await logJob(job.id, "error", mensagem, detalhe);
  await falharJob(job, { mensagem, detalhe }, decisao);

  if (decisao.acao === "dead") {
    await atualizarAgendamento(job, "dead");
    // Falha definitiva nunca some em silêncio: vira pendência na Central.
    await abrirPendencia({
      tipo: e instanceof ErroApiExterna && e.tipo === "auth" ? "integration_auth" : "job_failed",
      titulo: `${labelJob(job.type)} falhou`,
      detalhe: mensagem,
      entidade: job.entity_type && job.entity_id ? { tipo: job.entity_type, id: job.entity_id } : { tipo: "job", id: job.id },
      dedupeKey: `job_failed:${job.type}:${job.entity_id ?? job.id}`,
      payload: { job_id: job.id, tipo: job.type },
      prioridade: 30,
    });
    return "dead";
  }
  return "retry";
}

/** Reflete o resultado no agendamento que originou o job (última execução/duração). */
async function atualizarAgendamento(job: JobRow, status: string): Promise<void> {
  if (!job.schedule_id || job.parent_id) return;
  const duracao = job.started_at ? Date.now() - new Date(job.started_at).getTime() : null;
  await mlDb()
    .from("ml_schedules")
    .update({ last_status: status, last_duration_ms: duracao })
    .eq("id", job.schedule_id)
    .eq("last_job_id", job.id);
}
