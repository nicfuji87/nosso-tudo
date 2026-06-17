/**
 * Contratos tipados da Nia — compartilhados entre servidor e cliente.
 * NÃO importa nada server-only (o componente de chat importa os tipos de widget daqui).
 * Ver PLANO-NIA.md §3 (confiança graduada) e §4 (catálogo de widgets).
 */
import { z } from "zod";
import {
  COMPORTAMENTOS_CATEGORIA,
  ESSENCIALIDADES,
  FREQUENCIAS_RECORRENCIA,
  MEIOS_PAGAMENTO,
  TIPOS_CONTA_BANCARIA,
  TIPOS_ENTIDADE,
  TIPOS_TRANSACAO,
  type ComportamentoCategoria,
  type MeioPagamento,
  type TipoEntidade,
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

export const consultarCadastrosArgs = z.object({
  tipo: z.enum(["pessoas", "contas", "cartoes", "categorias", "compromissos", "metas", "orcamentos"]),
});
export type ConsultarCadastrosArgs = z.infer<typeof consultarCadastrosArgs>;

export const criarMetaArgs = z.object({
  nome: z.string().trim().min(1).max(120),
  valor_alvo: z.number().positive(),
  data_alvo: z.string().optional(),
});
export type CriarMetaArgs = z.infer<typeof criarMetaArgs>;

export const criarOrcamentoArgs = z.object({
  categoria: z.string().trim().min(1).max(120),
  valor_planejado: z.number().positive(),
});
export type CriarOrcamentoArgs = z.infer<typeof criarOrcamentoArgs>;

export const listarTransacoesArgs = z.object({
  busca: z.string().trim().max(100).optional(),
  limite: z.number().int().min(1).max(30).default(10),
});
export type ListarTransacoesArgs = z.infer<typeof listarTransacoesArgs>;

export const lancarTransacaoArgs = z.object({
  tipo: z.enum(TIPOS_TRANSACAO).default("despesa"),
  descricao: z.string().trim().min(1).max(255),
  valor: z.number().positive(),
  data_transacao: z.string().optional(),
  categoria: z.string().trim().max(120).optional(),
  estabelecimento: z.string().trim().max(120).optional(),
  contexto: z.string().trim().max(120).optional(),
  meio_pagamento: z.enum(MEIOS_PAGAMENTO).optional(),
  cartao: z.string().trim().max(60).optional(),
  conta: z.string().trim().max(60).optional(),
});
export type LancarTransacaoArgs = z.infer<typeof lancarTransacaoArgs>;

export const lancarTransacaoDetalhadaArgs = z.object({
  descricao: z.string().trim().min(1).max(255),
  estabelecimento: z.string().trim().max(120).optional(),
  categoria: z.string().trim().max(120).optional(),
  contexto: z.string().trim().max(120).optional(),
  data_transacao: z.string().optional(),
  meio_pagamento: z.enum(MEIOS_PAGAMENTO).optional(),
  itens: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(200),
        quantidade: z.number().optional(),
        unidade: z.string().trim().max(20).optional(),
        valor_unitario: z.number().optional(),
        valor_total: z.number().optional(),
        categoria: z.string().trim().max(120).optional(),
        essencialidade: z.enum(ESSENCIALIDADES).optional(),
        tipo: z.string().trim().max(60).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type LancarTransacaoDetalhadaArgs = z.infer<typeof lancarTransacaoDetalhadaArgs>;

export const criarPessoaArgs = z.object({
  nome: z.string().trim().min(1).max(80),
  tipo: z.enum(TIPOS_ENTIDADE).default("pessoa"),
});
export type CriarPessoaArgs = z.infer<typeof criarPessoaArgs>;

export const criarRecorrenciaArgs = z.object({
  descricao: z.string().trim().min(1).max(255),
  valor: z.number().positive(),
  frequencia: z.enum(FREQUENCIAS_RECORRENCIA),
  tipo: z.enum(["despesa", "receita"]).default("despesa"),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  categoria: z.string().trim().max(120).optional(),
});
export type CriarRecorrenciaArgs = z.infer<typeof criarRecorrenciaArgs>;

export const criarCompromissoArgs = z.object({
  nome: z.string().trim().min(1).max(120),
  valor_estimado: z.number().positive().optional(),
  data_estimada_entrega: z.string().optional(),
});
export type CriarCompromissoArgs = z.infer<typeof criarCompromissoArgs>;

export const lembrarFatoArgs = z.object({
  fato: z.string().trim().min(1).max(300),
});
export type LembrarFatoArgs = z.infer<typeof lembrarFatoArgs>;

export const buscarItensArgs = z.object({ termo: z.string().trim().min(1).max(100) });
export type BuscarItensArgs = z.infer<typeof buscarItensArgs>;

export const buscarDocumentosArgs = z.object({ busca: z.string().trim().max(100).optional() });
export type BuscarDocumentosArgs = z.infer<typeof buscarDocumentosArgs>;

export const enviarDocumentoArgs = z.object({ midia_id: z.string().uuid() });
export type EnviarDocumentoArgs = z.infer<typeof enviarDocumentoArgs>;

export const criarCategoriaArgs = z.object({
  nome: z.string().trim().min(1).max(60),
  comportamento: z.enum(COMPORTAMENTOS_CATEGORIA).default("basico"),
  icone: z.string().trim().max(8).optional(),
});
export type CriarCategoriaArgs = z.infer<typeof criarCategoriaArgs>;

export const criarContaArgs = z.object({
  apelido: z.string().trim().min(1).max(60),
  banco: z.string().trim().min(1).max(60),
  tipo: z.enum(TIPOS_CONTA_BANCARIA).default("corrente"),
  titular: z.string().trim().min(1).max(80),
});
export type CriarContaArgs = z.infer<typeof criarContaArgs>;

export const criarCartaoArgs = z.object({
  apelido: z.string().trim().min(1).max(60),
  banco: z.string().trim().min(1).max(60),
  titular: z.string().trim().min(1).max(80),
  ultimos_digitos: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});
export type CriarCartaoArgs = z.infer<typeof criarCartaoArgs>;

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
  meioPagamento: MeioPagamento | null;
  /** Conta/cartão informado (apelido), para o usuário conferir onde foi pago. */
  pagamento: string | null;
  data: string;
  /** Dúvida de estabelecimento (zona cinza): a Nia achou um parecido. */
  match?: { sugestao: string; score: number } | null;
}

export interface WidgetCriarPessoa {
  tipo: "criar_pessoa";
  acaoId: string;
  nome: string;
  tipoEntidade: TipoEntidade;
}

export interface WidgetCriarCompromisso {
  tipo: "criar_compromisso";
  acaoId: string;
  nome: string;
  valorEstimado: number | null;
  dataEstimada: string | null;
}

export interface WidgetLembrarFato {
  tipo: "lembrar_fato";
  acaoId: string;
  fato: string;
}

export interface WidgetCriarCategoria {
  tipo: "criar_categoria";
  acaoId: string;
  nome: string;
  comportamento: ComportamentoCategoria;
}

export interface WidgetCriarConta {
  tipo: "criar_conta";
  acaoId: string;
  apelido: string;
  banco: string;
  titular: string;
}

export interface WidgetCriarCartao {
  tipo: "criar_cartao";
  acaoId: string;
  apelido: string;
  banco: string;
  titular: string;
  ultimosDigitos: string | null;
}

export interface WidgetCriarMeta {
  tipo: "criar_meta";
  acaoId: string;
  nome: string;
  valorAlvo: number;
  dataAlvo: string | null;
}

export interface WidgetCriarOrcamento {
  tipo: "criar_orcamento";
  acaoId: string;
  categoria: string;
  valorPlanejado: number;
}

export interface WidgetChecklistItens {
  tipo: "checklist_itens";
  acaoId: string;
  descricao: string;
  estabelecimento: string | null;
  itens: { nome: string; quantidade: number | null; valorTotal: number | null }[];
}

export interface WidgetCriarRecorrencia {
  tipo: "criar_recorrencia";
  acaoId: string;
  descricao: string;
  valor: number;
  frequenciaLabel: string;
  tipoTransacao: "despesa" | "receita";
  categoria: string | null;
  dataInicio: string;
}

export interface WidgetDocumento {
  tipo: "documento";
  url: string;
  nome: string;
  ehImagem: boolean;
}

export type NiaWidget =
  | WidgetResumoPeriodo
  | WidgetConfirmarTransacao
  | WidgetCriarPessoa
  | WidgetCriarCompromisso
  | WidgetLembrarFato
  | WidgetCriarCategoria
  | WidgetCriarConta
  | WidgetCriarCartao
  | WidgetCriarMeta
  | WidgetCriarOrcamento
  | WidgetChecklistItens
  | WidgetCriarRecorrencia
  | WidgetDocumento;

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

/** Anexo enviado pelo cliente (já subido ao Storage; o route baixa e processa). */
export const niaAnexoSchema = z.object({
  tipo: z.enum(["imagem", "pdf", "audio"]),
  storagePath: z.string().min(1).max(400),
  mimeType: z.string().min(1).max(120),
  nomeOriginal: z.string().max(255).optional(),
  tamanho: z.number().int().nonnegative().optional(),
});
export type NiaAnexoInput = z.infer<typeof niaAnexoSchema>;

/** Corpo aceito pelo POST /api/nia. */
export const niaRequestSchema = z
  .object({
    mensagem: z.string().trim().max(2000).default(""),
    conversaId: z.string().uuid().optional(),
    anexos: z.array(niaAnexoSchema).max(6).default([]),
  })
  .refine((d) => d.mensagem.length > 0 || d.anexos.length > 0, {
    message: "Mensagem vazia.",
  });
export type NiaRequest = z.infer<typeof niaRequestSchema>;

/** Referência de mídia guardada no histórico (mensagens_ia.midias). */
export interface MidiaRef {
  id: string;
  tipo: string;
  nome: string | null;
}
