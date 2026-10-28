import { describe, expect, it } from "vitest";
import { calcularMilheiro } from "@/lib/viagens/milheiro";
import type { ProgramaViagem, TransferenciaViagem } from "@/lib/viagens/tipos";

function prog(id: string, fonte: string | null, valor: number | null): ProgramaViagem {
  return {
    id,
    slug: id,
    nome: id,
    tipo: fonte ? "aereo" : "coalizao",
    pais: "BR",
    alianca: null,
    fonteSeatsAero: fonte,
    valorPorMilCents: valor,
    observacoes: null,
    ativo: true,
  };
}

function aresta(origemId: string, destinoId: string, ratioOrigem: number, ratioDestino: number, bonus = 0): TransferenciaViagem {
  return {
    id: `${origemId}-${destinoId}`,
    origemId,
    destinoId,
    ratioOrigem,
    ratioDestino,
    bonusPercent: bonus,
    bonusValidoAte: null,
    minimoTransferencia: 1000,
    multiplo: 1000,
    prazoDiasMin: 1,
    prazoDiasMax: 2,
    ativa: true,
    verificadoEm: null,
    fonteUrl: null,
    observacoes: null,
  };
}

const programas = [
  prog("esfera", null, 2200),
  prog("livelo", null, 2200),
  prog("iberia", null, null),
  prog("qatar", "qatar", null),
  prog("smiles", "smiles", 2000),
  prog("flyingblue", "flyingblue", null),
  prog("american", "american", null),
];
const transferencias = [
  aresta("esfera", "iberia", 2, 1), // 2:1
  aresta("iberia", "qatar", 1, 1), // 1:1
  aresta("livelo", "smiles", 1, 1),
  aresta("livelo", "flyingblue", 3.5, 1),
];

describe("calcularMilheiro", () => {
  it("deriva o custo do Avios pela transferência a partir do que a família tem", () => {
    const { precos, alcancaveis } = calcularMilheiro({
      programas,
      transferencias,
      saldos: new Map([["esfera", 17_000], ["livelo", 362_893]]),
      custoCarteira: new Map(),
      hoje: "2026-10-28",
    });
    // Esfera R$ 22/mil, 2:1 → Avios R$ 44/mil (2 saltos: esfera → iberia → qatar)
    expect(precos.porPrograma.qatar).toEqual({ cents: 4400, fonte: "programa" });
    // Livelo 3,5:1 → Flying Blue R$ 77/mil
    expect(precos.porPrograma.flyingblue?.cents).toBe(7700);
    expect(alcancaveis.sort()).toEqual(["flyingblue", "qatar", "smiles"]);
    expect(alcancaveis).not.toContain("american");
  });

  it("custo real da carteira vence a referência do programa", () => {
    const { precos } = calcularMilheiro({
      programas,
      transferencias,
      saldos: new Map([["smiles", 239_445]]),
      custoCarteira: new Map([["smiles", 1500]]),
      hoje: "2026-10-28",
    });
    expect(precos.porPrograma.smiles).toEqual({ cents: 1500, fonte: "carteira" });
  });

  it("bônus vigente barateia o milheiro derivado", () => {
    const { precos } = calcularMilheiro({
      programas,
      transferencias: [aresta("livelo", "smiles", 1, 1, 100)],
      saldos: new Map([["livelo", 100_000]]),
      custoCarteira: new Map(),
      hoje: "2026-10-28",
    });
    expect(precos.porPrograma.smiles?.cents).toBe(1100);
  });
});
