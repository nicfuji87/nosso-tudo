/**
 * Formatação e leitura de campos jsonb dos produtos ML — funções puras,
 * usadas tanto em Server Components quanto nos componentes de cliente.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");

export function brl(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? BRL.format(n) : "—";
}

export function numero(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? NUM.format(n) : "—";
}

export function nota(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1).replace(".", ",") : "—";
}

export function pct(v: number | string | null | undefined, casas = 0): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(casas).replace(".", ",")}%` : "—";
}

/** Converte number|string|null (numeric do PostgREST) em number|null. */
export function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export interface Imagem {
  url: string;
  width: number | null;
  height: number | null;
}

/** `pictures` jsonb → lista de imagens válidas (https). Usa o thumbnail como reserva. */
export function lerImagens(pictures: unknown, thumbnail?: string | null): Imagem[] {
  const lista: Imagem[] = [];
  if (Array.isArray(pictures)) {
    for (const p of pictures) {
      if (p && typeof p === "object" && typeof (p as { url?: unknown }).url === "string") {
        const o = p as { url: string; width?: unknown; height?: unknown };
        if (!o.url) continue;
        lista.push({ url: o.url, width: n(o.width), height: n(o.height) });
      }
    }
  }
  if (!lista.length && thumbnail) lista.push({ url: thumbnail, width: null, height: null });
  return lista;
}

/** `path` jsonb de ml_categories → nomes da raiz até a categoria. */
export function caminhoCategoria(path: unknown): string[] {
  if (!Array.isArray(path)) return [];
  return path
    .map((x) => (x && typeof x === "object" ? (x as { name?: unknown }).name : null))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** jsonb que deveria ser lista de textos. */
export function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

export const ORIGEM_LABEL: Record<string, string> = {
  bestseller: "Mais vendidos",
  trend: "Tendência",
  search: "Busca",
  manual: "Manual",
};

export const TREND_TYPE_LABEL: Record<string, string> = {
  fastest_growing: "Em alta",
  most_wanted: "Mais desejadas",
  popular: "Populares",
  trend: "Tendência",
};

export const MODO_IMAGEM_LABEL: Record<string, string> = {
  composition: "Composição",
  api: "IA (OpenAI)",
  manual_chatgpt: "Manual (ChatGPT)",
  upload: "Upload próprio",
};

export const ANGULO_STATUS_LABEL: Record<string, string> = {
  suggested: "Sugerido",
  selected: "Selecionado",
  discarded: "Descartado",
  used: "Usado",
};

export const ANGULO_ORIGEM_LABEL: Record<string, string> = {
  ai: "IA",
  template: "Regra",
  manual: "Manual",
};

export const ATOR_LABEL: Record<string, string> = {
  user: "Usuário",
  system: "Sistema",
  automation: "Automação",
};

export const CONDICAO_LABEL: Record<string, string> = {
  new: "Novo",
  used: "Usado",
  refurbished: "Recondicionado",
  not_specified: "Não informado",
};

export const MOTIVO_LABEL: Record<string, string> = {
  repetido: "Repetido",
  baixa_qualidade: "Baixa qualidade",
  preco: "Preço",
  pouco_visual: "Pouco visual",
  outro: "Outro",
};

/** Remove curingas do ilike para a busca ser literal. */
export function termoBusca(q: string | undefined): string | null {
  const t = (q ?? "").replace(/[%_\\,()"*]/g, " ").replace(/\s+/g, " ").trim();
  return t.length ? t.slice(0, 120) : null;
}

/** Lê um searchParam (pode vir como string[]). */
export function param(sp: Record<string, string | string[] | undefined>, chave: string): string | undefined {
  const v = sp[chave];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export function inteiro(v: string | undefined, padrao: number, min = 1, max = 100_000): number {
  const x = v ? Number.parseInt(v, 10) : Number.NaN;
  if (!Number.isFinite(x)) return padrao;
  return Math.min(max, Math.max(min, x));
}

export function decimal(v: string | undefined): number | null {
  if (!v) return null;
  const x = Number(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
