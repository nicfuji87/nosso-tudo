/**
 * Motor de scoring (spec §21) — função PURA, sem I/O, testada em engine.test.ts.
 *
 * - Score 0–100 com decomposição persistida: nunca só um número.
 * - Fator sem dado entra NEUTRO (50) e marcado em `missingData`; a
 *   `confidence` é a fração do peso total que tinha dado real. Assim um produto
 *   com um único sinal ótimo não vira 100 por renormalização.
 * - Regras duras rodam antes e tornam o produto inelegível (o score ainda é
 *   calculado, para explicar).
 * - Performance observada é um fator SEPARADO (peso 0 por padrão) — §21
 *   "não misturar heurística com resultado observado sem versionamento".
 */

export const FATORES = [
  "bestseller_rank",
  "trend",
  "pinterest_fit",
  "reviews",
  "commission",
  "price_range",
  "discount",
  "image_quality",
  "novelty",
  "performance",
] as const;
export type Fator = (typeof FATORES)[number];
export type Pesos = Record<Fator, number>;

export const FATOR_LABEL: Record<Fator, string> = {
  bestseller_rank: "Ranking de mais vendidos",
  trend: "Tendência / crescimento",
  pinterest_fit: "Pinterest fit / apelo visual",
  reviews: "Avaliações e confiança",
  commission: "Comissão potencial",
  price_range: "Faixa de preço",
  discount: "Desconto / oferta",
  image_quality: "Qualidade de imagem",
  novelty: "Novidade / não repetição",
  performance: "Performance histórica",
};

export const PESOS_PADRAO: Pesos = {
  bestseller_rank: 20,
  trend: 15,
  pinterest_fit: 20,
  reviews: 10,
  commission: 10,
  price_range: 5,
  discount: 5,
  image_quality: 10,
  novelty: 5,
  performance: 0,
};

export interface ParametrosScore {
  /** Faixa de preço "ideal" para conversão no Pinterest (R$). */
  precoIdealMin: number;
  precoIdealMax: number;
  /** Comissão (R$) que vale nota 100. */
  comissaoAlvo: number;
  /** Prior bayesiano das avaliações. */
  ratingPrior: number;
  ratingPeso: number;
  /** Dias até um produto já promovido voltar a contar como "novo". */
  diasNovidade: number;
  /** Tamanho padrão da lista de mais vendidos. */
  tamanhoRanking: number;
}

export const PARAMETROS_PADRAO: ParametrosScore = {
  precoIdealMin: 40,
  precoIdealMax: 300,
  comissaoAlvo: 15,
  ratingPrior: 4.0,
  ratingPeso: 20,
  diasNovidade: 60,
  tamanhoRanking: 50,
};

export interface EntradaScore {
  disponivel: boolean | null;
  temImagemUtilizavel: boolean;
  emCooldownDeDescarte: boolean;
  categoriaProibida: boolean;
  duplicadoDe?: string | null;
  posicaoRanking: number | null;
  tamanhoListaRanking?: number | null;
  /** Variação de posição desde a coleta anterior (>0 = subiu). null = sem histórico. */
  variacaoRanking: number | null;
  novoNoRanking: boolean;
  casaComTendencia: boolean;
  temHistorico: boolean;
  rating: number | null;
  qtdAvaliacoes: number | null;
  preco: number | null;
  precoOriginal: number | null;
  descontoPct: number | null;
  comissaoPct: number | null;
  qtdImagens: number;
  maiorLadoImagem: number | null;
  ia?: { pinterestFit: number; apeloVisual: number; qualidadeImagem: number } | null;
  /** Estimativa heurística de apelo visual pela categoria (0–100). */
  priorVisualCategoria: number | null;
  vezesPromovido: number;
  diasDesdeUltimaPromocao: number | null;
  scorePerformance: number | null;
}

export interface Componente {
  key: Fator;
  label: string;
  weight: number;
  value: number; // 0–100 usado no cálculo (neutro quando faltante)
  points: number; // contribuição em pontos (0..peso)
  detail: string;
  missing: boolean;
  estimated?: boolean;
}

export interface ResultadoScore {
  score: number;
  confidence: number;
  eligible: boolean;
  hardRuleFailures: string[];
  components: Componente[];
  positives: string[];
  alerts: string[];
  missingData: Fator[];
}

const NEUTRO = 50;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Avaliacao {
  value: number | null;
  detail: string;
  estimated?: boolean;
}

