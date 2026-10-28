/**
 * Detecção de promoção — PURO (sem I/O), testado em promocoes-calc.test.ts.
 *
 * "Promoção" aqui não é opinião: é o menor preço de hoje para uma rota
 * (origem, destino, programa, cabine) comparado ao preço NORMAL dessa mesma
 * rota. O preço normal vem, em ordem de preferência:
 *   1. do histórico que este app grava todo dia (mediana dos últimos dias);
 *   2. enquanto o histórico é curto: da mediana dos outros meses da mesma rota
 *      hoje ("julho está 40% abaixo do resto do ano nessa rota").
 * Sem nenhum dos dois, não há como afirmar que está barato — fica de fora.
 */
import type { Cabine, OfertaMilhas } from "./radar-calc";

export const MIN_HISTORICO = 5;
export const MIN_MESES_MERCADO = 3;

export function mesDoVoo(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}

export function chaveRota(origem: string, destino: string, programa: string, cabine: string): string {
  return `${origem}|${destino}|${programa}|${cabine}`;
}

export function chaveHistorico(origem: string, destino: string, programa: string, cabine: string, mesVoo: string): string {
  return `${chaveRota(origem, destino, programa, cabine)}|${mesVoo}`;
}

export function mediana(valores: number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  const alto = v[meio] as number;
  return v.length % 2 ? alto : Math.round(((v[meio - 1] as number) + alto) / 2);
}

/** Menor preço por rota e mês de voo (a granularidade do histórico). */
export interface MinimoRota {
  origem: string;
  destino: string;
  programa: string;
  cabine: Cabine;
  mesVoo: string;
  milhasMin: number;
  taxasMinCents: number;
  /** Quantas datas com disponibilidade naquele mês. */
  n: number;
  /** A oferta mais barata do mês (a que vira a promoção). */
  oferta: OfertaMilhas;
}

export function agregarMinimos(ofertas: OfertaMilhas[]): MinimoRota[] {
  const mapa = new Map<string, MinimoRota>();
  for (const o of ofertas) {
    if (!o.milhas || o.milhas <= 0) continue;
    const mes = mesDoVoo(o.data);
    const k = chaveHistorico(o.origem, o.destino, o.programa, o.cabine, mes);
    const atual = mapa.get(k);
    if (!atual) {
      mapa.set(k, {
        origem: o.origem,
        destino: o.destino,
        programa: o.programa,
        cabine: o.cabine,
        mesVoo: mes,
        milhasMin: o.milhas,
        taxasMinCents: o.taxasCents,
        n: 1,
        oferta: o,
      });
      continue;
    }
    atual.n += 1;
    if (o.milhas < atual.milhasMin || (o.milhas === atual.milhasMin && o.taxasCents < atual.taxasMinCents)) {
      atual.milhasMin = o.milhas;
      atual.taxasMinCents = o.taxasCents;
      atual.oferta = o;
    }
  }
  return [...mapa.values()];
}

export interface Referencia {
  valor: number;
  fonte: "historico" | "mercado_hoje";
}

/**
 * Preço normal para um mínimo de hoje.
 * @param historico mínimos diários anteriores da MESMA rota e mês de voo (sem hoje)
 * @param outrosMesesHoje mínimos de hoje da mesma rota em outros meses de voo
 */
export function referenciaPara(historico: number[], outrosMesesHoje: number[]): Referencia | null {
  if (historico.filter((x) => x > 0).length >= MIN_HISTORICO) {
    const m = mediana(historico);
    if (m) return { valor: m, fonte: "historico" };
  }
  if (outrosMesesHoje.filter((x) => x > 0).length >= MIN_MESES_MERCADO) {
    const m = mediana(outrosMesesHoje);
    if (m) return { valor: m, fonte: "mercado_hoje" };
  }
  return null;
}

