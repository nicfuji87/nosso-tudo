/**
 * Tipos e formatação da tela de Analytics (server e client).
 */
import { labelAngulo } from "@/lib/ml/conteudo/angulos";

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
  serie: PontoSerie[];
}

export type Dimensao = "category" | "product" | "board" | "angle" | "headline" | "creative" | "price_band";

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
} as const;
export type FiltroUrl = keyof typeof FILTROS_URL;

/** Dimensão do relatório → parâmetro de URL que filtra por ela (headline não tem filtro no banco). */
export const FILTRO_DA_DIMENSAO: Partial<Record<Dimensao, FiltroUrl>> = {
  category: "categoria",
  product: "produto",
  board: "board",
  angle: "angulo",
  creative: "criativo",
  price_band: "faixa",
};

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
