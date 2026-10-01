"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { mlDb } from "@/lib/ml/db";
import { proximasExecucoes, timezoneValido, validarCron } from "@/lib/ml/cron";
import { dispararAgendamento, recalcularProxima, type ScheduleRow } from "@/lib/ml/jobs/agendador";
import { cancelarJob, reprocessarJob } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { JOB_TYPES } from "@/lib/ml/jobs/tipos";

const id = z.string().uuid();
const revalidar = () => revalidatePath("/ml", "layout");

async function lerAgendamento(scheduleId: string): Promise<ScheduleRow> {
  const { data } = await mlDb().from("ml_schedules").select("*").eq("id", id.parse(scheduleId)).maybeSingle();
  if (!data) throw new Error("Automação não encontrada.");
  return data as ScheduleRow;
}

/** Prévia das próximas execuções (modo avançado e simples). */
export async function previaAgenda(cron: string, timezone: string) {
  return executarAcao("viewer", async () => {
    const v = validarCron(cron, timezone);
    if (!v.ok) return { valido: false, erro: v.erro, proximas: [] as string[] };
    return { valido: true, proximas: proximasExecucoes(cron, timezone, 5).map((d) => d.toISOString()) };
  });
}

const edicao = z.object({
  name: z.string().min(2).max(80).optional(),
  cron_expression: z.string().min(9).max(120),
  timezone: z.string().min(1).max(60),
  enabled: z.boolean(),
  overlap_policy: z.enum(["skip", "queue", "cancel_previous"]),
  config: z.record(z.unknown()).optional(),
  ui: z.record(z.unknown()).nullable().optional(),
});

export async function salvarAgendamento(scheduleId: string, dados: z.infer<typeof edicao>) {
  return executarAcao("admin", async (s) => {
    const d = edicao.parse(dados);
    if (!timezoneValido(d.timezone)) throw new Error("Timezone inválido.");
    const v = validarCron(d.cron_expression, d.timezone);
    if (!v.ok) throw new Error(v.erro);
    const antes = await lerAgendamento(scheduleId);
    const config = d.config ?? antes.config;
    if (JSON.stringify(config).length > 5000) throw new Error("Configuração grande demais.");
    const { error } = await mlDb()
      .from("ml_schedules")
      .update({
        ...(d.name ? { name: d.name } : {}),
        cron_expression: d.cron_expression.trim(),
        timezone: d.timezone,
        enabled: d.enabled,
        overlap_policy: d.overlap_policy,
        config,
        ui: d.ui ?? null,
      })
      .eq("id", antes.id);
    if (error) throw new Error(error.message);
    const prox = await recalcularProxima(antes.id);
    await auditar({
      acao: "automacao.editar",
      entidade: "schedule",
      entidadeId: antes.key,
      actorId: s.userId,
      antes: { cron: antes.cron_expression, tz: antes.timezone, enabled: antes.enabled, overlap: antes.overlap_policy, config: antes.config },
      depois: { cron: d.cron_expression, tz: d.timezone, enabled: d.enabled, overlap: d.overlap_policy, config },
    });
    revalidar();
    return { proxima: prox, mensagem: "Automação salva." };
  });
}

export async function alternarAgendamento(scheduleId: string, enabled: boolean) {
  return executarAcao("admin", async (s) => {
    const a = await lerAgendamento(scheduleId);
    await mlDb().from("ml_schedules").update({ enabled }).eq("id", a.id);
    await recalcularProxima(a.id);
    await auditar({ acao: enabled ? "automacao.ativar" : "automacao.desativar", entidade: "schedule", entidadeId: a.key, actorId: s.userId });
    revalidar();
    return { mensagem: enabled ? "Ativada." : "Desativada." };
  });
}

/** "Executar agora" — independe do horário, respeita a política de sobreposição. */
export async function executarAgora(scheduleId: string) {
  return executarAcao("operator", async (s) => {
    const a = await lerAgendamento(scheduleId);
    const r = await dispararAgendamento(a, "manual", s.userId);
    await chutarWorker();
    revalidar();
    const msg: Record<string, string> = {
      enqueued: "Execução iniciada.",
      queued_behind: "Enfileirada — roda quando a anterior terminar.",
      canceled_previous: "Execução anterior cancelada; nova iniciada.",
      skipped_overlap: "Já existe uma execução ativa (política: pular).",
      skipped_paused: "Automações pausadas.",
      error: "Não foi possível disparar.",
    };
    return { jobId: r.jobId, resultado: r.resultado, mensagem: msg[r.resultado] };
  });
}

/** "Duplicar configuração" — cria uma automação irmã desativada para ajustar. */
export async function duplicarAgendamento(scheduleId: string) {
  return executarAcao("admin", async (s) => {
    const a = await lerAgendamento(scheduleId);
    const key = `${a.key}_copia_${Date.now().toString(36)}`;
    const { data, error } = await mlDb()
      .from("ml_schedules")
      .insert({
        key,
        name: `${a.name} (cópia)`,
        description: a.description,
        job_type: a.job_type,
        cron_expression: a.cron_expression,
        timezone: a.timezone,
        enabled: false,
        overlap_policy: a.overlap_policy,
        config: a.config,
        ui: a.ui,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await auditar({ acao: "automacao.duplicar", entidade: "schedule", entidadeId: key, actorId: s.userId, metadata: { origem: a.key } });
    revalidar();
    return { scheduleId: (data as { id: string }).id, mensagem: "Cópia criada (desativada)." };
  });
}

export async function excluirAgendamento(scheduleId: string) {
  return executarAcao("admin", async (s) => {
    const a = await lerAgendamento(scheduleId);
    if (!a.key.includes("_copia_")) throw new Error("Só cópias podem ser excluídas — as automações padrão podem ser desativadas.");
    await mlDb().from("ml_schedules").delete().eq("id", a.id);
    await auditar({ acao: "automacao.excluir", entidade: "schedule", entidadeId: a.key, actorId: s.userId });
    revalidar();
    return { mensagem: "Excluída." };
  });
}

export async function reprocessar(jobId: string) {
  return executarAcao("operator", async (s) => {
    const novo = await reprocessarJob(id.parse(jobId), s.userId);
    await auditar({ acao: "job.reprocessar", entidade: "job", entidadeId: jobId, actorId: s.userId, metadata: { novo: novo.id } });
    await chutarWorker();
    revalidar();
    return { jobId: novo.id, mensagem: "Reprocessamento enfileirado." };
  });
}

export async function cancelar(jobId: string) {
  return executarAcao("operator", async (s) => {
    const r = await cancelarJob(id.parse(jobId));
    await auditar({ acao: "job.cancelar", entidade: "job", entidadeId: jobId, actorId: s.userId, metadata: { resultado: r } });
    revalidar();
    return { mensagem: r === "canceled" ? "Cancelado." : r === "requested" ? "Cancelamento solicitado — o job para na próxima etapa." : "Nada a cancelar." };
  });
}

export async function tiposDeJob() {
  return JOB_TYPES;
}
