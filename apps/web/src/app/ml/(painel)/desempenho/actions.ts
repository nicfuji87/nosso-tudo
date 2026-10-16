"use server";

import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { mlDb } from "@/lib/ml/db";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as estudio from "@/lib/ml/servicos/estudio";

/** Importa os Pins da conta e coleta as métricas (dois jobs; a tela acompanha). */
export async function atualizarDesempenho() {
  return executarAcao("operator", async (s) => {
    const imp = await enfileirar({ tipo: "SYNC_ACCOUNT_PINS", idempotencyKey: "sync-account-pins", criadoPor: s.userId });
    const met = await enfileirar({ tipo: "FETCH_PIN_ANALYTICS", payload: { lookback_days: 30 }, idempotencyKey: "fetch-analytics:manual", criadoPor: s.userId, runAt: new Date(Date.now() + 60_000) });
    await chutarWorker();
    return { jobIds: [imp.job.id, met.job.id], mensagem: "Atualizando Pins e métricas…" };
  });
}

/** Sugestões de próximos Pins (IA) a partir do desempenho dos últimos N dias. */
export async function sugerirProximos(dias: number) {
  return executarAcao("operator", async () => {
    const d = z.number().int().min(7).max(90).parse(dias);
    const { data } = await mlDb().rpc("ml_desempenho", { p_dias: d });
    const r = (data ?? {}) as { pins?: { titulo: string | null; board: string | null; impressoes: number; saves: number; saidas: number }[] };
    const { data: boards } = await mlDb().from("ml_pinterest_boards").select("name").eq("active", true).is("removed_at", null);
    const sugestoes = await estudio.sugerirProximosPins(r.pins ?? [], ((boards ?? []) as { name: string }[]).map((b) => b.name));
    return { sugestoes };
  });
}
