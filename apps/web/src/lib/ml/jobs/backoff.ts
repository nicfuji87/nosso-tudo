/**
 * Política de retry (pura). Exponencial com jitter, teto de 1 h, respeitando
 * Retry-After quando o provedor informa (429).
 */
export function calcularBackoffMs(tentativa: number, retryAfterMs: number | null = null, aleatorio = Math.random): number {
  const base = 30_000 * 2 ** Math.max(0, tentativa - 1); // 30s, 60s, 2m, 4m, 8m…
  const jitter = base * 0.2 * (aleatorio() * 2 - 1); // ±20%
  const exp = Math.min(3_600_000, Math.round(base + jitter));
  if (retryAfterMs != null && retryAfterMs > 0) return Math.min(3_600_000, Math.max(exp, retryAfterMs));
  return exp;
}

export type DecisaoFalha = { acao: "retry"; emMs: number } | { acao: "dead" };

export function decidirFalha(p: {
  tentativa: number;
  maxTentativas: number;
  retentavel: boolean;
  retryAfterMs?: number | null;
  aleatorio?: () => number;
}): DecisaoFalha {
  if (!p.retentavel || p.tentativa >= p.maxTentativas) return { acao: "dead" };
  return { acao: "retry", emMs: calcularBackoffMs(p.tentativa, p.retryAfterMs ?? null, p.aleatorio) };
}