export function descontoPct(atual: number, referencia: number): number {
  if (referencia <= 0) return 0;
  return Math.round(((referencia - atual) / referencia) * 1000) / 10;
}

export interface PromocaoMilhas {
  minimo: MinimoRota;
  referencia: Referencia;
  descontoPct: number;
  score: number;
}

export interface OpcoesPromo {
  descontoMinimoPct: number;
  pessoas: number;
}

/**
 * Uma promoção por rota (origem, destino, programa, cabine): o mês com o maior
 * desconto. Só entra o que bate o desconto mínimo. O score desempata a favor
 * de voo direto e de assento confirmado para a família toda.
 */
export function avaliarPromocoesMilhas(
  minimos: MinimoRota[],
  historico: Map<string, number[]>,
  opts: OpcoesPromo,
): PromocaoMilhas[] {
  const porRota = new Map<string, MinimoRota[]>();
  for (const m of minimos) {
    const k = chaveRota(m.origem, m.destino, m.programa, m.cabine);
    porRota.set(k, [...(porRota.get(k) ?? []), m]);
  }

  const out: PromocaoMilhas[] = [];
  for (const meses of porRota.values()) {
    let melhor: PromocaoMilhas | null = null;
    for (const m of meses) {
      const hist = historico.get(chaveHistorico(m.origem, m.destino, m.programa, m.cabine, m.mesVoo)) ?? [];
      const outros = meses.filter((x) => x !== m).map((x) => x.milhasMin);
      const ref = referenciaPara(hist, outros);
      if (!ref) continue;
      const desc = descontoPct(m.milhasMin, ref.valor);
      if (desc < opts.descontoMinimoPct) continue;
      const assentos = m.oferta.assentos;
      const bonusAssento = assentos != null && assentos >= opts.pessoas ? 5 : assentos != null && assentos > 0 ? -10 : 0;
      const bonusFonte = ref.fonte === "historico" ? 3 : 0;
      const score = Math.round((desc + (m.oferta.direto ? 5 : 0) + bonusAssento + bonusFonte) * 100) / 100;
      if (!melhor || score > melhor.score) melhor = { minimo: m, referencia: ref, descontoPct: desc, score };
    }
    if (melhor) out.push(melhor);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Uma oferta em dinheiro (Google Travel Explore): preço de ida e volta em R$. */
export interface OfertaDinheiro {
  origem: string;
  destino: string;
  destinoNome: string;
  /** YYYY-MM-DD */
  dataIda: string;
  dataVolta: string | null;
  precoCents: number;
  paradas: number | null;
  companhia: string | null;
}

export interface PromocaoDinheiro {
  oferta: OfertaDinheiro;
  referencia: Referencia | null;
  descontoPct: number | null;
  score: number;
}

/**
 * Dinheiro: o Explore já devolve o destino mais barato de cada lugar. Com
 * histórico, mede o desconto; sem, entra só pelo preço (score negativo
 * proporcional, para os mais baratos virem primeiro) e a UI não fala em "%".
 */
export function avaliarPromocoesDinheiro(
  ofertas: OfertaDinheiro[],
  historico: Map<string, number[]>,
  opts: { descontoMinimoPct: number },
): PromocaoDinheiro[] {
  const out: PromocaoDinheiro[] = [];
  for (const o of ofertas) {
    if (!o.precoCents || o.precoCents <= 0) continue;
    const hist = historico.get(chaveHistorico(o.origem, o.destino, "dinheiro", "economy", mesDoVoo(o.dataIda))) ?? [];
    const ref = referenciaPara(hist, []);
    if (ref) {
      const desc = descontoPct(o.precoCents, ref.valor);
      if (desc < opts.descontoMinimoPct) continue;
      out.push({ oferta: o, referencia: ref, descontoPct: desc, score: desc + (o.paradas === 0 ? 5 : 0) });
    } else {
      out.push({ oferta: o, referencia: null, descontoPct: null, score: -o.precoCents / 100_000 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
