/**
 * Contratos tipados da Nia — compartilhados entre servidor e cliente.
 * NÃO importa nada server-only (o componente de chat importa os tipos de widget daqui).
 * Ver PLANO-NIA.md §3 (confiança graduada) e §4 (catálogo de widgets).
 */
import { z } from "zod";
import {
  MEIOS_PAGAMENTO,
  TIPOS_TRANSACAO,
  type TipoTransacao,
} from "@/lib/types/db";

/** Feature flag / chave de gating do plano (plans.features["nia"]). */
export const NIA_FEATURE = "nia";

/** Política de confirmação por ferramenta (DN3: auto+desfazer; estrutural/destrutivo confirmam). */
export type NivelConfirmacao =
  | "auto"
  | "auto_desfazer"
  | "confirmar"
  | "confirmar_estrutural"
  | "confirmar_forte";

/* ------------------------------------------------------------------ */
/* Argumentos das ferramentas (validados antes de qualquer execução)  */
/* ------------------------------------------------------------------ */

export const consultarGastosArgs = z.object({
  periodo: z.enum(["mes_atual"]).default("mes_atual"),
});
export type ConsultarGastosArgs = z.infer<typeof consultarGastosArgs>;

export const lancarTransacaoArgs = z.object({
  tipo: z.enum(TIPOS_TRANSACAO).default("despesa"),
  descricao: z.string().trim().min(1).max(255),
  valor: z.number().positive(),
  data_transacao: z.string().optional(),
  categoria: z.string().trim().max(120).optional(),
  estabelecimento: z.string().trim().max(120).optional(),
  meio_pagamento: z.enum(MEIOS_PAGAMENTO).optional(),
});
export type LancarTransacaoArgs = z.infer<typeof lancarTransacaoArgs>;

/* ------------------------------------------------------------------ */
/* Catálogo de widgets — o que o cliente renderiza (P4: catálogo fixo) */
/* ------------------------------------------------------------------ */

export interface WidgetResumoPeriodo {
  tipo: "resumo_periodo";
  titulo: string;
  receitas: number;
  despesas: number;
  saldo: number;
  categorias: { nome: string; total: number; cor: string | null }[];
}

export interface WidgetConfirmarTransacao {
  tipo: "confirmar_transacao";
  acaoId: string;
  nivel: NivelConfirmacao;
  descricao: string;
  valor: number;
  tipoTransacao: TipoTransacao;
  categoria: string | null;
  estabelecimento: string | null;
  data: string;
}

export type NiaWidget = WidgetResumoPeriodo | WidgetConfirmarTransacao;

/* ------------------------------------------------------------------ */
/* Envelopes de transporte                                            */
/* ------------------------------------------------------------------ */

/** Mensagem da Nia devolvida ao cliente. */
export interface NiaResposta {
  conversaId: string;
  mensagemId: string | null;
  texto: string;
  widgets: NiaWidget[];
}

/** Corpo aceito pelo POST /api/nia. */
export const niaRequestSchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  conversaId: z.string().uuid().optional(),
});
export type NiaRequest = z.infer<typeof niaRequestSchema>;
