import { describe, expect, it } from "vitest";
import {
  conferirSaldo,
  planejarImportacao,
  precificarEntrada,
  regraParaMovimento,
  type MovimentoExtrato,
  type RegraPreco,
} from "@/lib/viagens/extrato";

/**
 * Testes da importação de extrato, montados sobre os EXTRATOS REAIS do Nicolas
 * (Livelo e LATAM Pass, ago/2026). Números fictícios não pegariam os casos que
 * importam: assinatura que precifica, acúmulo que é de graça mesmo, e resgate
 * cujo custo só aparece quando se sabe de onde a milha veio.
 */

// Clube Livelo Top 20.000: R$ 9.598,80/ano rendendo 340.000 pontos/ano.
// 240.000 de assinatura (20.000 × 12) + 100.000 de bônus (25.000 × 4).
const CLUBE_LIVELO: RegraPreco = {
  assinaturaId: "assin-livelo",
  padraoExtrato: "Clube Livelo",
  custoPorMilCents: 2823, // R$ 28,23 por mil
  inicio: "2025-09-01",
  fim: null,
};

function mov(o: Partial<MovimentoExtrato> & { pontos: number }): MovimentoExtrato {
  return {
    data: "2026-08-11",
    tipo: "acumulo",
    parceiro: null,
    descricao: null,
    ...o,
  };
}

describe("regra de preço da assinatura", () => {
  it("casa a linha do extrato com a assinatura, ignorando caixa e acento", () => {
    const r = regraParaMovimento(
      mov({ pontos: 20_000, parceiro: "CLUBE LIVELO" }),
      [CLUBE_LIVELO],
    );
    expect(r?.assinaturaId).toBe("assin-livelo");
  });

  it("não precifica movimento anterior ao início da assinatura", () => {
    const r = regraParaMovimento(
      mov({ pontos: 20_000, parceiro: "Clube Livelo", data: "2024-01-01" }),
      [CLUBE_LIVELO],
    );
    expect(r).toBeNull();
  });

  it("não precifica movimento posterior ao fim da assinatura", () => {
    const encerrada: RegraPreco = { ...CLUBE_LIVELO, fim: "2026-01-01" };
    const r = regraParaMovimento(
      mov({ pontos: 20_000, parceiro: "Clube Livelo", data: "2026-08-11" }),
      [encerrada],
    );
    expect(r).toBeNull();
  });

  it("parceiro que não é da assinatura não casa", () => {
    const r = regraParaMovimento(
      mov({ pontos: 13, parceiro: "UBER DO BRASIL" }),
      [CLUBE_LIVELO],
    );
    expect(r).toBeNull();
  });
});

describe("preço de cada tipo de entrada", () => {
  it("crédito mensal do Clube custa o rateio da assinatura", () => {
    const p = precificarEntrada(mov({ pontos: 20_000, parceiro: "Clube Livelo" }), [
      CLUBE_LIVELO,
    ]);
    expect(p.fonte).toBe("assinatura");
    // 20.000 × R$ 28,23/mil = R$ 564,60
    expect(p.custoCents).toBe(56_460);
  });

  it("bônus trimestral também é pago pela assinatura", () => {
    const p = precificarEntrada(
      mov({ pontos: 25_000, tipo: "bonus", parceiro: "Clube Livelo" }),
      [CLUBE_LIVELO],
    );
    expect(p.fonte).toBe("assinatura");
    // 25.000 × R$ 28,23/mil = R$ 705,75
    expect(p.custoCents).toBe(70_575);
  });

  it("acúmulo por gasto (Uber) é de graça de verdade, não dado faltando", () => {
    const p = precificarEntrada(mov({ pontos: 13, parceiro: "UBER DO BRASIL" }), [
      CLUBE_LIVELO,
    ]);
    expect(p.fonte).toBe("gratis");
    expect(p.custoCents).toBe(0);
  });

  it("transferência recebida fica DESCONHECIDA — o custo vem da origem", () => {
    // Zerar aqui sujaria a média para baixo: a milha custou algo, só que no
    // outro programa. Marcar como desconhecida força o usuário a completar.
    const p = precificarEntrada(
      mov({ pontos: 43_750, tipo: "transferencia_entrada", parceiro: "Le Club AccorHotels" }),
      [CLUBE_LIVELO],
    );
    expect(p.fonte).toBe("desconhecido");
  });
});

