import "server-only";
import { mlDb } from "../db";
import * as pinterest from "../integracoes/pinterest";
import { ErroApiExterna } from "../http";
import type { CtxJob } from "../jobs/executor";

/**
 * FETCH_PIN_ANALYTICS: métricas diárias dos Pins de PRODUÇÃO (sandbox não tem
 * analytics). Upsert por pin+dia — rodar de novo não duplica.
 */
export async function coletarMetricas(ctx: CtxJob, opts: { lookbackDias: number; pinId?: string | null }): Promise<Record<string, unknown>> {
  const db = mlDb();
  if ((await pinterest.ambiente()) === "sandbox") {
    return { ignorado: "Pinterest em modo sandbox — a API não oferece métricas no sandbox." };
  }
  const lookback = Math.min(Math.max(opts.lookbackDias, 1), 89);
  const inicio = new Date(Date.now() - lookback * 86_400_000).toISOString().slice(0, 10);
  const fim = new Date().toISOString().slice(0, 10);

  let q = db
    .from("ml_pins")
    .select("id, external_pin_id, published_at")
    .eq("status", "published")
    .eq("environment", "production")
    .not("external_pin_id", "is", null)
    .gte("published_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order("published_at", { ascending: false })
    .limit(200);
  if (opts.pinId) q = q.eq("id", opts.pinId);
  const { data } = await q;
  const pins = (data ?? []) as { id: string; external_pin_id: string; published_at: string }[];

  let linhas = 0;
  let falhas = 0;
  for (const pin of pins) {
    if (ctx.restanteMs() < 15_000) break;
    const desde = pin.published_at.slice(0, 10) > inicio ? pin.published_at.slice(0, 10) : inicio;
    try {
      const dias = await pinterest.metricasPin(pin.external_pin_id, desde, fim);
      const registros = dias
        .filter((d) => d.data_status !== "BEFORE_PIN_CREATED" && d.data_status !== "BEFORE_DATA_RETENTION_PERIOD")
        .map((d) => ({
          pin_id: pin.id,
          date: d.date,
          impressions: Math.round(d.metrics.IMPRESSION ?? 0),
          saves: Math.round(d.metrics.SAVE ?? 0),
          pin_clicks: Math.round(d.metrics.PIN_CLICK ?? 0),
          outbound_clicks: Math.round(d.metrics.OUTBOUND_CLICK ?? 0),
          raw: { data_status: d.data_status ?? null },
          fetched_at: new Date().toISOString(),
        }));
      if (registros.length) {
        const { error } = await db.from("ml_pin_metrics").upsert(registros, { onConflict: "pin_id,date" });
        if (error) throw new Error(error.message);
        linhas += registros.length;
      }
    } catch (e) {
      falhas++;
      // limite de taxa: interrompe e deixa o resto para a próxima execução
      if (e instanceof ErroApiExterna && e.tipo === "rate_limit") {
        await ctx.log("warn", "Limite de taxa do Pinterest atingido; continua na próxima execução.");
        break;
      }
      await ctx.log("warn", `Métricas do Pin ${pin.id} falharam: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { pins: pins.length, linhas, falhas, periodo: `${inicio}..${fim}` };
}

/**
 * COMPUTE_PERFORMANCE: agrega métricas por dimensão e calcula um índice de
 * performance 0–100 (CTR de outbound relativo à mediana + volume). Fica em
 * ml_performance_stats, SEPARADO do score editorial (spec §21).
 */
export async function calcularPerformance(): Promise<Record<string, unknown>> {
  const db = mlDb();
  const periodos = [30, 90];
  let gravadas = 0;
  for (const dias of periodos) {
    const { data, error } = await db.rpc("ml_analytics_breakdown", {
      p_from: new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10),
      p_to: new Date().toISOString().slice(0, 10),
      p_dimension: "all",
      p_filters: {},
    });
    if (error) throw new Error(`Falha ao agregar métricas: ${error.message}`);
    const linhas = (data ?? []) as {
      dimension: string;
      key: string;
      pins: number;
      impressions: number;
      saves: number;
      pin_clicks: number;
      outbound_clicks: number;
      commission: number;
    }[];
    const porDim = new Map<string, typeof linhas>();
    for (const l of linhas) porDim.set(l.dimension, [...(porDim.get(l.dimension) ?? []), l]);
    const registros: Record<string, unknown>[] = [];
    for (const [dim, ls] of porDim) {
      const ctrs = ls.filter((l) => l.impressions >= 100).map((l) => l.outbound_clicks / l.impressions).sort((a, b) => a - b);
      const mediana = ctrs.length ? ctrs[Math.floor(ctrs.length / 2)]! : 0;
      for (const l of ls) {
        const ctr = l.impressions > 0 ? l.outbound_clicks / l.impressions : null;
        // índice: CTR relativo à mediana (até 70 pts) + volume de cliques (até 30 pts); exige amostra mínima
        let score: number | null = null;
        if (l.impressions >= 100 && ctr != null) {
          const rel = mediana > 0 ? Math.min(2, ctr / mediana) : ctr > 0 ? 2 : 0;
          const volume = Math.min(1, Math.log10(l.outbound_clicks + 1) / 2);
          score = Math.round((rel * 35 + volume * 30) * 10) / 10;
        }
        registros.push({
          dimension: dim,
          key: l.key,
          period_days: dias,
          pins: l.pins,
          impressions: l.impressions,
          saves: l.saves,
          pin_clicks: l.pin_clicks,
          outbound_clicks: l.outbound_clicks,
          commission: l.commission,
          ctr,
          perf_score: score,
          computed_at: new Date().toISOString(),
        });
      }
    }
    if (registros.length) {
      const { error: e2 } = await db.from("ml_performance_stats").upsert(registros, { onConflict: "dimension,key,period_days" });
      if (e2) throw new Error(e2.message);
      gravadas += registros.length;
    }
  }
  return { linhas: gravadas };
}
