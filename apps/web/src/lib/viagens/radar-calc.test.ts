import { describe, expect, it } from "vitest";
import {
  assentosPara,
  custearOferta,
  diasEntre,
  janelasDeBusca,
  montarCombinacoes,
  somarDias,
  type OfertaMilhas,
  type PrecoMilheiro,
} from "@/lib/viagens/radar-calc";

function oferta(p: Partial<OfertaMilhas> & Pick<OfertaMilhas, "origem" | "destino" | "data">): OfertaMilhas {
  return {
    id: `${p.origem}-${p.destino}-${p.data}-${p.programa ?? "smiles"}`,
    programa: "smiles",
    cabine: "economy",
    milhas: 60_000,
    taxasCents: 0,
    moedaTaxas: "USD",
    assentos: 9,
    direto: true,
    companhias: "G3",
    atualizadoEm: "2026-10-28T00:00:00Z",
    ...p,
  };
}

const precos: PrecoMilheiro = {
  porPrograma: {
    smiles: { cents: 2000, fonte: "carteira" }, // R$ 20 o milheiro
    qatar: { cents: 4400, fonte: "programa" }, // R$ 44 o milheiro (Avios)
  },
  padraoCents: 2500,
};

describe("custearOferta", () => {
  it("converte milhas pelo custo do milheiro e taxas em USD pelo câmbio", () => {
    const o = custearOferta(oferta({ origem: "BSB", destino: "MIA", data: "2026-11-21", milhas: 66_000, taxasCents: 5_000 }), precos, 5.5);
    // 66 × R$ 20 = R$ 1.320 ; US$ 50 × 5,5 = R$ 275
    expect(o.taxasBrlCents).toBe(27_500);
    expect(o.custoCents).toBe(132_000 + 27_500);
    expect(o.fonteCusto).toBe("carteira");
  });

  it("usa o custo padrão (estimado) para programa sem custo conhecido", () => {
    const o = custearOferta(oferta({ origem: "GRU", destino: "JFK", data: "2027-03-03", programa: "american", milhas: 18_000 }), precos, 5.5);
    expect(o.custoCents).toBe(45_000);
    expect(o.fonteCusto).toBe("estimado");
  });

  it("taxas em BRL não passam pelo câmbio", () => {
    const o = custearOferta(oferta({ origem: "BSB", destino: "GRU", data: "2027-03-22", milhas: 13_600, taxasCents: 3_454, moedaTaxas: "BRL" }), precos, 5.5);
    expect(o.taxasBrlCents).toBe(3_454);
  });
});

describe("assentosPara", () => {
  it("0 e null contam como desconhecido, não como lotado", () => {
    expect(assentosPara(oferta({ origem: "A", destino: "B", data: "2027-01-01", assentos: 0 }), 3)).toBe("desconhecido");
    expect(assentosPara(oferta({ origem: "A", destino: "B", data: "2027-01-01", assentos: null }), 3)).toBe("desconhecido");
  });
  it("sabe dizer quando não cabe a família", () => {
    expect(assentosPara(oferta({ origem: "A", destino: "B", data: "2027-01-01", assentos: 2 }), 3)).toBe("nao");
    expect(assentosPara(oferta({ origem: "A", destino: "B", data: "2027-01-01", assentos: 3 }), 3)).toBe("sim");
  });
});

describe("datas", () => {
  it("soma e mede dias sem fuso", () => {
    expect(somarDias("2027-02-27", 2)).toBe("2027-03-01");
    expect(diasEntre("2027-04-06", "2027-04-13")).toBe(7);
  });

  it("janelas: ida até fim − duração mínima, volta a partir de início + duração mínima, nada no passado", () => {
    expect(janelasDeBusca("2027-04-01", "2027-04-20", "2026-10-28", 6)).toEqual({
      ida: { de: "2027-04-01", ate: "2027-04-14" },
      volta: { de: "2027-04-07", ate: "2027-04-20" },
    });
    expect(janelasDeBusca("2026-10-01", "2026-11-30", "2026-10-28", null)).toEqual({
      ida: { de: "2026-10-29", ate: "2026-11-30" },
      volta: null,
    });
    expect(janelasDeBusca("2026-10-01", "2026-10-20", "2026-10-28", null)).toBeNull();
  });
});

