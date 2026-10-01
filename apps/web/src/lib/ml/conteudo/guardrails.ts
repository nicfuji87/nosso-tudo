/**
 * Guardrails de conteúdo (spec §22) — puros, aplicados a QUALQUER copy
 * (IA ou template) antes de virar criativo/Pin.
 */

export const LIMITES_PIN = { titulo: 100, descricao: 800, altText: 500, headline: 60 } as const;

/** Promessas que não dá para sustentar sem prova. */
const CLAIMS_PROIBIDOS: [RegExp, string][] = [
  [/\b(o\s+)?melhor\s+do\s+mundo\b/gi, ""],
  [/\b100\s?%\s*(garantido|eficaz|seguro|original)\b/gi, ""],
  [/\bgarantia\s+vital[ií]cia\b/gi, ""],
  [/\bcura\b/gi, ""],
  [/\bemagre[cç]a?\s+\d+\s*kg\b/gi, ""],
  [/\b(mais\s+barato|menor\s+pre[cç]o)\s+do\s+(brasil|mercado)\b/gi, ""],
  [/\bfrete\s+gr[aá]tis\b/gi, ""], // muda por região/vendedor
];

const PRECO = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi;

export interface RelatorioGuardrail {
  texto: string;
  alteracoes: string[];
}

function limparEspacos(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\s+([.,!?;:])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

function cortar(s: string, max: number): string {
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const ultimo = corte.lastIndexOf(" ");
  return `${(ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).replace(/[\s,;:.-]+$/, "")}…`;
}

export function sanitizarTexto(texto: string, opts: { max: number; permitirPreco: boolean }): RelatorioGuardrail {
  const alteracoes: string[] = [];
  let t = texto ?? "";
  for (const [re] of CLAIMS_PROIBIDOS) {
    if (re.test(t)) {
      alteracoes.push(`Removida promessa não sustentada (${re.source.slice(0, 30)}…)`);
      t = t.replace(re, "");
    }
    re.lastIndex = 0;
  }
  if (!opts.permitirPreco && PRECO.test(t)) {
    alteracoes.push("Preço removido (pode mudar até a publicação).");
    t = t.replace(PRECO, "");
  }
  PRECO.lastIndex = 0;
  t = limparEspacos(t);
  if (t.length > opts.max) {
    alteracoes.push(`Cortado para ${opts.max} caracteres.`);
    t = cortar(t, opts.max);
  }
  return { texto: t, alteracoes };
}

/** Garante o disclosure comercial no fim da descrição, dentro do limite. */
export function comDisclosure(descricao: string, disclosure: string, max = LIMITES_PIN.descricao): string {
  const d = disclosure.trim();
  if (!d) return cortar(descricao, max);
  if (descricao.toLowerCase().includes(d.toLowerCase())) return cortar(descricao, max);
  const sufixo = `\n\n${d}`;
  return `${cortar(descricao, max - sufixo.length)}${sufixo}`;
}

export interface CopyBruta {
  headline: string;
  titulo: string;
  descricao: string;
  alt_text: string;
  palavras_chave: string[];
  cta?: string;
}

export interface CopyFinal extends CopyBruta {
  alteracoes: string[];
}

export function aplicarGuardrails(
  c: CopyBruta,
  opts: { disclosure: string; exigirDisclosure: boolean; permitirPreco: boolean },
): CopyFinal {
  const alteracoes: string[] = [];
  const h = sanitizarTexto(c.headline, { max: LIMITES_PIN.headline, permitirPreco: opts.permitirPreco });
  const t = sanitizarTexto(c.titulo, { max: LIMITES_PIN.titulo, permitirPreco: opts.permitirPreco });
  const d = sanitizarTexto(c.descricao, { max: LIMITES_PIN.descricao, permitirPreco: opts.permitirPreco });
  const a = sanitizarTexto(c.alt_text, { max: LIMITES_PIN.altText, permitirPreco: true });
  alteracoes.push(...h.alteracoes, ...t.alteracoes, ...d.alteracoes, ...a.alteracoes);
  const descricao = opts.exigirDisclosure ? comDisclosure(d.texto, opts.disclosure) : d.texto;
  const palavras = Array.from(
    new Set(c.palavras_chave.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 2 && p.length <= 40)),
  ).slice(0, 10);
  return {
    headline: h.texto,
    titulo: t.texto || h.texto,
    descricao,
    alt_text: a.texto,
    palavras_chave: palavras,
    cta: c.cta ? sanitizarTexto(c.cta, { max: 40, permitirPreco: false }).texto : undefined,
    alteracoes,
  };
}

/** Problemas que BLOQUEIAM publicação (validação final). */
export function problemasDeTexto(p: { titulo: string | null; descricao: string | null; disclosure: string; exigirDisclosure: boolean }): string[] {
  const erros: string[] = [];
  if (!p.titulo?.trim()) erros.push("Título vazio.");
  if ((p.titulo ?? "").length > LIMITES_PIN.titulo) erros.push(`Título acima de ${LIMITES_PIN.titulo} caracteres.`);
  if (!p.descricao?.trim()) erros.push("Descrição vazia.");
  if ((p.descricao ?? "").length > LIMITES_PIN.descricao) erros.push(`Descrição acima de ${LIMITES_PIN.descricao} caracteres.`);
  if (p.exigirDisclosure && p.disclosure.trim() && !(p.descricao ?? "").toLowerCase().includes(p.disclosure.trim().toLowerCase())) {
    erros.push("Descrição sem o aviso de link de afiliado (disclosure).");
  }
  return erros;
}

/** Similaridade simples entre headlines (Jaccard de palavras) para evitar repetição. */
export function similaridade(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((x) => x.length > 2));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter((x) => x.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}
