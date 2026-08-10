/**
 * Montagem do `redirectTo` dos fluxos de auth (OAuth, magic link, confirmação
 * de cadastro, reset de senha).
 *
 * A URL entregue ao Supabase precisa ser **limpa, sem query string**: a
 * allow-list de Redirect URLs do projeto é comparada contra a URL inteira, então
 * `.../auth/callback?next=/app` não casa com a entrada `.../auth/callback` e o
 * GoTrue silenciosamente cai no Site URL — o `?code=` aterrissa na home e
 * ninguém troca ele por sessão.
 *
 * O destino pós-login viaja num cookie de curta duração em vez da query.
 */

/** Cookie que guarda para onde ir depois que a sessão for criada. */
export const AUTH_NEXT_COOKIE = "nt-auth-next";

/** Validade do cookie: o suficiente para ida e volta no provedor (10 min). */
const AUTH_NEXT_MAX_AGE = 600;

/**
 * Só caminhos internos são aceitos como destino — impede open redirect via
 * `?redirect=https://malicioso`.
 */
export function sanitizeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/**
 * Grava o destino num cookie e devolve a URL de callback limpa para passar no
 * `redirectTo` / `emailRedirectTo`. Client-side apenas.
 */
export function buildAuthRedirect(next: string): string {
  const destino = sanitizeNext(next);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${AUTH_NEXT_COOKIE}=${encodeURIComponent(destino)}; Path=/; Max-Age=${AUTH_NEXT_MAX_AGE}; SameSite=Lax${secure}`;
  return `${window.location.origin}/auth/callback`;
}
