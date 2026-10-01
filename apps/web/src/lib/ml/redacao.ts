/**
 * Redação de segredos em logs/erros/payloads (spec §24: "logs com redaction
 * de Authorization, cookies e tokens"). Pura e testada em redacao.test.ts.
 */

const CHAVE_SENSIVEL = /(token|secret|authorization|password|senha|api[_-]?key|cookie|code_verifier|client_secret|refresh|bearer|credential)/i;

// Formatos conhecidos de credenciais dos provedores usados.
const PADROES: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /Basic\s+[A-Za-z0-9+/=]{8,}/gi,
  /APP_USR-[A-Za-z0-9-]{10,}/g, // Mercado Livre
  /TG-[A-Za-z0-9-]{10,}/g, // ML authorization code / refresh
  /pina_[A-Za-z0-9_-]{10,}/g, // Pinterest access token
  /pinr[a-z]*_[A-Za-z0-9_-]{10,}/g, // Pinterest refresh token
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI
  /apify_api_[A-Za-z0-9]{10,}/g, // Apify
  /([?&](?:access_token|token|code|client_secret|refresh_token)=)[^&\s"]+/gi,
];

export function redigirTexto(texto: string): string {
  let out = texto;
  for (const re of PADROES) {
    out = out.replace(re, (_m, prefixo: unknown) =>
      typeof prefixo === "string" && /^[?&]/.test(prefixo) ? `${prefixo}[REDACTED]` : "[REDACTED]",
    );
  }
  return out;
}

export function redigir<T>(valor: T, profundidade = 0): T {
  if (profundidade > 8) return "[…]" as unknown as T;
  if (valor == null) return valor;
  if (typeof valor === "string") return redigirTexto(valor) as unknown as T;
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1)) as unknown as T;
  if (typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVE_SENSIVEL.test(k) && v != null && v !== "" ? "[REDACTED]" : redigir(v, profundidade + 1);
    }
    return out as T;
  }
  return valor;
}

/** URL sem query string (onde costumam viajar credenciais) e sem userinfo. */
export function urlSegura(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return redigirTexto(url.split("?")[0] ?? url);
  }
}

/** Trunca textos longos (respostas de API) para caber em log. */
export function truncar(texto: string, max = 2000): string {
  return texto.length > max ? `${texto.slice(0, max)}… (+${texto.length - max} chars)` : texto;
}
