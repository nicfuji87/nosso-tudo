import "server-only";
import { mlDb } from "../db";
import { redigir, truncar, redigirTexto } from "../redacao";
import { META_JOB, type JobType } from "./tipos";

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed" | "dead" | "canceled";
  priority: number;
  attempts: number;
  max_attempts: number;
  run_at: string;
  timeout_seconds: number;
  locked_by: string | null;
  lock_expires_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  last_error: string | null;
  error_detail: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  idempotency_key: string | null;
  concurrency_key: string | null;
  cancel_requested: boolean;
  schedule_id: string | null;
  parent_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpcoesJob {
  tipo: JobType;
  payload?: Record<string, unknown>;
  /** Único entre jobs ATIVOS (queued/running): repetir devolve o existente. */
  idempotencyKey?: string | null;
  /** No máximo um job "running" por chave (os demais aguardam). */
  concurrencyKey?: string | null;
  runAt?: Date;
  prioridade?: number;
  entidade?: { tipo: string; id: string } | null;
  scheduleId?: string | null;
  parentId?: string | null;
  criadoPor?: string | null;
  maxTentativas?: number;
}

export async function enfileirar(o: OpcoesJob): Promise<{ job: JobRow; criado: boolean }> {
  const meta = META_JOB[o.tipo];
  const linha = {
    type: o.tipo,
    payload: o.payload ?? {},
    priority: o.prioridade ?? meta.prioridade,
    max_attempts: o.maxTentativas ?? meta.maxTentativas,
    timeout_seconds: meta.timeoutSeg,
    run_at: (o.runAt ?? new Date()).toISOString(),
    idempotency_key: o.idempotencyKey ?? null,
    concurrency_key: o.concurrencyKey ?? null,
    entity_type: o.entidade?.tipo ?? null,
    entity_id: o.entidade?.id ?? null,
    schedule_id: o.scheduleId ?? null,
    parent_id: o.parentId ?? null,
    created_by: o.criadoPor ?? null,
  };
  const { data, error } = await mlDb().from("ml_jobs").insert(linha).select("*").single();
  if (!error) return { job: data as JobRow, criado: true };

  // 23505 = já existe job ativo com a mesma chave de idempotência
  if (error.code === "23505" && o.idempotencyKey) {
    const { data: existente } = await mlDb()
      .from("ml_jobs")
      .select("*")
      .eq("idempotency_key", o.idempotencyKey)
      .in("status", ["queued", "running"])
      .maybeSingle();
    if (existente) return { job: existente as JobRow, criado: false };
  }
  throw new Error(`Falha ao enfileirar ${o.tipo}: ${error.message}`);
}

export async function logJob(
  jobId: string,
  nivel: "debug" | "info" | "warn" | "error",
  mensagem: string,
  dados?: unknown,
): Promise<void> {
  try {
    await mlDb()
      .from("ml_job_logs")
      .insert({
        job_id: jobId,
        level: nivel,
        message: truncar(redigirTexto(mensagem), 1000),
        data: dados === undefined ? null : redigir(dados),
      });
  } catch {
    /* log nunca derruba o job */
  }
}

export async function atualizarProgresso(jobId: string, progresso: Record<string, unknown>): Promise<void> {
  await mlDb().from("ml_jobs").update({ progress: progresso }).eq("id", jobId);
}

function duracao(job: JobRow): number | null {
  return job.started_at ? Date.now() - new Date(job.started_at).getTime() : null;
}

export async function concluirJob(job: JobRow, resultado: unknown): Promise<void> {
  await mlDb()
    .from("ml_jobs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      duration_ms: duracao(job),
      result: resultado == null ? null : redigir(resultado as Record<string, unknown>),
      locked_by: null,
      lock_expires_at: null,
      last_error: null,
    })
    .eq("id", job.id)
    .eq("status", "running");
}

export async function falharJob(
  job: JobRow,
  erro: { mensagem: string; detalhe?: Record<string, unknown> },
  decisao: { acao: "retry"; emMs: number } | { acao: "dead" } | { acao: "cancel" } | { acao: "wait"; emMs: number },
): Promise<void> {
  const base = {
    last_error: truncar(redigirTexto(erro.mensagem), 1000),
    error_detail: erro.detalhe ? redigir(erro.detalhe) : null,
    duration_ms: duracao(job),
    locked_by: null,
    lock_expires_at: null,
  };
  let patch: Record<string, unknown>;
  switch (decisao.acao) {
    case "retry":
      patch = { ...base, status: "queued", run_at: new Date(Date.now() + decisao.emMs).toISOString() };
      break;
    case "wait":
      // não conta como tentativa
      patch = {
        ...base,
        status: "queued",
        attempts: Math.max(0, job.attempts - 1),
        run_at: new Date(Date.now() + decisao.emMs).toISOString(),
      };
      break;
    case "cancel":
      patch = { ...base, status: "canceled", finished_at: new Date().toISOString() };
      break;
    case "dead":
      patch = { ...base, status: "dead", finished_at: new Date().toISOString() };
      break;
  }
  await mlDb().from("ml_jobs").update(patch).eq("id", job.id).eq("status", "running");
}

/** Cancela: na fila → cancelado; rodando → pede cancelamento cooperativo. */
export async function cancelarJob(jobId: string): Promise<"canceled" | "requested" | "noop"> {
  const { data: q } = await mlDb()
    .from("ml_jobs")
    .update({ status: "canceled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id");
  if (q && q.length) return "canceled";
  const { data: r } = await mlDb()
    .from("ml_jobs")
    .update({ cancel_requested: true })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id");
  return r && r.length ? "requested" : "noop";
}

/**
 * Reprocessa um job que falhou/foi cancelado criando um NOVO job (o histórico
 * do original fica intacto). Handlers são idempotentes, então é seguro.
 */
export async function reprocessarJob(jobId: string, userId: string | null): Promise<JobRow> {
  const { data } = await mlDb().from("ml_jobs").select("*").eq("id", jobId).maybeSingle();
  const job = data as JobRow | null;
  if (!job) throw new Error("Job não encontrado.");
  if (!["failed", "dead", "canceled"].includes(job.status)) {
    throw new Error("Só dá para reprocessar jobs que falharam ou foram cancelados.");
  }
  const { job: novo } = await enfileirar({
    tipo: job.type,
    payload: job.payload,
    idempotencyKey: job.idempotency_key,
    concurrencyKey: job.concurrency_key,
    entidade: job.entity_type && job.entity_id ? { tipo: job.entity_type, id: job.entity_id } : null,
    scheduleId: job.schedule_id,
    parentId: job.id,
    criadoPor: userId,
    prioridade: job.priority,
  });
  return novo;
}

export async function jobAtivoPorChave(chave: string): Promise<JobRow | null> {
  const { data } = await mlDb()
    .from("ml_jobs")
    .select("*")
    .eq("idempotency_key", chave)
    .in("status", ["queued", "running"])
    .maybeSingle();
  return (data as JobRow | null) ?? null;
}
