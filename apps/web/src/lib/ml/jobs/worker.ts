import "server-only";
import { randomBytes } from "node:crypto";
import { mlDb } from "../db";
import { processarAgendamentosVencidos } from "./agendador";
import { executarJob, type ResultadoExecucao } from "./executor";
import type { JobRow } from "./fila";
import { JOB_TYPES, META_JOB, type JobType } from "./tipos";
import { HANDLERS } from "./handlers";

/** Teto da função na Vercel (route `maxDuration`). Jobs só são pegos se couberem. */
export const DURACAO_MAXIMA_MS = 290_000;

export interface ResumoBatida {
  worker: string;
  reaped: number;
  agendamentos: { disparados: number; inicializados: number };
  executados: Record<ResultadoExecucao, number>;
  duracaoMs: number;
}

/**
 * Uma "batida" do worker: devolve leases vencidos, dispara agendamentos e
 * consome a fila até o orçamento de tempo. Chamado pelo pg_cron (1/min), pelo
 * "chute" após ações do usuário e pelo `pnpm ml:worker` em dev.
 */
export async function rodarBatida(opcoes: { orcamentoMs?: number; paralelo?: number } = {}): Promise<ResumoBatida> {
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 50_000;
  const paralelo = Math.max(1, Math.min(opcoes.paralelo ?? 3, 5));
  const worker = `w-${randomBytes(4).toString("hex")}`;
  const db = mlDb();
  const executados: Record<ResultadoExecucao, number> = { succeeded: 0, retry: 0, dead: 0, canceled: 0, wait: 0 };

  const { data: reaped } = await db.rpc("ml_reap_jobs");
  let agendamentos = { disparados: 0, inicializados: 0 };
  try {
    agendamentos = await processarAgendamentosVencidos();
  } catch (e) {
    console.error("[ml] agendador falhou", e);
  }

  while (Date.now() - inicio < orcamento) {
    const decorrido = Date.now() - inicio;
    // Só pega jobs cujo timeout cabe no que resta da função.
    const restante = DURACAO_MAXIMA_MS - decorrido - 5_000;
    const tipos = (JOB_TYPES as readonly JobType[]).filter((t) => META_JOB[t].timeoutSeg * 1000 <= restante);
    if (tipos.length === 0) break;

    const { data, error } = await db.rpc("ml_claim_jobs", { p_worker: worker, p_limit: paralelo, p_types: tipos });
    if (error) {
      console.error("[ml] claim falhou", error.message);
      break;
    }
    const jobs = (data ?? []) as JobRow[];
    if (jobs.length === 0) break;

    const resultados = await Promise.all(jobs.map((j) => executarJob(j, HANDLERS)));
    for (const r of resultados) executados[r]++;
  }

  return {
    worker,
    reaped: (reaped as number | null) ?? 0,
    agendamentos,
    executados,
    duracaoMs: Date.now() - inicio,
  };
}
