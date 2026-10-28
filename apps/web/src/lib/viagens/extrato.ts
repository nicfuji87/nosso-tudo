import type { LoteMilhas, OrigemLote } from "@/lib/viagens/custo";
import { planejarConsumo } from "@/lib/viagens/custo";

/**
 * Interpretação de extrato de programa de milhas.
 *
 * Modelado a partir dos extratos reais (Livelo, LATAM Pass, Accor ALL). Apesar
 * de as telas serem bem diferentes, todas são a MESMA coisa: um livro-razão de
 * movimentos com data, tipo, parceiro e uma quantidade com sinal.
 *
 *   Livelo   → Data | Operação | Parceiros | Pontos      (+25.000, -100.000)
 *   LATAM    → Data | Tipo     | Detalhe   | Milhas      (Acúmulo/Resgate)
 *   Accor    → Data | Pontos Reward | Pontos Status | Noites
 *
 * Normalizar para `MovimentoExtrato` deixa a Nia responsável só por LER a tela
 * e devolver linhas; o preço e a virada em lotes acontecem aqui, em código
 * testado. A LLM nunca decide quanto custou uma milha.
 */

export const TIPOS_MOVIMENTO = [
  "acumulo",
  "bonus",
  "transferencia_entrada",
  "transferencia_saida",
  "resgate",
  "expiracao",
  "estorno",
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

export interface MovimentoExtrato {
  /** ISO date (YYYY-MM-DD). */
  data: string;
  tipo: TipoMovimento;
  /** Positivo = entrou; negativo = saiu. Sempre com sinal. */
  pontos: number;
  /** "Clube Livelo", "UBER DO BRASIL", "ITAU UNIBANCO HOLDING…" */
  parceiro: string | null;
  descricao: string | null;
}

/** Regra de preço vinda de uma assinatura (Clube Livelo, Clube LATAM…). */
export interface RegraPreco {
  assinaturaId: string;
  /** Texto que identifica a linha do extrato, comparado sem acento/caixa. */
  padraoExtrato: string;
  custoPorMilCents: number;
  inicio: string;
  fim: string | null;
}

/** Só entradas viram lote; o resto consome ou é neutro. */
export function ehEntrada(m: MovimentoExtrato): boolean {
  return m.pontos > 0;
}

const MAPA_ORIGEM: Record<TipoMovimento, OrigemLote> = {
  acumulo: "acumulo",
  bonus: "bonus",
  transferencia_entrada: "transferencia",
  transferencia_saida: "transferencia",
  resgate: "ajuste",
  expiracao: "ajuste",
  estorno: "estorno",
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Acha a assinatura que precifica este movimento: o padrão precisa bater com o
 * parceiro/descrição E a data cair dentro da vigência. Fora da vigência não
 * vale — assinatura velha não pode precificar crédito de hoje.
 */
export function regraParaMovimento(
  m: MovimentoExtrato,
  regras: RegraPreco[],
): RegraPreco | null {
  const alvo = normalizar([m.parceiro, m.descricao].filter(Boolean).join(" "));
  if (!alvo) return null;

  for (const r of regras) {
    const padrao = normalizar(r.padraoExtrato);
    if (!padrao || !alvo.includes(padrao)) continue;
    if (m.data < r.inicio) continue;
    if (r.fim && m.data > r.fim) continue;
    return r;
  }
  return null;
}

export type FonteCusto = "assinatura" | "gratis" | "desconhecido";

export interface MovimentoPrecificado {
  movimento: MovimentoExtrato;
  custoCents: number;
  fonte: FonteCusto;
  assinaturaId: string | null;
}

/**
 * Quanto custou este movimento de entrada.
 *
 * Três casos, e a distinção importa: assinatura tem preço conhecido; acúmulo
 * por gasto é genuinamente de graça (não é dado faltando); e transferência
 * recebida tem custo que vem do programa de ORIGEM, não daqui — por isso sai
 * como desconhecido em vez de zero, que sujaria a média para baixo.
 */
export function precificarEntrada(
  m: MovimentoExtrato,
  regras: RegraPreco[],
): MovimentoPrecificado {
  if (m.pontos <= 0) {
    return { movimento: m, custoCents: 0, fonte: "gratis", assinaturaId: null };
  }

  const regra = regraParaMovimento(m, regras);
  if (regra) {
    return {
      movimento: m,
      custoCents: Math.round((m.pontos / 1000) * regra.custoPorMilCents),
      fonte: "assinatura",
      assinaturaId: regra.assinaturaId,
    };
  }

  // Acúmulo por gasto (cartão, Uber, hotel) não custa dinheiro — custa o gasto,
  // que já está no módulo financeiro. Aqui a milha entra de graça mesmo.
  if (m.tipo === "acumulo" || m.tipo === "bonus") {
    return { movimento: m, custoCents: 0, fonte: "gratis", assinaturaId: null };
  }

  return { movimento: m, custoCents: 0, fonte: "desconhecido", assinaturaId: null };
}

// ---------------------------------------------------------------------------
// Extrato → lotes
// ---------------------------------------------------------------------------

export interface LoteProposto {
  programaId: string;
  quantidade: number;
  custoCents: number;
  origem: OrigemLote;
  data: string;
  descricao: string | null;
  assinaturaId: string | null;
  fonte: FonteCusto;
}

export interface SaidaProposta {
  data: string;
  quantidade: number;
  descricao: string | null;
  /** Custo das milhas que saíram — o que aquele resgate de fato valeu. */
  custoCents: number;
}

export interface PlanoImportacao {
  lotes: LoteProposto[];
  saidas: SaidaProposta[];
  totalEntrada: number;
  totalSaida: number;
  /** Saldo que os movimentos produzem sozinhos (sem saldo inicial). */
  saldoMovimentos: number;
  /** Entradas sem custo conhecido — o que o usuário precisa completar. */
  semCusto: LoteProposto[];
  custoTotalCents: number;
}

/**
 * Converte os movimentos lidos do extrato em lotes (entradas) e saídas.
 *
 * As saídas consomem os lotes na ordem certa (vencimento primeiro), então o
 * custo de um resgate sai calculado — dá para dizer "esse resgate de 200.000
 * pontos consumiu R$ 5.646 em milhas".
 */
export function planejarImportacao(input: {
  programaId: string;
  movimentos: MovimentoExtrato[];
  regras: RegraPreco[];
  /** Lotes que já existem na carteira, para as saídas consumirem. */
  lotesExistentes?: LoteMilhas[];
}): PlanoImportacao {
  const { programaId, regras } = input;

  // Ordem cronológica: uma saída só pode consumir o que já entrou antes dela.
  const movimentos = [...input.movimentos].sort((a, b) => a.data.localeCompare(b.data));

  const lotes: LoteProposto[] = [];
  const saidas: SaidaProposta[] = [];
  let totalEntrada = 0;
  let totalSaida = 0;
  let custoTotal = 0;

  // Espelho em memória dos lotes disponíveis, para simular o consumo.
  const disponiveis: LoteMilhas[] = (input.lotesExistentes ?? []).map((l) => ({ ...l }));

  for (const m of movimentos) {
    if (m.pontos > 0) {
      const precificado = precificarEntrada(m, regras);
      const lote: LoteProposto = {
        programaId,
        quantidade: m.pontos,
        custoCents: precificado.custoCents,
        origem: MAPA_ORIGEM[m.tipo],
        data: m.data,
        descricao: m.descricao ?? m.parceiro,
        assinaturaId: precificado.assinaturaId,
        fonte: precificado.fonte,
      };
      lotes.push(lote);
      totalEntrada += m.pontos;
      custoTotal += precificado.custoCents;

      disponiveis.push({
        id: `novo-${lotes.length}`,
        programaId,
        quantidade: m.pontos,
        quantidadeRestante: m.pontos,
        custoCents: precificado.custoCents,
        origem: lote.origem,
        data: m.data,
        expiraEm: null,
      });
      continue;
    }

    if (m.pontos < 0) {
      const quantidade = Math.abs(m.pontos);
      const plano = planejarConsumo(disponiveis, quantidade);

      // Desconta do espelho para o próximo movimento enxergar o saldo certo.
      for (const c of plano.consumos) {
        const alvo = disponiveis.find((d) => d.id === c.loteId);
        if (alvo) alvo.quantidadeRestante -= c.quantidade;
      }

      saidas.push({
        data: m.data,
        quantidade,
        descricao: m.descricao ?? m.parceiro,
        custoCents: plano.custoTotalCents,
      });
      totalSaida += quantidade;
    }
  }

  return {
    lotes,
    saidas,
    totalEntrada,
    totalSaida,
    saldoMovimentos: totalEntrada - totalSaida,
    semCusto: lotes.filter((l) => l.fonte === "desconhecido"),
    custoTotalCents: custoTotal,
  };
}

/**
 * Confere o saldo declarado pelo extrato contra o que os movimentos produzem.
 *
 * Divergir é NORMAL quando o extrato mostra só uma janela (a Livelo mostra 1
 * ano): a diferença é o saldo que já existia antes. Vira saldo inicial em vez
 * de erro — mas com custo desconhecido, e o usuário precisa saber disso.
 */
export interface Conferencia {
  saldoDeclarado: number;
  saldoMovimentos: number;
  saldoInicialImplicito: number;
  precisaSaldoInicial: boolean;
}

export function conferirSaldo(plano: PlanoImportacao, saldoDeclarado: number): Conferencia {
  const inicial = saldoDeclarado - plano.saldoMovimentos;
  return {
    saldoDeclarado,
    saldoMovimentos: plano.saldoMovimentos,
    saldoInicialImplicito: inicial,
    precisaSaldoInicial: inicial !== 0,
  };
}
