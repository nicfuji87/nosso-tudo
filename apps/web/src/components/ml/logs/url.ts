/** Filtros da tela de Logs persistidos na URL (spec §25). */

export const ABAS_LOGS = ["jobs", "eventos", "api", "auditoria", "transicoes"] as const;
export type AbaLogs = (typeof ABAS_LOGS)[number];

export const PERIODOS = [
  { valor: "24h", rotulo: "Últimas 24 h", horas: 24 },
  { valor: "7d", rotulo: "Últimos 7 dias", horas: 24 * 7 },
  { valor: "30d", rotulo: "Últimos 30 dias", horas: 24 * 30 },
  { valor: "tudo", rotulo: "Todo o período", horas: null },
] as const;
export const PERIODO_PADRAO = "7d";

export type ParamsLogs = Record<string, string | undefined>;

export function lerParams(sp: Record<string, string | string[] | undefined>): ParamsLogs {
  const out: ParamsLogs = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s != null && s !== "") out[k] = s.slice(0, 120);
  }
  return out;
}

export function hrefLogs(atual: ParamsLogs, mudancas: ParamsLogs = {}): string {
  const p = new URLSearchParams();
  const tudo = { ...atual, ...mudancas };
  for (const [k, v] of Object.entries(tudo)) {
    if (v == null || v === "") continue;
    if (k === "aba" && v === "jobs") continue;
    if (k === "pagina" && v === "1") continue;
    p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `/ml/logs?${qs}` : "/ml/logs";
}

/** Data ISO de início do período (null = sem limite). */
export function inicioPeriodo(periodo: string | undefined): string | null {
  const def = PERIODOS.find((p) => p.valor === (periodo ?? PERIODO_PADRAO)) ?? PERIODOS[1];
  if (!def.horas) return null;
  return new Date(Date.now() - def.horas * 3600_000).toISOString();
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
