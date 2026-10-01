import "server-only";
import { mlDb } from "../db";
import { proximaExecucao, validarCron } from "../cron";
import { lerConfig } from "../config";
import { cancelarJob, enfileirar } from "./fila";
import { JOB_TYPES, type JobType } from "./tipos";

export interface ScheduleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  job_type: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  overlap_policy: "skip" | "queue" | "cancel_previous";
  config: Record<string, unknown>;
  ui: Record<string, unknown> | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_job_id: string | null;
  last_duration_ms: number | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export type ResultadoDisparo =
  | "enqueued"
  | "skipped_overlap"
  | "queued_behind"
  | "canceled_previous"
  | "skipped_paused"
  | "error";

function calcularProxima(s: Pick<ScheduleRow, "cron_expression" | "timezone">, desde = new Date()): string | null {
  if (!validarCron(s.cron_expression, s.timezone).ok) return null;
  return proximaExecucao(s.cron_expression, s.timezone, desde).toISOString();
}

/**
 * Dispara um agendamento aplicando a política de sobreposição:
 *  - skip: se há execução ativa, não enfileira (registra "pulado");
 *  - queue: enfileira e AGUARDA a anterior (mesma concurrency_key);
 *  - cancel_previous: cancela a ativa e enfileira a nova.
 */
export async function dispararAgendamento(
  s: ScheduleRow,
  gatilho: "cron" | "manual",
  userId: string | null = null,
): Promise<{ resultado: ResultadoDisparo; jobId?: string }> {
  const registrar = async (resultado: ResultadoDisparo, jobId?: string, nota?: string) => {
    await mlDb()
      .from("ml_schedule_runs")
      .insert({ schedule_id: s.id, trigger: gatilho, outcome: resultado, job_id: jobId ?? null, note: nota ?? null, created_by: userId });
    await mlDb()
      .from("ml_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        last_status: resultado === "enqueued" || resultado === "queued_behind" || resultado === "canceled_previous" ? "queued" : resultado,
        ...(jobId ? { last_job_id: jobId } : {}),
      })
      .eq("id", s.id);
    return { resultado, jobId };
  };

  if (!(JOB_TYPES as readonly string[]).includes(s.job_type)) {
    return registrar("error", undefined, `Tipo de job desconhecido: ${s.job_type}`);
  }
  if (gatilho === "cron") {
    const auto = await lerConfig("automacao");
    if (auto.pausado) return registrar("skipped_paused", undefined, "Automações pausadas globalmente.");
  }

  const { data: ativos } = await mlDb()
    .from("ml_jobs")
    .select("id, status")
    .eq("schedule_id", s.id)
    .is("parent_id", null)
    .in("status", ["queued", "running"]);
  const emAndamento = (ativos ?? []) as { id: string; status: string }[];

  let resultado: ResultadoDisparo = "enqueued";
  if (emAndamento.length > 0) {
    if (s.overlap_policy === "skip") {
      return registrar("skipped_overlap", emAndamento[0]!.id, "Execução anterior ainda ativa.");
    }
    if (s.overlap_policy === "cancel_previous") {
      for (const j of emAndamento) await cancelarJob(j.id);
      resultado = "canceled_previous";
    } else {
      resultado = "queued_behind";
    }
  }

  const { job } = await enfileirar({
    tipo: s.job_type as JobType,
    payload: { ...s.config, _schedule: s.key, _gatilho: gatilho },
    concurrencyKey: `schedule:${s.key}`,
    scheduleId: s.id,
    criadoPor: userId,
  });
  return registrar(resultado, job.id);
}

/** Avalia agendamentos vencidos (e inicializa os que ainda não têm próxima execução). */
export async function processarAgendamentosVencidos(): Promise<{ disparados: number; inicializados: number }> {
  const db = mlDb();
  let inicializados = 0;

  const { data: semProxima } = await db
    .from("ml_schedules")
    .select("id, cron_expression, timezone")
    .eq("enabled", true)
    .is("next_run_at", null);
  for (const s of (semProxima ?? []) as Pick<ScheduleRow, "id" | "cron_expression" | "timezone">[]) {
    const prox = calcularProxima(s);
    if (prox) {
      await db.from("ml_schedules").update({ next_run_at: prox }).eq("id", s.id).is("next_run_at", null);
      inicializados++;
    }
  }

  const { data, error } = await db.rpc("ml_claim_due_schedules", { p_limit: 20 });
  if (error) throw new Error(`Falha ao reivindicar agendamentos: ${error.message}`);
  const devidos = (data ?? []) as ScheduleRow[];

  for (const s of devidos) {
    // Próxima execução a partir de AGORA: se o worker ficou parado, não recupera
    // execuções perdidas em rajada — roda uma vez e segue a agenda.
    const prox = calcularProxima(s);
    await db.from("ml_schedules").update({ next_run_at: prox, locked_until: null }).eq("id", s.id);
    try {
      await dispararAgendamento(s, "cron");
    } catch (e) {
      console.error("[ml] falha ao disparar agendamento", s.key, e);
    }
  }
  return { disparados: devidos.length, inicializados };
}

export async function recalcularProxima(scheduleId: string): Promise<string | null> {
  const { data } = await mlDb().from("ml_schedules").select("*").eq("id", scheduleId).maybeSingle();
  const s = data as ScheduleRow | null;
  if (!s) return null;
  const prox = s.enabled ? calcularProxima(s) : null;
  await mlDb().from("ml_schedules").update({ next_run_at: prox }).eq("id", scheduleId);
  return prox;
}
