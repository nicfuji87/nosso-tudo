/**
 * Custo real da milha — base de custo por lote de aquisição.
 *
 * A pergunta que este módulo responde é "quanto me custou a milha que eu vou
 * gastar?". Não é estimativa de mercado: é o que saiu do seu bolso, rastreado
 * por lote, consumido na ordem certa e propagado através das transferências.
 *
 * Módulo PURO (sem I/O, sem relógio global) — é matemática de dinheiro, e
 * matemática de dinheiro precisa de teste, não de confiança.
 */

export const ORIGENS_LOTE = [
  "compra",
  "transferencia",
  "bonus",
  "acumulo",
  "promocao",
  "ajuste",
  "estorno",
] as const;
export type OrigemLote = (typeof ORIGENS_LOTE)[number];

export const LABEL_ORIGEM_LOTE: Record<OrigemLote, string> = {
  compra: "Compra de pontos",
  transferencia: "Transferência recebida",
  bonus: "Bônus",
  acumulo: "Acúmulo (gasto/voo)",
  promocao: "Promoção",
  ajuste: "Ajuste manual",
  estorno: "Estorno",
};

export interface LoteMilhas {
  id: string;
  programaId: string;
  quantidade: number;
  quantidadeRestante: number;
  /** Custo da quantidade ORIGINAL, em centavos de BRL. */
  custoCents: number;
  origem: OrigemLote;
  /** ISO date (YYYY-MM-DD). */
  data: string;
  expiraEm: string | null;
}

/** Custo do que ainda resta no lote — proporcional ao já consumido. */
export function custoRestanteCents(lote: LoteMilhas): number {
  if (lote.quantidade <= 0) return 0;
  return Math.round((lote.custoCents * lote.quantidadeRestante) / lote.quantidade);
}

export interface ResumoCarteira {
  saldo: number;
  custoRestanteCents: number;
  /** Centavos por 1.000 milhas. null quando não há saldo. */
  custoPorMilCents: number | null;
}

/** Saldo e custo médio ponderado das milhas que ainda restam. */
export function resumirLotes(lotes: LoteMilhas[]): ResumoCarteira {
  let saldo = 0;
  let custo = 0;
  for (const l of lotes) {
    if (l.quantidadeRestante <= 0) continue;
    saldo += l.quantidadeRestante;
    custo += custoRestanteCents(l);
  }
  return {
    saldo,
    custoRestanteCents: custo,
    custoPorMilCents: saldo > 0 ? Math.round((custo / saldo) * 1000) : null,
  };
}

// ---------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------

/**
 * Ordem de consumo: o que VENCE primeiro sai primeiro; empatando, o mais
 * antigo.
 *
 * Não é FIFO puro de propósito. Milha vence, e deixar vencer um lote enquanto
 * se gasta outro mais novo é perda pura — mesmo que o lote velho tenha custado
 * menos. Lote sem validade vai para o fim da fila.
 */
export function ordenarParaConsumo(lotes: LoteMilhas[]): LoteMilhas[] {
  return [...lotes]
    .filter((l) => l.quantidadeRestante > 0)
    .sort((a, b) => {
      if (a.expiraEm !== b.expiraEm) {
        if (a.expiraEm === null) return 1;
        if (b.expiraEm === null) return -1;
        return a.expiraEm.localeCompare(b.expiraEm);
      }
      return a.data.localeCompare(b.data);
    });
}

export interface ConsumoLote {
  loteId: string;
  quantidade: number;
  /** Fatia do custo do lote que sai junto com essas milhas. */
  custoCents: number;
}

export interface PlanoConsumo {
  consumos: ConsumoLote[];
  /** Quanto foi efetivamente coberto. */
  atendido: number;
  /** O que faltou para cobrir o pedido (0 quando cobriu tudo). */
  faltou: number;
  custoTotalCents: number;
}

/** Quais lotes pagam por uma saída de `quantidade` milhas, e a que custo. */
export function planejarConsumo(lotes: LoteMilhas[], quantidade: number): PlanoConsumo {
  const consumos: ConsumoLote[] = [];
  let restaPegar = Math.max(0, quantidade);
  let custoTotal = 0;

  for (const lote of ordenarParaConsumo(lotes)) {
    if (restaPegar <= 0) break;
    const pega = Math.min(lote.quantidadeRestante, restaPegar);
    // Custo proporcional ao pedaço retirado DESTE lote.
    const custo =
      lote.quantidade > 0 ? Math.round((lote.custoCents * pega) / lote.quantidade) : 0;
    consumos.push({ loteId: lote.id, quantidade: pega, custoCents: custo });
    custoTotal += custo;
    restaPegar -= pega;
  }

  const atendido = Math.max(0, quantidade) - restaPegar;
  return { consumos, atendido, faltou: restaPegar, custoTotalCents: custoTotal };
}

