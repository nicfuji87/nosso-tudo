import { describe, expect, it } from "vitest";
import {
  custoRestanteCents,
  lotesExpirando,
  ordenarParaConsumo,
  planejarConsumo,
  planejarTransferencia,
  resumirLotes,
  type LoteMilhas,
} from "@/lib/viagens/custo";

/**
 * Testes da base de custo da milha.
 *
 * O número que sai daqui é o que responde "vale a pena usar milha ou pagar em
 * dinheiro?". Errar aqui faz o usuário queimar milha cara achando que é barata.
 */

const HOJE = "2026-08-02";

function lote(id: string, o: Partial<LoteMilhas> = {}): LoteMilhas {
  const quantidade = o.quantidade ?? 10_000;
  return {
    id,
    programaId: "livelo",
    quantidade,
    quantidadeRestante: o.quantidadeRestante ?? quantidade,
    custoCents: 0,
    origem: "compra",
    data: "2026-01-01",
    expiraEm: null,
    ...o,
  };
}

describe("custo do que resta", () => {
  it("é proporcional ao já consumido", () => {
    // R$200 por 10.000 milhas; metade gasta → resta R$100.
    const l = lote("a", { quantidade: 10_000, quantidadeRestante: 5_000, custoCents: 20_000 });
    expect(custoRestanteCents(l)).toBe(10_000);
  });

  it("lote de acúmulo custa zero e não polui a média", () => {
    const r = resumirLotes([
      lote("pago", { quantidade: 10_000, custoCents: 20_000 }), // R$20/mil
      lote("gratis", { quantidade: 10_000, custoCents: 0 }), // acúmulo
    ]);
    expect(r.saldo).toBe(20_000);
    expect(r.custoRestanteCents).toBe(20_000);
    // R$200 por 20.000 milhas = R$10 por mil.
    expect(r.custoPorMilCents).toBe(1_000);
  });

  it("carteira vazia não tem custo por mil (e não divide por zero)", () => {
    expect(resumirLotes([]).custoPorMilCents).toBeNull();
    expect(resumirLotes([lote("z", { quantidadeRestante: 0 })]).custoPorMilCents).toBeNull();
  });
});

