import { describe, expect, it } from "vitest";
import {
  agregarMinimos,
  avaliarPromocoesDinheiro,
  avaliarPromocoesMilhas,
  chaveHistorico,
  descontoPct,
  mediana,
  referenciaPara,
} from "@/lib/viagens/promocoes-calc";
import { expandirLocais } from "@/lib/viagens/aeroportos";
import type { OfertaMilhas } from "@/lib/viagens/radar-calc";

function oferta(p: Partial<OfertaMilhas> & Pick<OfertaMilhas, "destino" | "data" | "milhas">): OfertaMilhas {
  return {
    id: `${p.destino}-${p.data}-${p.milhas}`,
    origem: "GRU",
    programa: "smiles",
    cabine: "economy",
    taxasCents: 0,
    moedaTaxas: "USD",
    assentos: 9,
    direto: false,
    companhias: "AV",
    atualizadoEm: "2026-10-28T00:00:00Z",
    ...p,
  };
}

describe("estatística básica", () => {
  it("mediana ignora zeros e trata par/ímpar", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(3); // (2+3)/2 = 2,5 → arredonda
    expect(mediana([0, 0])).toBeNull();
  });
  it("desconto com uma casa", () => {
    expect(descontoPct(67_000, 100_000)).toBe(33);
    expect(descontoPct(110_000, 100_000)).toBe(-10);
  });
});

describe("agregarMinimos", () => {
  it("fica com o menor preço por rota e mês, contando as datas", () => {
    const r = agregarMinimos([
      oferta({ destino: "MIA", data: "2027-04-06", milhas: 67_000 }),
      oferta({ destino: "MIA", data: "2027-04-20", milhas: 60_000 }),
      oferta({ destino: "MIA", data: "2027-05-02", milhas: 90_000 }),
    ]);
    const abril = r.find((m) => m.mesVoo === "2027-04-01")!;
    expect(abril.milhasMin).toBe(60_000);
    expect(abril.n).toBe(2);
    expect(abril.oferta.data).toBe("2027-04-20");
    expect(r).toHaveLength(2);
  });
});

describe("referenciaPara", () => {
  it("prefere o histórico quando tem dias suficientes", () => {
    expect(referenciaPara([100, 100, 90, 110, 100], [10, 10, 10])).toEqual({ valor: 100, fonte: "historico" });
  });
  it("com histórico curto, compara com os outros meses de hoje", () => {
    expect(referenciaPara([100], [120, 140, 130])).toEqual({ valor: 130, fonte: "mercado_hoje" });
  });
  it("sem base nenhuma, não inventa referência", () => {
    expect(referenciaPara([100], [120])).toBeNull();
  });
});

describe("avaliarPromocoesMilhas", () => {
  const opts = { descontoMinimoPct: 25, pessoas: 3 };

  it("acha o mês barato da rota pelo contraste com os outros meses", () => {
    const minimos = agregarMinimos([
      oferta({ destino: "JFK", data: "2027-03-03", milhas: 65_000 }),
      oferta({ destino: "JFK", data: "2027-05-03", milhas: 120_000 }),
      oferta({ destino: "JFK", data: "2027-06-03", milhas: 125_000 }),
      oferta({ destino: "JFK", data: "2027-07-03", milhas: 130_000 }),
    ]);
    const p = avaliarPromocoesMilhas(minimos, new Map(), opts)[0]!;
    expect(p.minimo.mesVoo).toBe("2027-03-01");
    expect(p.referencia.fonte).toBe("mercado_hoje");
    expect(p.descontoPct).toBeGreaterThanOrEqual(45);
  });

  it("usa o histórico gravado e respeita o desconto mínimo", () => {
    const minimos = agregarMinimos([oferta({ destino: "MIA", data: "2027-04-06", milhas: 80_000 })]);
    const hist = new Map([[chaveHistorico("GRU", "MIA", "smiles", "economy", "2027-04-01"), [100_000, 100_000, 100_000, 100_000, 100_000]]]);
    expect(avaliarPromocoesMilhas(minimos, hist, opts)).toEqual([]); // 20% < 25%
    const p = avaliarPromocoesMilhas(minimos, hist, { ...opts, descontoMinimoPct: 15 })[0]!;
    expect(p.descontoPct).toBe(20);
    expect(p.referencia.fonte).toBe("historico");
  });

  it("penaliza quando sabidamente não cabe a família", () => {
    const base = [
      oferta({ destino: "LIS", data: "2027-05-01", milhas: 120_000 }),
      oferta({ destino: "LIS", data: "2027-06-01", milhas: 120_000 }),
      oferta({ destino: "LIS", data: "2027-07-01", milhas: 120_000 }),
    ];
    const cabe = avaliarPromocoesMilhas(agregarMinimos([...base, oferta({ destino: "LIS", data: "2027-03-01", milhas: 60_000, assentos: 9 })]), new Map(), opts)[0]!;
    const naoCabe = avaliarPromocoesMilhas(agregarMinimos([...base, oferta({ destino: "LIS", data: "2027-03-01", milhas: 60_000, assentos: 1 })]), new Map(), opts)[0]!;
    expect(cabe.score).toBeGreaterThan(naoCabe.score);
  });
});

describe("avaliarPromocoesDinheiro", () => {
  it("sem histórico ordena pelo preço e não inventa desconto", () => {
    const r = avaliarPromocoesDinheiro(
      [
        { origem: "BSB", destino: "MIA", destinoNome: "Miami", dataIda: "2027-03-01", dataVolta: null, precoCents: 300_000, paradas: 0, companhia: "G3" },
        { origem: "BSB", destino: "LIS", destinoNome: "Lisboa", dataIda: "2027-03-01", dataVolta: null, precoCents: 250_000, paradas: 1, companhia: "TP" },
      ],
      new Map(),
      { descontoMinimoPct: 25 },
    );
    expect(r.map((p) => p.oferta.destino)).toEqual(["LIS", "MIA"]);
    expect(r[0]!.descontoPct).toBeNull();
  });
});

describe("expandirLocais", () => {
  it("aceita IATA, grupos com ou sem acento e aponta o que não reconhece", () => {
    const r = expandirLocais("japão, mia, Xyzw");
    expect(r.aeroportos).toEqual(["NRT", "HND", "KIX", "NGO", "MIA"]);
    expect(r.invalidos).toEqual(["Xyzw"]);
  });
});
