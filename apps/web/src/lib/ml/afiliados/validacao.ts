/**
 * Validação de link de afiliado (pura). Não existe API oficial de geração
 * (ver docs/ml/REFERENCIAS-APIS.md): o usuário cola o link do painel de afiliados.
 *
 * Aceita:
 *  - curto oficial: https://mercadolivre.com/sec/<código>
 *  - meli.la/<código>
 *  - URL do ML com parâmetros de rastreio de afiliado (matt_tool, matt_word, tracking_id…)
 * Avisa (não bloqueia) quando parece a URL normal do anúncio, sem rastreio.
 */

export const HOSTS_AFILIADO = ["mercadolivre.com", "mercadolivre.com.br", "mercadolibre.com", "meli.la"];
const PARAMS_RASTREIO = ["matt_tool", "matt_word", "matt_source", "tracking_id", "forceinapp", "ref", "aff"];

export type TipoLink = "curto_oficial" | "curto" | "rastreado" | "simples";

export interface ResultadoValidacao {
  ok: boolean;
  url: string | null;
  tipo: TipoLink | null;
  erros: string[];
  avisos: string[];
}

export function validarLinkAfiliado(entrada: string, opts: { urlOriginal?: string | null } = {}): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const bruto = entrada.trim();
  if (!bruto) return { ok: false, url: null, tipo: null, erros: ["Cole o link de afiliado."], avisos };

  // Aceita colar sem protocolo; extrai a 1ª URL se vier texto junto.
  const achado = /(https?:\/\/[^\s<>"']+|(?:www\.)?(?:mercadolivre\.com(?:\.br)?|mercadolibre\.com|meli\.la)\/[^\s<>"']*)/i.exec(bruto);
  let texto = achado ? achado[0] : bruto;
  if (!/^https?:\/\//i.test(texto)) texto = `https://${texto}`;

  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return { ok: false, url: null, tipo: null, erros: ["Isso não parece um link válido."], avisos };
  }
  if (u.protocol === "http:") {
    u.protocol = "https:";
    avisos.push("Convertido para https.");
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const permitido = HOSTS_AFILIADO.some((h) => host === h || host.endsWith(`.${h}`));
  if (!permitido) {
    erros.push(`Domínio não reconhecido (${host}). Use o link gerado no programa de afiliados do Mercado Livre.`);
    return { ok: false, url: null, tipo: null, erros, avisos };
  }
  if (u.username || u.password) erros.push("Link com credenciais não é aceito.");
  if (texto.length > 2048) erros.push("Link longo demais (máx. 2048 caracteres, limite do Pinterest).");

  let tipo: TipoLink;
  if ((host === "mercadolivre.com" || host === "mercadolivre.com.br") && /^\/sec\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) {
    tipo = "curto_oficial";
  } else if (host === "meli.la" && u.pathname.length > 1) {
    tipo = "curto";
  } else if ([...u.searchParams.keys()].some((k) => PARAMS_RASTREIO.includes(k.toLowerCase()))) {
    tipo = "rastreado";
  } else {
    tipo = "simples";
    avisos.push("Parece a URL normal do anúncio, sem rastreio de afiliado. Gere o link no painel de afiliados.");
  }

  if (opts.urlOriginal && tipo === "simples") {
    const semQuery = (s: string) => s.split(/[?#]/)[0]!.replace(/\/$/, "").toLowerCase();
    if (semQuery(opts.urlOriginal) === semQuery(u.toString())) {
      erros.push("Este é o link original do produto — ele não gera comissão.");
    }
  }

  return { ok: erros.length === 0, url: u.toString(), tipo, erros, avisos };
}

/** Status do redirect a partir do destino final (V2 §10): host do ML e, se possível, o mesmo produto. */
export function classificarRedirect(
  r: { ok: boolean; destino: string | null; conferido?: boolean },
  codigos: string[],
): "ok" | "ok_unverified" | "inconsistent" | "error" {
  if (r.conferido === false) return "error";
  if (!r.ok) return "inconsistent";
  const destino = (r.destino ?? "").toUpperCase().replace(/-/g, "");
  return codigos.some((c) => c && destino.includes(c.toUpperCase().replace(/-/g, ""))) ? "ok" : "ok_unverified";
}

