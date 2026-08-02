import { describe, expect, it } from "vitest";
import { calcularCaminhos, type EntradaCalculo } from "@/lib/viagens/caminho";
import type { ProgramaViagem, TransferenciaViagem } from "@/lib/viagens/tipos";

/**
 * Testes do motor de caminho de milhas.
 *
 * Isto não é teste de cobertura — é a prova de que a conta está certa antes de
 * qualquer UI existir. Transferência de milhas é irreversível: um erro aqui sai
 * do bolso do usuário. Ver PLANO-VIAGENS.md §4.1 e §7.
 */

const HOJE = "2026-08-02";

function prog(slug: string, over: Partial<ProgramaViagem> = {}): ProgramaViagem {
  return {
    id: slug,
    slug,
    nome: slug,
    tipo: "aereo",
    pais: null,
    alianca: null,
    fonteSeatsAero: null,
    valorPorMilCents: null,
    observacoes: null,
    ativo: true,
    ...over,
  };
}

function transf(
  origemId: string,
  destinoId: string,
  over: Partial<TransferenciaViagem> = {},
): TransferenciaViagem {
  return {
    id: `${origemId}->${destinoId}`,
    origemId,
    destinoId,
    ratioOrigem: 1,
    ratioDestino: 1,
    bonusPercent: 0,
    bonusValidoAte: null,
    minimoTransferencia: 0,
    multiplo: 1,
    prazoDiasMin: 0,
    prazoDiasMax: 1,
    ativa: true,
    verificadoEm: HOJE,
    fonteUrl: null,
    observacoes: null,
    ...over,
  };
}

function calc(over: Partial<EntradaCalculo>): ReturnType<typeof calcularCaminhos> {
  return calcularCaminhos({
    programas: [],
    transferencias: [],
    saldos: [],
    alvo: { programaId: "alvo", milhas: 1000 },
    hoje: HOJE,
    ...over,
  });
}