describe("montarCombinacoes", () => {
  const opts = { pessoas: 3, duracaoMin: 6, duracaoMax: 8, precos, cambioUsdBrl: 5.5 };

  it("casa ida e volta dentro da duração e ordena pelo custo em R$", () => {
    const idas = [
      oferta({ origem: "GRU", destino: "MIA", data: "2027-04-06", milhas: 67_000 }),
      oferta({ origem: "GRU", destino: "MIA", data: "2027-04-07", milhas: 67_000 }),
    ];
    const voltas = [
      oferta({ origem: "MIA", destino: "GRU", data: "2027-04-13", milhas: 64_000 }),
      oferta({ origem: "MIA", destino: "GRU", data: "2027-04-20", milhas: 50_000 }), // 13–14 dias: fora
    ];
    const r = montarCombinacoes(idas, voltas, opts);
    expect(r).toHaveLength(2);
    expect(r[0]!.dias).toBe(7);
    expect(r[0]!.milhasPp).toBe(131_000);
    expect(r[0]!.custoPpCents).toBe(131 * 2000);
    expect(r.every((c) => c.volta?.data === "2027-04-13")).toBe(true);
  });

  it("mistura programas quando sai mais barato em R$, mesmo com mais milhas no total", () => {
    const idas = [
      oferta({ origem: "GRU", destino: "JFK", data: "2027-03-08", programa: "qatar", milhas: 28_500 }),
      oferta({ origem: "GRU", destino: "JFK", data: "2027-03-08", programa: "smiles", milhas: 65_000 }),
    ];
    const voltas = [oferta({ origem: "JFK", destino: "GRU", data: "2027-03-15", programa: "smiles", milhas: 74_000 })];
    const melhor = montarCombinacoes(idas, voltas, opts)[0]!;
    // Qatar: 28,5 × 44 = R$ 1.254 < Smiles: 65 × 20 = R$ 1.300
    expect(melhor.ida.programa).toBe("qatar");
    expect(melhor.programas).toEqual(["qatar", "smiles"]);
  });

  it("descarta voo onde sabidamente não cabem todos", () => {
    const idas = [oferta({ origem: "GRU", destino: "DOH", data: "2027-07-04", assentos: 2 })];
    const voltas = [oferta({ origem: "DOH", destino: "GRU", data: "2027-07-11" })];
    expect(montarCombinacoes(idas, voltas, opts)).toEqual([]);
  });

  it("assento desconhecido em uma perna deixa a combinação como 'desconhecido'", () => {
    const idas = [oferta({ origem: "GRU", destino: "MIA", data: "2027-04-06", assentos: null })];
    const voltas = [oferta({ origem: "MIA", destino: "GRU", data: "2027-04-13", assentos: 7 })];
    expect(montarCombinacoes(idas, voltas, opts)[0]!.assentos).toBe("desconhecido");
  });

  it("aceita open-jaw, mas marca que os aeroportos não fecham", () => {
    const idas = [oferta({ origem: "BSB", destino: "MIA", data: "2026-11-21", milhas: 66_000 })];
    const voltas = [oferta({ origem: "MCO", destino: "BSB", data: "2026-11-28", milhas: 60_000 })];
    const c = montarCombinacoes(idas, voltas, opts)[0]!;
    expect(c.mesmoAeroporto).toBe(false);
  });

  it("prefere fechar o mesmo par de aeroportos quando não custa mais", () => {
    const idas = [oferta({ origem: "BSB", destino: "MIA", data: "2026-11-21" })];
    const voltas = [
      oferta({ origem: "MCO", destino: "BSB", data: "2026-11-28", milhas: 60_000 }),
      oferta({ origem: "MIA", destino: "BSB", data: "2026-11-28", milhas: 60_000 }),
    ];
    expect(montarCombinacoes(idas, voltas, opts)[0]!.mesmoAeroporto).toBe(true);
  });

  it("só ida: a mais barata por data", () => {
    const idas = [
      oferta({ origem: "GRU", destino: "DOH", data: "2027-07-04", programa: "qatar", milhas: 35_000 }),
      oferta({ origem: "GRU", destino: "DOH", data: "2027-07-04", programa: "smiles", milhas: 120_000 }),
      oferta({ origem: "GRU", destino: "DOH", data: "2027-07-05", programa: "qatar", milhas: 70_000 }),
    ];
    const r = montarCombinacoes(idas, [], { pessoas: 3, precos, cambioUsdBrl: 5.5 });
    expect(r.map((c) => c.ida.data)).toEqual(["2027-07-04", "2027-07-05"]);
    expect(r[0]!.volta).toBeNull();
  });
});
