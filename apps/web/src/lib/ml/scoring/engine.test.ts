import { describe, expect, it } from "vitest";
import {
  calcularScore,
  FATORES,
  PESOS_PADRAO,
  priorVisualPorCategoria,
  validarPesos,
  type EntradaScore,
} from "./engine";

const base: EntradaScore = {
  disponivel: true,
  temImagemUtilizavel: true,
  emCooldownDeDescarte: false,
  categoriaProibida: false,
  posicaoRanking: 1,
  tamanhoListaRanking: 20,
  variacaoRanking: 5,
  novoNoRanking: false,
  casaComTendencia: true,
  temHistorico: true,
  rating: 4.8,
  qtdAvaliacoes: 2500,
  preco: 120,
  precoOriginal: 160,
  descontoPct: 25,
  comissaoPct: 10,
  qtdImagens: 8,
  maiorLadoImagem: 1200,
  ia: { pinterestFit: 90, apeloVisual: 85, qualidadeImagem: 90 },
  priorVisualCategoria: 85,
  vezesPromovido: 0,
  diasDesdeUltimaPromocao: null,
  scorePerformance: null,
};

describe("calcularScore", () => {
  it("produto forte tem score alto, confiança alta e decomposição completa", () => {
    const r = calcularScore(base);
    expect(r.eligible).toBe(true);
    expect(r.score).toBeGreaterThan(80);
    expect(r.components).toHaveLength(FATORES.length);
    // performance tem peso 0 e não conta como faltante
    expect(r.missingData).toEqual([]);
    expect(r.confidence).toBe(1);
    expect(r.positives.length).toBeGreaterThan(3);
  });

  it("os pontos dos componentes somam o score", () => {
    const r = calcularScore(base);
    const soma = r.components.reduce((s, c) => s + c.points, 0);
    expect(Math.abs(soma - r.score)).toBeLessThan(0.6);
  });

  it("dado faltante entra neutro e derruba a confiança (sem inflar por renormalização)", () => {
    const so = calcularScore({
      ...base,
      variacaoRanking: null,
      temHistorico: false,
      casaComTendencia: false,
      ia: null,
      priorVisualCategoria: null,
      rating: null,
      comissaoPct: null,
    });
    expect(so.missingData).toEqual(expect.arrayContaining(["trend", "pinterest_fit", "reviews", "commission"]));
    expect(so.confidence).toBeLessThan(0.6);
    expect(so.score).toBeLessThan(calcularScore(base).score);
    const pf = so.components.find((c) => c.key === "pinterest_fit")!;
    expect(pf.value).toBe(50);
    expect(pf.missing).toBe(true);
  });

  it("regras duras tornam inelegível mas mantêm a explicação", () => {
    const r = calcularScore({ ...base, disponivel: false, categoriaProibida: true });
    expect(r.eligible).toBe(false);
    expect(r.hardRuleFailures).toEqual(["Produto indisponível.", "Categoria proibida pelo administrador."]);
    expect(r.alerts).toEqual(expect.arrayContaining(["Produto indisponível."]));
    expect(r.score).toBeGreaterThan(0);
  });

  it("posição 1 vale mais que a última do ranking", () => {
    const top = calcularScore({ ...base, posicaoRanking: 1 }).components.find((c) => c.key === "bestseller_rank")!;
    const fim = calcularScore({ ...base, posicaoRanking: 20 }).components.find((c) => c.key === "bestseller_rank")!;
    expect(top.value).toBe(100);
    expect(fim.value).toBe(10);
  });

  it("poucas avaliações com nota 5 não superam muitas com 4.7 (prior bayesiano)", () => {
    const poucas = calcularScore({ ...base, rating: 5, qtdAvaliacoes: 2 }).components.find((c) => c.key === "reviews")!;
    const muitas = calcularScore({ ...base, rating: 4.7, qtdAvaliacoes: 3000 }).components.find((c) => c.key === "reviews")!;
    expect(muitas.value).toBeGreaterThan(poucas.value);
  });

  it("novidade cai para produto promovido recentemente", () => {
    const r = calcularScore({ ...base, vezesPromovido: 2, diasDesdeUltimaPromocao: 6 });
    expect(r.components.find((c) => c.key === "novelty")!.value).toBe(10);
  });

  it("pesos zerados no fator não afetam o score", () => {
    const pesos = { ...PESOS_PADRAO, discount: 0, novelty: 10 };
    const a = calcularScore({ ...base, descontoPct: 0 }, pesos);
    const b = calcularScore({ ...base, descontoPct: 50 }, pesos);
    expect(a.score).toBe(b.score);
  });
});

describe("validarPesos", () => {
  it("exige soma 100", () => {
    expect(validarPesos(PESOS_PADRAO).ok).toBe(true);
    const r = validarPesos({ ...PESOS_PADRAO, trend: 30 });
    expect(r.ok).toBe(false);
    expect(r.soma).toBe(115);
  });
  it("recusa negativo ou faltante", () => {
    expect(validarPesos({ ...PESOS_PADRAO, trend: -1 }).ok).toBe(false);
    const { trend: _t, ...sem } = PESOS_PADRAO;
    expect(validarPesos(sem).ok).toBe(false);
  });
});

describe("priorVisualPorCategoria", () => {
  it("casa/decoração rende mais que ferramentas", () => {
    expect(priorVisualPorCategoria(["Casa, Móveis e Decoração", "Organização"])).toBe(85);
    expect(priorVisualPorCategoria(["Ferramentas"])).toBe(35);
    expect(priorVisualPorCategoria([])).toBeNull();
  });
});