describe("caso trivial: já tem milhas no programa alvo", () => {
  it("resolve com zero saltos e sem risco", () => {
    const r = calc({
      programas: [prog("smiles")],
      saldos: [{ programaId: "smiles", saldo: 80_000 }],
      alvo: { programaId: "smiles", milhas: 62_000 },
    });

    expect(r.viavel).toBe(true);
    expect(r.saldoNoAlvo).toBe(80_000);
    expect(r.caminhos[0]!.saltos).toBe(0);
    expect(r.caminhos[0]!.cobreSozinho).toBe(true);
    expect(r.caminhos[0]!.milhasConsumidas).toBe(62_000);
    expect(r.caminhos[0]!.avisos).toHaveLength(0);
  });

  it("não inventa cobertura quando o saldo no alvo é insuficiente e não há outra origem", () => {
    const r = calc({
      programas: [prog("smiles")],
      saldos: [{ programaId: "smiles", saldo: 10_000 }],
      alvo: { programaId: "smiles", milhas: 62_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.caminhos[0]!.cobreSozinho).toBe(false);
    expect(r.motivo).toMatch(/não cobre/i);
  });
});

describe("aritmética de um salto", () => {
  it("aplica ratio não-unitário (1000:800)", () => {
    const r = calc({
      programas: [prog("banco", { tipo: "banco" }), prog("aerea")],
      transferencias: [transf("banco", "aerea", { ratioOrigem: 1000, ratioDestino: 800 })],
      saldos: [{ programaId: "banco", saldo: 100_000 }],
      alvo: { programaId: "aerea", milhas: 8_000 },
    });

    const c = r.caminhos[0]!;
    expect(c.cobreSozinho).toBe(true);
    // 10.000 na origem × 0,8 = 8.000 no destino. Nem um a mais.
    expect(c.milhasConsumidas).toBe(10_000);
    expect(c.milhasEntregues).toBe(8_000);
  });

  it("aplica bônus vigente, respeitando o múltiplo da transferência", () => {
    const r = calc({
      programas: [prog("esfera", { tipo: "coalizao" }), prog("iberia")],
      transferencias: [
        transf("esfera", "iberia", {
          bonusPercent: 30,
          bonusValidoAte: "2026-08-15",
          multiplo: 1000,
        }),
      ],
      saldos: [{ programaId: "esfera", saldo: 100_000 }],
      alvo: { programaId: "iberia", milhas: 62_000 },
    });

    const c = r.caminhos[0]!;
    expect(c.passos[0]!.bonusAplicado).toBe(30);
    // 48.000 × 1,3 = 62.400 — e 47.000 × 1,3 = 61.100 não bastaria.
    expect(c.milhasConsumidas).toBe(48_000);
    expect(c.milhasEntregues).toBe(62_400);
  });

  it("acha o mínimo exato quando não há múltiplo travando", () => {
    const r = calc({
      programas: [prog("esfera", { tipo: "coalizao" }), prog("iberia")],
      transferencias: [
        transf("esfera", "iberia", { bonusPercent: 30, bonusValidoAte: "2026-08-15" }),
      ],
      saldos: [{ programaId: "esfera", saldo: 100_000 }],
      alvo: { programaId: "iberia", milhas: 62_000 },
    });

    // 47.693 × 1,3 = 62.000,9 → 62.000. Com 47.692 dá 61.999: falta 1 milha.
    // É exatamente o degrau que uma divisão simples (62.000 / 1,3) erraria.
    expect(r.caminhos[0]!.milhasConsumidas).toBe(47_693);
    expect(r.caminhos[0]!.milhasEntregues).toBe(62_000);
  });

  it("ignora bônus expirado e avisa que a conta mudou", () => {
    const r = calc({
      programas: [prog("esfera", { tipo: "coalizao" }), prog("iberia")],
      transferencias: [
        transf("esfera", "iberia", { bonusPercent: 30, bonusValidoAte: "2026-07-01" }),
      ],
      saldos: [{ programaId: "esfera", saldo: 100_000 }],
      alvo: { programaId: "iberia", milhas: 62_000 },
    });

    const c = r.caminhos[0]!;
    expect(c.passos[0]!.bonusAplicado).toBe(0);
    expect(c.milhasConsumidas).toBe(62_000);
    expect(c.avisos.some((a) => a.tipo === "bonus_expirado")).toBe(true);
  });

  it("avisa quando a conta depende de um bônus que está vencendo", () => {
    const r = calc({
      programas: [prog("esfera", { tipo: "coalizao" }), prog("iberia")],
      transferencias: [
        transf("esfera", "iberia", { bonusPercent: 30, bonusValidoAte: "2026-08-05" }),
      ],
      saldos: [{ programaId: "esfera", saldo: 100_000 }],
      alvo: { programaId: "iberia", milhas: 62_000 },
    });

    const aviso = r.caminhos[0]!.avisos.find((a) => a.tipo === "bonus_vencendo");
    expect(aviso).toBeDefined();
    expect(aviso?.mensagem).toContain("3 dia");
  });
});

describe("mínimos e múltiplos — onde a conta ingênua erra", () => {
  it("deixa a sobra parada quando o saldo não é múltiplo exato", () => {
    const r = calc({
      programas: [prog("livelo", { tipo: "coalizao" }), prog("smiles")],
      transferencias: [transf("livelo", "smiles", { multiplo: 1000 })],
      saldos: [{ programaId: "livelo", saldo: 15_500 }],
      alvo: { programaId: "smiles", milhas: 15_500 },
    });

    // Só dá para transferir 15.000: os 500 restantes não viajam.
    expect(r.viavel).toBe(false);
    expect(r.caminhos[0]!.milhasEntregues).toBe(15_000);
  });

  it("respeita o mínimo de transferência", () => {
    const r = calc({
      programas: [prog("livelo", { tipo: "coalizao" }), prog("smiles")],
      transferencias: [transf("livelo", "smiles", { minimoTransferencia: 10_000, multiplo: 1000 })],
      saldos: [{ programaId: "livelo", saldo: 5_000 }],
      alvo: { programaId: "smiles", milhas: 1_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.caminhos).toHaveLength(0);
  });

  it("arredonda para cima até o múltiplo, sem prometer o valor exato", () => {
    const r = calc({
      programas: [prog("livelo", { tipo: "coalizao" }), prog("smiles")],
      transferencias: [transf("livelo", "smiles", { multiplo: 1000 })],
      saldos: [{ programaId: "livelo", saldo: 50_000 }],
      alvo: { programaId: "smiles", milhas: 20_500 },
    });

    const c = r.caminhos[0]!;
    expect(c.milhasConsumidas).toBe(21_000);
    expect(c.milhasEntregues).toBe(21_000);
    expect(c.sobra).toBe(500);
  });
});

describe("cenário do plano: Esfera → Avios Iberia → British para emitir Finnair", () => {
  const programas = [
    prog("esfera", { nome: "Esfera", tipo: "coalizao", valorPorMilCents: 2200 }),
    prog("iberia", { nome: "Iberia Plus", alianca: "oneworld" }),
    prog("british", { nome: "British Airways", alianca: "oneworld" }),
  ];
  const transferencias = [
    transf("esfera", "iberia", {
      bonusPercent: 30,
      bonusValidoAte: "2026-08-15",
      multiplo: 1000,
      prazoDiasMin: 1,
      prazoDiasMax: 2,
    }),
    transf("iberia", "british", { prazoDiasMin: 0, prazoDiasMax: 1 }),
  ];

  it("monta o caminho de 2 saltos com a conta correta", () => {
    const r = calc({
      programas,
      transferencias,
      saldos: [{ programaId: "esfera", saldo: 90_000 }],
      alvo: { programaId: "british", milhas: 62_000 },
    });

    expect(r.viavel).toBe(true);
    const c = r.caminhos[0]!;
    expect(c.saltos).toBe(2);
    expect(c.cobreSozinho).toBe(true);
    expect(c.milhasConsumidas).toBe(48_000);
    expect(c.milhasEntregues).toBe(62_400);
    expect(c.prazoDiasMax).toBe(3);

    expect(c.passos[0]!).toMatchObject({
      origemNome: "Esfera",
      destinoNome: "Iberia Plus",
      milhasEntrada: 48_000,
      milhasSaida: 62_400,
      bonusAplicado: 30,
    });
    expect(c.passos[1]!).toMatchObject({
      origemNome: "Iberia Plus",
      destinoNome: "British Airways",
      milhasEntrada: 62_400,
      milhasSaida: 62_400,
    });
  });

  it("estima o custo em reais a partir do valor de referência da origem", () => {
    const r = calc({
      programas,
      transferencias,
      saldos: [{ programaId: "esfera", saldo: 90_000 }],
      alvo: { programaId: "british", milhas: 62_000 },
    });

    // 48.000 milhas × R$ 22,00 por mil = R$ 1.056,00
    expect(r.caminhos[0]!.custoEstimadoCents).toBe(105_600);
  });

  it("sem o bônus, o mesmo saldo deixa de cobrir a emissão", () => {
    const r = calc({
      programas,
      transferencias: [
        transf("esfera", "iberia", { multiplo: 1000 }),
        transf("iberia", "british"),
      ],
      saldos: [{ programaId: "esfera", saldo: 50_000 }],
      alvo: { programaId: "british", milhas: 62_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.caminhos[0]!.cobreSozinho).toBe(false);
  });
});

describe("escolha entre caminhos", () => {
  it("prefere o mais barato em reais quando a diferença é relevante", () => {
    const r = calc({
      programas: [
        prog("caro", { tipo: "coalizao", valorPorMilCents: 4000 }),
        prog("barato", { tipo: "coalizao", valorPorMilCents: 1000 }),
        prog("alvo"),
      ],
      transferencias: [transf("caro", "alvo"), transf("barato", "alvo")],
      saldos: [
        { programaId: "caro", saldo: 100_000 },
        { programaId: "barato", saldo: 100_000 },
      ],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.origemId).toBe("barato");
  });

  it("no empate técnico de custo, menos saltos vence — cada salto é irreversível", () => {
    const r = calc({
      programas: [
        prog("direto", { tipo: "coalizao", valorPorMilCents: 2000 }),
        prog("longo", { tipo: "coalizao", valorPorMilCents: 2000 }),
        prog("meio"),
        prog("alvo"),
      ],
      transferencias: [
        transf("direto", "alvo"),
        transf("longo", "meio"),
        transf("meio", "alvo"),
      ],
      saldos: [
        { programaId: "direto", saldo: 100_000 },
        { programaId: "longo", saldo: 100_000 },
      ],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.origemId).toBe("direto");
    expect(r.caminhos[0]!.saltos).toBe(1);
  });

  it("quem cobre sozinho vem antes de quem não cobre, mesmo custando mais", () => {
    const r = calc({
      programas: [
        prog("cobre", { tipo: "coalizao", valorPorMilCents: 5000 }),
        prog("naocobre", { tipo: "coalizao", valorPorMilCents: 100 }),
        prog("alvo"),
      ],
      transferencias: [transf("cobre", "alvo"), transf("naocobre", "alvo")],
      saldos: [
        { programaId: "cobre", saldo: 100_000 },
        { programaId: "naocobre", saldo: 5_000 },
      ],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.origemId).toBe("cobre");
    expect(r.caminhos[0]!.cobreSozinho).toBe(true);
  });
});

describe("combinação de origens", () => {
  it("junta programas quando nenhum cobre sozinho", () => {
    const r = calc({
      programas: [
        prog("a", { tipo: "coalizao", valorPorMilCents: 1000 }),
        prog("b", { tipo: "coalizao", valorPorMilCents: 2000 }),
        prog("alvo"),
      ],
      transferencias: [transf("a", "alvo"), transf("b", "alvo")],
      saldos: [
        { programaId: "a", saldo: 30_000 },
        { programaId: "b", saldo: 30_000 },
      ],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.viavel).toBe(true);
    expect(r.combinacao).not.toBeNull();
    expect(r.combinacao?.cobreAlvo).toBe(true);
    expect(r.combinacao?.milhasEntregues).toBe(50_000);
    // A origem mais eficiente entra primeiro e contribui o máximo que pode.
    expect(r.combinacao?.parcelas[0]!.caminho.origemId).toBe("a");
    expect(r.combinacao?.parcelas[0]!.contribuicao).toBe(30_000);
    expect(r.combinacao?.parcelas[1]!.contribuicao).toBe(20_000);
  });

  it("não propõe combinação quando alguém já cobre sozinho", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("alvo")],
      transferencias: [transf("a", "alvo")],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.combinacao).toBeNull();
  });

  it("admite a derrota quando nem tudo somado cobre", () => {
    const r = calc({
      programas: [
        prog("a", { tipo: "coalizao" }),
        prog("b", { tipo: "coalizao" }),
        prog("alvo"),
      ],
      transferencias: [transf("a", "alvo"), transf("b", "alvo")],
      saldos: [
        { programaId: "a", saldo: 10_000 },
        { programaId: "b", saldo: 10_000 },
      ],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.combinacao?.cobreAlvo).toBe(false);
    expect(r.motivo).toMatch(/somando/i);
  });
});

describe("avisos de curadoria", () => {
  it("marca aresta nunca verificada", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("alvo")],
      transferencias: [transf("a", "alvo", { verificadoEm: null })],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    const aviso = r.caminhos[0]!.avisos.find((a) => a.tipo === "nao_verificado");
    expect(aviso).toBeDefined();
    expect(aviso?.mensagem).toMatch(/nunca foi verificada/i);
  });

  it("marca curadoria velha (> 90 dias)", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("alvo")],
      transferencias: [transf("a", "alvo", { verificadoEm: "2026-01-01" })],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.avisos.some((a) => a.tipo === "dado_velho")).toBe(true);
  });

  it("não marca curadoria recente", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("alvo")],
      transferencias: [transf("a", "alvo", { verificadoEm: "2026-07-20" })],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.avisos.some((a) => a.tipo === "dado_velho")).toBe(false);
  });

  it("avisa sobre o risco acumulado de 3 saltos", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("b"), prog("c"), prog("alvo")],
      transferencias: [transf("a", "b"), transf("b", "c"), transf("c", "alvo")],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.caminhos[0]!.avisos.some((a) => a.tipo === "muitos_saltos")).toBe(true);
  });
});

