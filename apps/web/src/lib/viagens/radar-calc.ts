/**
 * Cálculo do radar de rotas — PURO (sem I/O), testado em radar-calc.test.ts.
 *
 * Recebe ofertas de milhas já normalizadas (vindas do seats.aero) e responde:
 *   - quanto cada oferta custa em R$ para ESTA família (custo real da milha na
 *     carteira, ou estimativa do programa) — é o que permite comparar 66 mil
 *     Smiles com 28,5 mil Avios;
 *   - quais combinações ida + volta cabem na duração pedida, da mais barata
 *     para a mais cara, aceitando programas diferentes em cada perna.
 */

export const CABINES = ["economy", "premium", "business", "first"] as const;
export type Cabine = (typeof CABINES)[number];

export const LABEL_CABINE: Record<Cabine, string> = {
  economy: "Econômica",
  premium: "Premium economy",
  business: "Executiva",
  first: "Primeira",
};

/** Uma disponibilidade de award num dia, numa cabine, num programa. */
export interface OfertaMilhas {
  id: string;
  origem: string;
  destino: string;
  /** YYYY-MM-DD */
  data: string;
  /** Fonte do seats.aero (ex.: "smiles", "qatar"). */
  programa: string;
  cabine: Cabine;
  milhas: number;
  /** Centavos na `moedaTaxas` (o seats.aero devolve USD). 0 pode ser "desconhecido". */
  taxasCents: number;
  moedaTaxas: string;
  /** null = o programa não informa quantos assentos restam. */
  assentos: number | null;
  direto: boolean;
  companhias: string;
  atualizadoEm: string;
}

export type FonteCusto = "carteira" | "programa" | "estimado";

export interface PrecoMilheiro {
  /** Centavos de R$ por 1.000 milhas, por fonte do seats.aero. */
  porPrograma: Record<string, { cents: number; fonte: FonteCusto }>;
  /** Usado quando o programa não tem custo conhecido. */
  padraoCents: number;
}

export interface OfertaCusteada extends OfertaMilhas {
  taxasBrlCents: number;
  custoCents: number;
  fonteCusto: FonteCusto;
}

export function precoDoPrograma(precos: PrecoMilheiro, programa: string): { cents: number; fonte: FonteCusto } {
  return precos.porPrograma[programa] ?? { cents: precos.padraoCents, fonte: "estimado" };
}

/** Converte taxas para centavos de R$. Moeda desconhecida é tratada como USD (o caso do seats.aero). */
export function taxasEmReais(cents: number, moeda: string, cambioUsdBrl: number): number {
  if (!cents) return 0;
  if (moeda.toUpperCase() === "BRL") return Math.round(cents);
  return Math.round(cents * cambioUsdBrl);
}

/** Custo por pessoa em centavos de R$: milhas × custo do milheiro + taxas convertidas. */
export function custearOferta(o: OfertaMilhas, precos: PrecoMilheiro, cambioUsdBrl: number): OfertaCusteada {
  const p = precoDoPrograma(precos, o.programa);
  const taxasBrlCents = taxasEmReais(o.taxasCents, o.moedaTaxas, cambioUsdBrl);
  return {
    ...o,
    taxasBrlCents,
    custoCents: Math.round((o.milhas / 1000) * p.cents) + taxasBrlCents,
    fonteCusto: p.fonte,
  };
}

export type StatusAssentos = "sim" | "desconhecido" | "nao";

/**
 * Cabe a família inteira no mesmo voo?
 * Vários programas devolvem 0 quando não informam (ou quando há muitos lugares,
 * caso da American) — 0 e null viram "desconhecido", não "não".
 */
export function assentosPara(o: OfertaMilhas, pessoas: number): StatusAssentos {
  if (o.assentos === null || o.assentos === 0) return "desconhecido";
  return o.assentos >= pessoas ? "sim" : "nao";
}

export function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface Combinacao {
  ida: OfertaCusteada;
  volta: OfertaCusteada | null;
  /** Dias entre a ida e a volta. null = só ida. */
  dias: number | null;
  /** Soma das milhas das pernas (podem ser programas diferentes). */
  milhasPp: number;
  taxasPpCents: number;
  custoPpCents: number;
  programas: string[];
  assentos: Exclude<StatusAssentos, "nao">;
  /** Volta sai do mesmo aeroporto onde a ida chegou e chega de onde a ida saiu. */
  mesmoAeroporto: boolean;
}

export interface OpcoesCombinacao {
  pessoas: number;
  /** null/undefined nos dois = viagem só de ida. */
  duracaoMin?: number | null;
  duracaoMax?: number | null;
  precos: PrecoMilheiro;
  cambioUsdBrl: number;
  limite?: number;
}

function piorAssento(a: StatusAssentos, b: StatusAssentos): Exclude<StatusAssentos, "nao"> {
  return a === "sim" && b === "sim" ? "sim" : "desconhecido";
}