describe("ordem de consumo", () => {
  it("o que vence primeiro sai primeiro, mesmo sendo mais novo", () => {
    const ordem = ordenarParaConsumo([
      lote("velho_sem_validade", { data: "2020-01-01", expiraEm: null }),
      lote("novo_vencendo", { data: "2026-07-01", expiraEm: "2026-09-01" }),
    ]);
    expect(ordem.map((l) => l.id)).toEqual(["novo_vencendo", "velho_sem_validade"]);
  });

  it("empatando validade, o mais antigo sai primeiro", () => {
    const ordem = ordenarParaConsumo([
      lote("b", { data: "2026-05-01", expiraEm: "2027-01-01" }),
      lote("a", { data: "2026-01-01", expiraEm: "2027-01-01" }),
    ]);
    expect(ordem.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("ignora lote zerado", () => {
    expect(ordenarParaConsumo([lote("z", { quantidadeRestante: 0 })])).toHaveLength(0);
  });
});

describe("plano de consumo", () => {
  it("atravessa vários lotes cobrando o custo certo de cada um", () => {
    const plano = planejarConsumo(
      [
        lote("caro", { quantidade: 10_000, custoCents: 20_000, expiraEm: "2026-09-01" }),
        lote("barato", { quantidade: 10_000, custoCents: 5_000, expiraEm: "2027-01-01" }),
      ],
      15_000,
    );

    expect(plano.faltou).toBe(0);
    expect(plano.atendido).toBe(15_000);
    // Todo o lote caro (R$200) + metade do barato (R$25) = R$225.
    expect(plano.custoTotalCents).toBe(22_500);
    expect(plano.consumos).toEqual([
      { loteId: "caro", quantidade: 10_000, custoCents: 20_000 },
      { loteId: "barato", quantidade: 5_000, custoCents: 2_500 },
    ]);
  });

  it("reporta o que faltou em vez de fingir que cobriu", () => {
    const plano = planejarConsumo([lote("a", { quantidade: 5_000 })], 12_000);
    expect(plano.atendido).toBe(5_000);
    expect(plano.faltou).toBe(7_000);
  });

  it("consumo parcial cobra só a fatia proporcional", () => {
    const plano = planejarConsumo(
      [lote("a", { quantidade: 10_000, custoCents: 30_000 })],
      3_000,
    );
    expect(plano.custoTotalCents).toBe(9_000);
  });
});

describe("transferência carrega o custo junto", () => {
  it("bônus de 100% derruba o custo por mil pela metade", () => {
    // 48.000 Livelo que custaram R$1.056 viram 96.000 Smiles.
    const plano = planejarTransferencia({
      lotesOrigem: [lote("l1", { quantidade: 48_000, custoCents: 105_600 })],
      programaDestinoId: "smiles",
      entrada: 48_000,
      saida: 96_000,
      data: HOJE,
    });

    expect(plano.viavel).toBe(true);
    expect(plano.custoTotalCents).toBe(105_600);
    // R$1.056 por 96.000 milhas = R$11,00 por mil (era R$22,00).
    expect(plano.custoPorMilDestinoCents).toBe(1_100);
    expect(plano.novosLotes).toHaveLength(1);
    expect(plano.novosLotes[0]).toMatchObject({
      programaId: "smiles",
      quantidade: 96_000,
      custoCents: 105_600,
      origem: "transferencia",
      loteOrigemId: "l1",
    });
  });

  it("gera um lote de destino por lote de origem, preservando a corrente", () => {
    const plano = planejarTransferencia({
      lotesOrigem: [
        lote("caro", { quantidade: 10_000, custoCents: 20_000, expiraEm: "2026-09-01" }),
        lote("gratis", { quantidade: 10_000, custoCents: 0, expiraEm: "2027-01-01" }),
      ],
      programaDestinoId: "smiles",
      entrada: 20_000,
      saida: 20_000,
      data: HOJE,
    });

    expect(plano.novosLotes).toHaveLength(2);
    expect(plano.novosLotes.map((l) => l.loteOrigemId)).toEqual(["caro", "gratis"]);
    expect(plano.novosLotes.map((l) => l.custoCents)).toEqual([20_000, 0]);
    // A soma das quantidades bate exatamente com a saída.
    expect(plano.novosLotes.reduce((s, l) => s + l.quantidade, 0)).toBe(20_000);
  });

  it("a soma dos lotes bate com a saída mesmo com divisão inexata", () => {
    const plano = planejarTransferencia({
      lotesOrigem: [
        lote("a", { quantidade: 3_000, custoCents: 6_000 }),
        lote("b", { quantidade: 3_000, custoCents: 3_000 }),
        lote("c", { quantidade: 3_000, custoCents: 0 }),
      ],
      programaDestinoId: "smiles",
      entrada: 9_000,
      saida: 11_701, // número feio de propósito
      data: HOJE,
    });

    expect(plano.novosLotes.reduce((s, l) => s + l.quantidade, 0)).toBe(11_701);
    // O custo total é preservado exatamente, sem perder centavo no rateio.
    expect(plano.novosLotes.reduce((s, l) => s + l.custoCents, 0)).toBe(9_000);
  });

  it("não transfere o que não tem", () => {
    const plano = planejarTransferencia({
      lotesOrigem: [lote("a", { quantidade: 5_000 })],
      programaDestinoId: "smiles",
      entrada: 20_000,
      saida: 20_000,
      data: HOJE,
    });

    expect(plano.viavel).toBe(false);
    expect(plano.novosLotes).toHaveLength(0);
  });

  it("milha de acúmulo continua custando zero depois de transferida", () => {
    const plano = planejarTransferencia({
      lotesOrigem: [lote("gratis", { quantidade: 10_000, custoCents: 0 })],
      programaDestinoId: "smiles",
      entrada: 10_000,
      saida: 10_000,
      data: HOJE,
    });
    expect(plano.custoPorMilDestinoCents).toBe(0);
  });
});

describe("expiração", () => {
  it("ordena por prejuízo, não por data — milha cara vence primeiro na lista", () => {
    const alertas = lotesExpirando(
      [
        lote("barato_urgente", {
          quantidade: 10_000,
          custoCents: 1_000,
          expiraEm: "2026-08-10",
        }),
        lote("caro_depois", {
          quantidade: 10_000,
          custoCents: 50_000,
          expiraEm: "2026-10-01",
        }),
      ],
      HOJE,
      90,
    );

    expect(alertas.map((a) => a.loteId)).toEqual(["caro_depois", "barato_urgente"]);
    expect(alertas[0]!.custoCents).toBe(50_000);
  });

  it("ignora o que vence fora da janela e o que não expira", () => {
    const alertas = lotesExpirando(
      [
        lote("longe", { expiraEm: "2027-12-01" }),
        lote("eterno", { expiraEm: null }),
      ],
      HOJE,
      90,
    );
    expect(alertas).toHaveLength(0);
  });

  it("conta os dias restantes corretamente", () => {
    const alertas = lotesExpirando([lote("a", { expiraEm: "2026-08-12" })], HOJE, 90);
    expect(alertas[0]!.diasRestantes).toBe(10);
  });
});