function avaliar(f: Fator, e: EntradaScore, p: ParametrosScore): Avaliacao {
  switch (f) {
    case "bestseller_rank": {
      if (e.posicaoRanking == null) return { value: null, detail: "Fora da lista de mais vendidos coletada." };
      const n = Math.max(e.tamanhoListaRanking ?? p.tamanhoRanking, e.posicaoRanking, 2);
      const v = 100 - ((e.posicaoRanking - 1) * 90) / (n - 1);
      return { value: clamp(v), detail: `#${e.posicaoRanking} entre os mais vendidos da categoria.` };
    }
    case "trend": {
      if (!e.temHistorico && !e.casaComTendencia && !e.novoNoRanking) {
        return { value: null, detail: "Ainda sem histórico para medir tendência." };
      }
      let v = NEUTRO;
      const partes: string[] = [];
      if (e.variacaoRanking != null && e.variacaoRanking !== 0) {
        v += clamp(e.variacaoRanking * 3, -40, 40);
        partes.push(e.variacaoRanking > 0 ? `subiu ${e.variacaoRanking} posições` : `caiu ${-e.variacaoRanking} posições`);
      }
      if (e.novoNoRanking) {
        v += 10;
        partes.push("entrou recentemente no ranking");
      }
      if (e.casaComTendencia) {
        v += 25;
        partes.push("casa com uma busca em alta");
      }
      return { value: clamp(v), detail: partes.length ? capitalizar(partes.join(", ")) + "." : "Estável no ranking." };
    }
    case "pinterest_fit": {
      if (e.ia) {
        const v = e.ia.pinterestFit * 0.6 + e.ia.apeloVisual * 0.4;
        return { value: clamp(v), detail: `Análise de IA: fit ${Math.round(e.ia.pinterestFit)}, apelo visual ${Math.round(e.ia.apeloVisual)}.` };
      }
      if (e.priorVisualCategoria != null) {
        return { value: clamp(e.priorVisualCategoria), detail: "Estimado pela categoria (sem análise de IA).", estimated: true };
      }
      return { value: null, detail: "Sem análise de IA nem estimativa por categoria." };
    }
    case "reviews": {
      if (e.rating == null) return { value: null, detail: "Sem avaliações disponíveis." };
      const n = Math.max(0, e.qtdAvaliacoes ?? 0);
      const ajustada = (p.ratingPeso * p.ratingPrior + n * e.rating) / (p.ratingPeso + n);
      const qualidade = clamp(((ajustada - 3.5) / 1.5) * 100);
      const volume = clamp((Math.log10(n + 1) / 3) * 100); // 1000+ avaliações = 100
      return {
        value: qualidade * 0.7 + volume * 0.3,
        detail: `Nota ${e.rating.toFixed(1)} em ${n.toLocaleString("pt-BR")} avaliações (ajustada ${ajustada.toFixed(2)}).`,
      };
    }
    case "commission": {
      if (e.comissaoPct == null || e.preco == null) {
        return { value: null, detail: "Defina a comissão da categoria em Configurações › Categorias." };
      }
      const reais = (e.preco * e.comissaoPct) / 100;
      return { value: clamp((reais / p.comissaoAlvo) * 100), detail: `≈ ${brl(reais)} por venda (${e.comissaoPct}% de ${brl(e.preco)}).` };
    }
    case "price_range": {
      if (e.preco == null) return { value: null, detail: "Preço desconhecido." };
      let v = 100;
      if (e.preco < p.precoIdealMin) v = (100 * e.preco) / p.precoIdealMin;
      else if (e.preco > p.precoIdealMax) v = (100 * p.precoIdealMax) / e.preco;
      return { value: clamp(v), detail: `${brl(e.preco)} (faixa ideal ${brl(p.precoIdealMin)}–${brl(p.precoIdealMax)}).` };
    }
    case "discount": {
      if (e.preco == null) return { value: null, detail: "Preço desconhecido." };
      const d = e.descontoPct ?? 0;
      return { value: clamp(d * 2.5), detail: d > 0 ? `${Math.round(d)}% de desconto.` : "Sem desconto." };
    }
    case "image_quality": {
      if (e.ia) return { value: clamp(e.ia.qualidadeImagem), detail: `Análise de IA da foto: ${Math.round(e.ia.qualidadeImagem)}.` };
      if (e.qtdImagens === 0) return { value: null, detail: "Sem imagens." };
      const qtd = clamp((e.qtdImagens / 5) * 100);
      const res = e.maiorLadoImagem == null ? NEUTRO : clamp((e.maiorLadoImagem / 1000) * 100);
      return {
        value: qtd * 0.4 + res * 0.6,
        detail: `${e.qtdImagens} imagem(ns)${e.maiorLadoImagem ? `, até ${e.maiorLadoImagem}px` : ""}.`,
        estimated: true,
      };
    }
    case "novelty": {
      if (e.vezesPromovido === 0) return { value: 100, detail: "Nunca promovido." };
      const dias = e.diasDesdeUltimaPromocao ?? 0;
      return {
        value: clamp((dias / p.diasNovidade) * 100),
        detail: `Promovido ${e.vezesPromovido}× (último há ${dias} dias).`,
      };
    }
    case "performance": {
      if (e.scorePerformance == null) return { value: null, detail: "Sem performance histórica suficiente." };
      return { value: clamp(e.scorePerformance), detail: `Performance observada: ${Math.round(e.scorePerformance)}.` };
    }
  }
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function regrasDuras(e: EntradaScore): string[] {
  const falhas: string[] = [];
  if (e.disponivel === false) falhas.push("Produto indisponível.");
  if (!e.temImagemUtilizavel) falhas.push("Sem imagem utilizável.");
  if (e.emCooldownDeDescarte) falhas.push("Descartado recentemente (em cooldown).");
  if (e.categoriaProibida) falhas.push("Categoria proibida pelo administrador.");
  if (e.duplicadoDe) falhas.push("Duplicado de outro produto já acompanhado.");
  return falhas;
}

export function validarPesos(pesos: Partial<Record<string, number>>): { ok: boolean; soma: number; erro?: string } {
  let soma = 0;
  for (const f of FATORES) {
    const v = pesos[f];
    if (v == null || !Number.isFinite(v) || v < 0 || v > 100) {
      return { ok: false, soma, erro: `Peso inválido para "${FATOR_LABEL[f]}".` };
    }
    soma += v;
  }
  soma = Math.round(soma * 100) / 100;
  if (soma !== 100) return { ok: false, soma, erro: `Os pesos somam ${soma}%; precisam somar 100%.` };
  return { ok: true, soma };
}

export function calcularScore(
  e: EntradaScore,
  pesos: Pesos = PESOS_PADRAO,
  params: ParametrosScore = PARAMETROS_PADRAO,
): ResultadoScore {
  const total = FATORES.reduce((s, f) => s + Math.max(0, pesos[f] ?? 0), 0) || 1;
  const components: Componente[] = [];
  const missingData: Fator[] = [];
  let pontos = 0;
  let pesoComDado = 0;

  for (const f of FATORES) {
    const w = Math.max(0, pesos[f] ?? 0);
    const a = avaliar(f, e, params);
    const missing = a.value == null;
    if (missing && w > 0) missingData.push(f);
    const value = missing ? NEUTRO : a.value!;
    const contrib = (value * w) / total; // pontos na escala 0–100
    pontos += contrib;
    if (!missing) pesoComDado += w;
    components.push({
      key: f,
      label: FATOR_LABEL[f],
      weight: w,
      value: r1(value),
      points: r1(contrib),
      detail: a.detail,
      missing,
      ...(a.estimated ? { estimated: true } : {}),
    });
  }

  const hardRuleFailures = regrasDuras(e);
  const positives: string[] = [];
  const alerts: string[] = [...hardRuleFailures];
  for (const c of components) {
    if (c.weight === 0 || c.missing) continue;
    if (c.value >= 75) positives.push(`${c.label}: ${c.detail}`);
    else if (c.value < 30) alerts.push(`${c.label}: ${c.detail}`);
  }
  if (e.rating != null && (e.qtdAvaliacoes ?? 0) < 10) alerts.push("Poucas avaliações — confiança baixa na nota.");

  return {
    score: r1(clamp(pontos)),
    confidence: Math.round((pesoComDado / total) * 1000) / 1000,
    eligible: hardRuleFailures.length === 0,
    hardRuleFailures,
    components,
    positives,
    alerts,
    missingData,
  };
}

/**
 * Apelo visual estimado pela categoria — fallback quando não há IA. Palavras do
 * caminho da categoria (pt-BR) com afinidade conhecida com o Pinterest
 * (casa, decoração, organização, moda, beleza…). É estimativa e é marcada assim.
 */
const AFINIDADE: [RegExp, number][] = [
  [/decora|casa|m[oó]ve|jardim|organiza|cozinha|banheiro|ilumina|cama|mesa/i, 85],
  [/beleza|maquiagem|cuidado pessoal|moda|roupa|cal[cç]ado|acess[oó]rio|joia|rel[oó]gio|bolsa/i, 80],
  [/beb[eê]|infantil|brinquedo|festa|papelaria|artesanato/i, 75],
  [/esporte|fitness|pet|animais|viagem/i, 65],
  [/eletrodom[eé]stico|eletr[oô]nico|celular|inform[aá]tica|games|c[aâ]mera/i, 55],
  [/ferramenta|constru|autope[cç]a|ve[ií]culo|ind[uú]stria|agro/i, 35],
];

export function priorVisualPorCategoria(caminho: string[]): number | null {
  const texto = caminho.join(" › ");
  if (!texto) return null;
  for (const [re, v] of AFINIDADE) if (re.test(texto)) return v;
  return 50;
}