/**
 * Melhores combinações, da mais barata (em R$ por pessoa) para a mais cara.
 * Descarta ofertas em que sabidamente não cabem todos. Entre alternativas,
 * não repete o mesmo par de datas.
 */
export function montarCombinacoes(
  idas: OfertaMilhas[],
  voltas: OfertaMilhas[],
  opts: OpcoesCombinacao,
): Combinacao[] {
  const limite = opts.limite ?? 5;
  const custear = (o: OfertaMilhas) => custearOferta(o, opts.precos, opts.cambioUsdBrl);
  const cabe = (o: OfertaMilhas) => assentosPara(o, opts.pessoas) !== "nao";

  const idasOk = idas.filter(cabe).map(custear);
  const soIda = opts.duracaoMin == null && opts.duracaoMax == null;

  if (soIda) {
    const porData = new Map<string, OfertaCusteada>();
    for (const o of idasOk) {
      const atual = porData.get(o.data);
      if (!atual || o.custoCents < atual.custoCents) porData.set(o.data, o);
    }
    return [...porData.values()]
      .sort((a, b) => a.custoCents - b.custoCents)
      .slice(0, limite)
      .map((ida) => ({
        ida,
        volta: null,
        dias: null,
        milhasPp: ida.milhas,
        taxasPpCents: ida.taxasBrlCents,
        custoPpCents: ida.custoCents,
        programas: [ida.programa],
        assentos: piorAssento(assentosPara(ida, opts.pessoas), "sim"),
        mesmoAeroporto: true,
      }));
  }

  const min = opts.duracaoMin ?? opts.duracaoMax ?? 1;
  const max = opts.duracaoMax ?? opts.duracaoMin ?? min;

  // Melhor volta por data (a mais barata que cabe a família).
  const voltaPorData = new Map<string, OfertaCusteada[]>();
  for (const v of voltas.filter(cabe).map(custear)) {
    voltaPorData.set(v.data, [...(voltaPorData.get(v.data) ?? []), v]);
  }
  for (const lista of voltaPorData.values()) lista.sort((a, b) => a.custoCents - b.custoCents);

  // Melhor ida por data, idem.
  const idaPorData = new Map<string, OfertaCusteada[]>();
  for (const o of idasOk) idaPorData.set(o.data, [...(idaPorData.get(o.data) ?? []), o]);
  for (const lista of idaPorData.values()) lista.sort((a, b) => a.custoCents - b.custoCents);

  const combos: Combinacao[] = [];
  for (const [dataIda, listaIda] of idaPorData) {
    for (let d = min; d <= max; d++) {
      const listaVolta = voltaPorData.get(somarDias(dataIda, d));
      // Prefere a volta que fecha o mesmo par de aeroportos se custar igual ou menos;
      // senão aceita open-jaw (a UI avisa).
      const ida = listaIda[0];
      const volta = listaVolta?.[0];
      if (!ida || !listaVolta || !volta) continue;
      const fechada = listaVolta.find((v) => v.origem === ida.destino && v.destino === ida.origem);
      const escolhida = fechada && fechada.custoCents <= volta.custoCents ? fechada : volta;
      combos.push({
        ida,
        volta: escolhida,
        dias: d,
        milhasPp: ida.milhas + escolhida.milhas,
        taxasPpCents: ida.taxasBrlCents + escolhida.taxasBrlCents,
        custoPpCents: ida.custoCents + escolhida.custoCents,
        programas: [...new Set([ida.programa, escolhida.programa])],
        assentos: piorAssento(assentosPara(ida, opts.pessoas), assentosPara(escolhida, opts.pessoas)),
        mesmoAeroporto: escolhida.origem === ida.destino && escolhida.destino === ida.origem,
      });
    }
  }

  return combos.sort((a, b) => a.custoPpCents - b.custoPpCents || a.milhasPp - b.milhasPp).slice(0, limite);
}

/**
 * Janelas de busca a partir da janela da viagem: a ida sai entre `inicio` e
 * `fim - duracaoMin`; a volta, entre `inicio + duracaoMin` e `fim`. Nada no
 * passado: o mais cedo é amanhã.
 */
export function janelasDeBusca(
  inicio: string,
  fim: string,
  hoje: string,
  duracaoMin: number | null,
): { ida: { de: string; ate: string }; volta: { de: string; ate: string } | null } | null {
  const amanha = somarDias(hoje, 1);
  const de = inicio > amanha ? inicio : amanha;
  if (duracaoMin == null) return de > fim ? null : { ida: { de, ate: fim }, volta: null };
  const ateIda = somarDias(fim, -duracaoMin);
  if (de > ateIda) return null;
  return { ida: { de, ate: ateIda }, volta: { de: somarDias(de, duracaoMin), ate: fim } };
}