describe("importação do extrato real da Livelo", () => {
  // Recorte fiel do extrato: um ano de Clube + Uber + os três resgates.
  const movimentos: MovimentoExtrato[] = [
    // Clube: 12 créditos mensais de 20.000
    ...[
      "2025-09-11", "2025-10-11", "2025-11-11", "2025-12-11",
      "2026-01-11", "2026-02-11", "2026-03-11", "2026-04-11",
      "2026-05-11", "2026-06-11", "2026-07-11", "2026-08-11",
    ].map((data) => mov({ data, pontos: 20_000, parceiro: "Clube Livelo" })),
    // Clube: 4 bônus trimestrais de 25.000
    ...["2025-11-11", "2026-02-11", "2026-05-11", "2026-08-11"].map((data) =>
      mov({ data, pontos: 25_000, tipo: "bonus", parceiro: "Clube Livelo" }),
    ),
    // Uber: migalhas de gasto
    mov({ data: "2026-05-19", pontos: 13, parceiro: "UBER DO BRASIL" }),
    mov({ data: "2026-07-02", pontos: 3, parceiro: "UBER DO BRASIL" }),
    // Resgates (saídas para outros programas)
    mov({ data: "2025-09-09", pontos: -200_000, tipo: "resgate", parceiro: "Smiles" }),
    mov({ data: "2025-11-27", pontos: -175_000, tipo: "resgate", parceiro: "AccorHotels" }),
    mov({ data: "2026-03-05", pontos: -100_000, tipo: "resgate", parceiro: "Azul" }),
  ];

  const plano = planejarImportacao({
    programaId: "livelo",
    movimentos,
    regras: [CLUBE_LIVELO],
  });

  it("soma as entradas do ano exatamente como o plano promete", () => {
    // 240.000 de assinatura + 100.000 de bônus + 16 do Uber
    expect(plano.totalEntrada).toBe(340_016);
  });

  it("o custo total das entradas bate com a anuidade paga", () => {
    // R$ 9.598,80 é a anuidade; o rateio reproduz isso com erro de centavos.
    expect(plano.custoTotalCents).toBeGreaterThan(959_000);
    expect(plano.custoTotalCents).toBeLessThan(960_500);
  });

  it("Uber entra sem custo e não infla a média", () => {
    const uber = plano.lotes.filter((l) => l.descricao === "UBER DO BRASIL");
    expect(uber).toHaveLength(2);
    expect(uber.every((l) => l.custoCents === 0)).toBe(true);
  });

  it("contabiliza os três resgates", () => {
    expect(plano.totalSaida).toBe(475_000);
    expect(plano.saidas).toHaveLength(3);
  });

  it("resgate que acontece antes de haver saldo não inventa custo", () => {
    // O resgate de 09/09/2025 é anterior ao primeiro crédito (11/09/2025):
    // no recorte do extrato ele sai do saldo que já existia antes da janela.
    const primeiro = plano.saidas[0]!;
    expect(primeiro.data).toBe("2025-09-09");
    expect(primeiro.custoCents).toBe(0);
  });

  it("precifica o resgate com o custo real das milhas consumidas", () => {
    // O de 05/03/2026 já encontra créditos do Clube acumulados.
    const azul = plano.saidas.find((s) => s.descricao === "Azul")!;
    expect(azul.quantidade).toBe(100_000);
    expect(azul.custoCents).toBeGreaterThan(0);
  });

  it("nenhuma entrada fica com custo desconhecido neste extrato", () => {
    expect(plano.semCusto).toHaveLength(0);
  });
});

describe("conferência com o saldo declarado", () => {
  const plano = planejarImportacao({
    programaId: "livelo",
    movimentos: [
      mov({ data: "2026-01-11", pontos: 20_000, parceiro: "Clube Livelo" }),
      mov({ data: "2026-02-11", pontos: -5_000, tipo: "resgate", parceiro: "Azul" }),
    ],
    regras: [CLUBE_LIVELO],
  });

  it("deduz o saldo que já existia antes da janela do extrato", () => {
    // Movimentos rendem 15.000, mas a tela diz 273.820: a diferença é o que
    // já havia antes — e isso é normal, não erro.
    const c = conferirSaldo(plano, 273_820);
    expect(c.saldoMovimentos).toBe(15_000);
    expect(c.saldoInicialImplicito).toBe(258_820);
    expect(c.precisaSaldoInicial).toBe(true);
  });

  it("não pede saldo inicial quando o extrato explica tudo", () => {
    const c = conferirSaldo(plano, 15_000);
    expect(c.precisaSaldoInicial).toBe(false);
  });
});
