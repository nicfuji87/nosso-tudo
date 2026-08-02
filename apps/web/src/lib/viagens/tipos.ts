/**
 * Tipos do módulo Nossa Viagem (ver PLANO-VIAGENS.md).
 *
 * Este arquivo é PURO de propósito: sem `server-only`, sem Supabase, sem Next.
 * O motor de caminho (caminho.ts) importa daqui e roda em teste unitário sem
 * subir banco nenhum — é o que permite provar que a conta está certa antes de
 * qualquer UI existir.
 */

export const TIPOS_PROGRAMA = ["aereo", "banco", "coalizao", "hotel"] as const;
export type TipoPrograma = (typeof TIPOS_PROGRAMA)[number];

export const ALIANCAS = ["star", "oneworld", "skyteam"] as const;
export type Alianca = (typeof ALIANCAS)[number];

export const LABEL_TIPO_PROGRAMA: Record<TipoPrograma, string> = {
  aereo: "Programa aéreo",
  banco: "Banco / cartão",
  coalizao: "Coalizão",
  hotel: "Hotel",
};

export const LABEL_ALIANCA: Record<Alianca, string> = {
  star: "Star Alliance",
  oneworld: "oneworld",
  skyteam: "SkyTeam",
};

/** Um nó do grafo. */
export interface ProgramaViagem {
  id: string;
  slug: string;
  nome: string;
  tipo: TipoPrograma;
  pais: string | null;
  alianca: Alianca | null;
  /** Nome da fonte no seats.aero. null = não buscável lá. */
  fonteSeatsAero: string | null;
  /** Valor estimado de 1.000 milhas, em centavos de BRL. null = desconhecido. */
  valorPorMilCents: number | null;
  observacoes: string | null;
  ativo: boolean;
}

/** Uma aresta do grafo: origem → destino. */
export interface TransferenciaViagem {
  id: string;
  origemId: string;
  destinoId: string;
  /** `ratioOrigem` milhas na origem viram `ratioDestino` no destino. */
  ratioOrigem: number;
  ratioDestino: number;
  /** Bônus promocional em %, aplicado sobre o resultado do ratio. */
  bonusPercent: number;
  /** ISO date. Passou → o motor ignora o bônus (mas mantém a aresta). */
  bonusValidoAte: string | null;
  minimoTransferencia: number;
  /** Transferência só em múltiplos de N. 1 = sem restrição. */
  multiplo: number;
  prazoDiasMin: number;
  prazoDiasMax: number;
  ativa: boolean;
  /** ISO date da última conferência humana. null = NUNCA verificada. */
  verificadoEm: string | null;
  fonteUrl: string | null;
  observacoes: string | null;
}

/** Quanto a família tem em um programa. */
export interface SaldoPrograma {
  programaId: string;
  saldo: number;
}

/** O que a emissão custa: N milhas no programa X. */
export interface AlvoEmissao {
  programaId: string;
  milhas: number;
}
