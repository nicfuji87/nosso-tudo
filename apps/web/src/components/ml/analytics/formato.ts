/**
 * Tipos e formatação da tela de Analytics (server e client).
 */
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { MODO_FIDELIDADE_LABEL, TIPO_VISUAL_LABEL } from "@/lib/ml/familias/plano";

export interface PontoSerie {
  date: string;
  impressions: number;
  saves: number;
  pin_clicks: number;
  outbound_clicks: number;
}

export interface Resumo {
  pins_publicados: number;
  pins_com_metricas: number;
  impressions: number;
  saves: number;
  pin_clicks: number;
  outbound_clicks: number;
  ctr_outbound: number | null;
  comissao: number;
  gmv: number;
  pedidos: number;
  receita_por_pin: number | null;
  epc: number | null;
  /** V2: famílias distintas entre os Pins que atendem aos filtros. */
  familias: number;
  outbound_por_mil: number | null;
  receita_por_familia: number | null;
  serie: PontoSerie[];
}

export type Dimensao =
  | "category"
  | "product"
  | "board"
  | "angle"
  | "headline"
  | "creative"
  | "price_band"
  | "pin"
  | "family"
  | "visual_type"
  | "scene"
  | "text"
  | "method"
  | "ai";

export interface LinhaBreakdown {
  dimension: Dimensao;
  key: string;
  label: string;
  pins: number;
  impressions: number;
  saves: number;
  pin_clicks: number;
  outbound_clicks: number;
  ctr: number | null;
  commission: number;
}

export const FAIXAS_PRECO = ["até R$ 50", "R$ 50–100", "R$ 100–200", "R$ 200–500", "R$ 500+", "sem preço"] as const;

/** Parâmetro de URL → chave de p_filters do banco. */
export const FILTROS_URL = {
  categoria: "category_id",
  produto: "product_id",
  board: "board_id",
  criativo: "creative_id",
  angulo: "angle_type",
  faixa: "price_band",
  ambiente: "environment",
  headline: "headline",
  familia: "family_id",
  tipo: "visual_type",
  cena: "scene",
  texto: "has_text",
  modo: "fidelity_mode",
} as const;
export type FiltroUrl = keyof typeof FILTROS_URL;

/** Dimensão do relatório → parâmetro de URL que filtra por ela. */
export const FILTRO_DA_DIMENSAO: Partial<Record<Dimensao, FiltroUrl>> = {
  category: "categoria",
  product: "produto",
  board: "board",
  angle: "angulo",
  creative: "criativo",
  price_band: "faixa",
  headline: "headline",
  family: "familia",
  visual_type: "tipo",
  scene: "cena",
  text: "texto",
  method: "modo",
};

/** Valor do filtro de URL para a chave de uma linha do relatório (com/sem texto vira 'true'/'false'). */
export function valorFiltroDaLinha(dimension: Dimensao, key: string): string | null {
  if (key === "—" || !key) return null;
  if (dimension === "text") return key === "com_texto" ? "true" : key === "sem_texto" ? "false" : null;
  return key;
}

/** Coortes (§11.9): dimensões aceitas por ml_analytics_cohort e janelas. */
export const DIMENSOES_COORTE = [
  { value: "family", label: "Família" },
  { value: "creative", label: "Variante" },
  { value: "visual_type", label: "Tipo visual" },
  { value: "scene", label: "Cena" },
  { value: "text", label: "Com × sem texto" },
  { value: "product", label: "Produto" },
] as const satisfies readonly { value: Dimensao; label: string }[];
export type DimensaoCoorte = (typeof DIMENSOES_COORTE)[number]["value"];
export const JANELAS_COORTE = ["7", "14", "30"] as const;

export function rotuloTipoVisual(t: string): string {
  return (TIPO_VISUAL_LABEL as Record<string, string>)[t] ?? t;
}

export function rotuloModo(m: string): string {
  return (MODO_FIDELIDADE_LABEL as Record<string, string>)[m] ?? m;
}

/** Rótulo legível da linha conforme a dimensão (o banco devolve a chave crua em tipo visual / modo). */
export function rotuloLinha(dimension: Dimensao, key: string, label: string): string {
  if (dimension === "visual_type") return rotuloTipoVisual(key);
  if (dimension === "method") return rotuloModo(key);
  if (dimension === "angle") return rotuloAngulo(key);
  return label;
}

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const numOuNulo = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function normalizarResumo(d: unknown): Resumo {
  const r = (d ?? {}) as Record<string, unknown>;
  const serie = Array.isArray(r.serie) ? (r.serie as Record<string, unknown>[]) : [];
  return {
    pins_publicados: num(r.pins_publicados),
    pins_com_metricas: num(r.pins_com_metricas),
    impressions: num(r.impressions),
    saves: num(r.saves),
    pin_clicks: num(r.pin_clicks),
    outbound_clicks: num(r.outbound_clicks),
    ctr_outbound: numOuNulo(r.ctr_outbound),
    comissao: num(r.comissao),
    gmv: num(r.gmv),
    pedidos: num(r.pedidos),
    receita_por_pin: numOuNulo(r.receita_por_pin),
    epc: numOuNulo(r.epc),
    familias: num(r.familias),
    outbound_por_mil: numOuNulo(r.outbound_por_mil),
    receita_por_familia: numOuNulo(r.receita_por_familia),
    serie: serie.map((p) => ({
      date: String(p.date ?? ""),
      impressions: num(p.impressions),
      saves: num(p.saves),
      pin_clicks: num(p.pin_clicks),
      outbound_clicks: num(p.outbound_clicks),
    })),
  };
}

export function normalizarBreakdown(d: unknown): LinhaBreakdown[] {
  return ((d ?? []) as Record<string, unknown>[]).map((r) => ({
    dimension: String(r.dimension) as Dimensao,
    key: String(r.key ?? "—"),
    label: String(r.label ?? r.key ?? "—"),
    pins: num(r.pins),
    impressions: num(r.impressions),
    saves: num(r.saves),
    pin_clicks: num(r.pin_clicks),
    outbound_clicks: num(r.outbound_clicks),
    ctr: numOuNulo(r.ctr),
    commission: num(r.commission),
  }));
}

export const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
export const fmtBrl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
export const fmtPct = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n);
export const fmtDecimal = (n: number | null, casas = 2) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
export const fmtCompacto = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** "2026-10-01" → "01/10/2026" (datas puras, sem fuso). */
export function fmtData(dia: string, curto = false): string {
  const [a, m, d] = dia.slice(0, 10).split("-");
  if (!a || !m || !d) return dia;
  return curto ? `${d}/${m}` : `${d}/${m}/${a}`;
}

export function rotuloAngulo(tipo: string): string {
  return tipo === "sem_angulo" ? "Sem ângulo" : labelAngulo(tipo);
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Parse de valor digitado em BRL ("1.234,56", "R$ 12,5", "12.5"). */
export function parseBrl(v: string): number | null {
  const s = v.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}