describe("limites e robustez do grafo", () => {
  it("respeita o teto de saltos", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("b"), prog("c"), prog("alvo")],
      transferencias: [transf("a", "b"), transf("b", "c"), transf("c", "alvo")],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
      maxSaltos: 2,
    });

    expect(r.viavel).toBe(false);
    expect(r.caminhos).toHaveLength(0);
  });

  it("não entra em laço infinito com ciclos no grafo", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("b"), prog("alvo")],
      transferencias: [
        transf("a", "b"),
        transf("b", "a"),
        transf("b", "alvo"),
        transf("alvo", "b"),
      ],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.viavel).toBe(true);
    expect(r.caminhos[0]!.saltos).toBe(2);
  });

  it("ignora arestas e programas inativos", () => {
    const r = calc({
      programas: [prog("a", { tipo: "coalizao" }), prog("morto", { ativo: false }), prog("alvo")],
      transferencias: [transf("a", "alvo", { ativa: false }), transf("a", "morto")],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.motivo).toMatch(/não há caminho/i);
  });

  it("rejeita alvo inexistente sem estourar", () => {
    const r = calc({
      programas: [prog("a")],
      saldos: [{ programaId: "a", saldo: 90_000 }],
      alvo: { programaId: "fantasma", milhas: 50_000 },
    });

    expect(r.viavel).toBe(false);
    expect(r.motivo).toMatch(/não está cadastrado/i);
  });

  it("rejeita alvo com milhas zeradas", () => {
    const r = calc({
      programas: [prog("alvo")],
      saldos: [{ programaId: "alvo", saldo: 90_000 }],
      alvo: { programaId: "alvo", milhas: 0 },
    });

    expect(r.viavel).toBe(false);
  });

  it("escolhe a melhor rota quando há várias entre os mesmos dois programas", () => {
    const r = calc({
      programas: [
        prog("a", { tipo: "coalizao", valorPorMilCents: 2000 }),
        prog("atalho"),
        prog("alvo"),
      ],
      transferencias: [
        // Rota direta ruim (perde metade) vs. rota indireta 1:1.
        transf("a", "alvo", { ratioOrigem: 2, ratioDestino: 1 }),
        transf("a", "atalho"),
        transf("atalho", "alvo"),
      ],
      saldos: [{ programaId: "a", saldo: 200_000 }],
      alvo: { programaId: "alvo", milhas: 50_000 },
    });

    // A indireta consome 50.000; a direta consumiria 100.000.
    expect(r.caminhos[0]!.milhasConsumidas).toBe(50_000);
    expect(r.caminhos[0]!.saltos).toBe(2);
  });
});