// ---------------------------------------------------------------------------
// Transferência: o custo atravessa
// ---------------------------------------------------------------------------

export interface LoteNovo {
  programaId: string;
  quantidade: number;
  custoCents: number;
  origem: OrigemLote;
  loteOrigemId: string | null;
  data: string;
  expiraEm: string | null;
}

export interface PlanoTransferencia {
  consumos: ConsumoLote[];
  novosLotes: LoteNovo[];
  entrada: number;
  saida: number;
  custoTotalCents: number;
  /** Custo por mil no DESTINO depois da transferência. null se custo zero e saída zero. */
  custoPorMilDestinoCents: number | null;
  viavel: boolean;
}

/**
 * Move `entrada` milhas de um programa para outro, carregando o custo junto.
 *
 * Gera um lote de destino POR lote de origem consumido (corrente 1:1), em vez
 * de achatar tudo numa média. Isso mantém a base de custo exata e deixa a
 * origem de cada milha rastreável — se um dia você quiser saber de onde veio
 * a milha que pagou a passagem, dá para responder.
 */
export function planejarTransferencia(input: {
  lotesOrigem: LoteMilhas[];
  programaDestinoId: string;
  entrada: number;
  /** Milhas que efetivamente chegam (já com ratio e bônus aplicados). */
  saida: number;
  data: string;
  expiraEm?: string | null;
}): PlanoTransferencia {
  const { lotesOrigem, programaDestinoId, entrada, saida, data } = input;
  const plano = planejarConsumo(lotesOrigem, entrada);

  if (plano.faltou > 0 || saida <= 0) {
    return {
      consumos: plano.consumos,
      novosLotes: [],
      entrada: plano.atendido,
      saida: 0,
      custoTotalCents: plano.custoTotalCents,
      custoPorMilDestinoCents: null,
      viavel: false,
    };
  }

  // Distribui a saída proporcionalmente ao que cada lote contribuiu. O último
  // leva o resto da divisão, para a soma bater exatamente com `saida` — a
  // diferença é de poucas milhas e o CUSTO já vai exato em cada fatia.
  const novosLotes: LoteNovo[] = [];
  let atribuido = 0;
  plano.consumos.forEach((c, i) => {
    const ultimo = i === plano.consumos.length - 1;
    const q = ultimo
      ? saida - atribuido
      : Math.floor((saida * c.quantidade) / Math.max(1, plano.atendido));
    atribuido += q;
    if (q <= 0) return;
    novosLotes.push({
      programaId: programaDestinoId,
      quantidade: q,
      custoCents: c.custoCents,
      origem: "transferencia",
      loteOrigemId: c.loteId,
      data,
      expiraEm: input.expiraEm ?? null,
    });
  });

  return {
    consumos: plano.consumos,
    novosLotes,
    entrada: plano.atendido,
    saida,
    custoTotalCents: plano.custoTotalCents,
    custoPorMilDestinoCents: Math.round((plano.custoTotalCents / saida) * 1000),
    viavel: true,
  };
}

// ---------------------------------------------------------------------------
// Expiração
// ---------------------------------------------------------------------------

export interface AlertaExpiracao {
  loteId: string;
  programaId: string;
  quantidade: number;
  custoCents: number;
  expiraEm: string;
  diasRestantes: number;
}

/**
 * Lotes que vencem dentro de `dias`. Ordenados por prejuízo: perder milha cara
 * é pior que perder milha barata, e é isso que decide o que salvar primeiro.
 */
export function lotesExpirando(
  lotes: LoteMilhas[],
  hoje: string,
  dias = 90,
): AlertaExpiracao[] {
  const limite = Date.parse(`${hoje}T00:00:00Z`) + dias * 86_400_000;
  const alertas: AlertaExpiracao[] = [];

  for (const l of lotes) {
    if (l.quantidadeRestante <= 0 || !l.expiraEm) continue;
    const venc = Date.parse(`${l.expiraEm}T00:00:00Z`);
    if (venc > limite) continue;
    alertas.push({
      loteId: l.id,
      programaId: l.programaId,
      quantidade: l.quantidadeRestante,
      custoCents: custoRestanteCents(l),
      expiraEm: l.expiraEm,
      diasRestantes: Math.round((venc - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000),
    });
  }

  return alertas.sort((a, b) => b.custoCents - a.custoCents);
}
