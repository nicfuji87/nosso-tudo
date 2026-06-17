import { z } from "zod";
import {
  COMPORTAMENTOS_CATEGORIA,
  ESSENCIALIDADES,
  FREQUENCIAS_RECORRENCIA,
  MEIOS_PAGAMENTO,
  TIPOS_CONTA_BANCARIA,
  TIPOS_ENTIDADE,
  TIPOS_TRANSACAO,
} from "@/lib/types/db";

const uuidOpt = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

/* Entidade (pessoa/grupo) — RF-010+ */
export const entidadeSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(80),
  tipo: z.enum(TIPOS_ENTIDADE),
  cor: z.string().optional(),
  icone: z.string().optional(),
});
export type EntidadeInput = z.infer<typeof entidadeSchema>;

/* Categoria com comportamento — RF-030+ */
export const categoriaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(60),
  icone: z.string().trim().max(8).optional(),
  cor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "Cor inválida")
    .optional(),
  comportamento: z.enum(COMPORTAMENTOS_CATEGORIA).default("basico"),
  /** Categoria-pai (para subcategorias). null/undefined = categoria principal. */
  categoria_pai_id: z.string().uuid().nullish(),
  /** Essencialidade padrão dos lançamentos desta categoria. */
  essencialidade: z.enum(ESSENCIALIDADES).nullish(),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

/* Conta bancária — RF-030+ */
export const contaSchema = z.object({
  banco: z.string().trim().min(1, "Informe o banco").max(60),
  apelido: z.string().trim().min(1, "Dê um apelido").max(60),
  tipo: z.enum(TIPOS_CONTA_BANCARIA).default("corrente"),
  titular_id: z.string().uuid("Selecione o titular"),
  agencia: z.string().trim().max(20).optional(),
  numero: z.string().trim().max(30).optional(),
  eh_conta_compartilhada: z.boolean().default(false),
});
export type ContaInput = z.infer<typeof contaSchema>;

/* Cartão — RF-030+ */
export const cartaoSchema = z.object({
  banco: z.string().trim().min(1, "Informe o banco").max(60),
  apelido: z.string().trim().min(1, "Dê um apelido").max(60),
  bandeira: z.string().trim().max(40).optional(),
  ultimos_digitos: z
    .string()
    .regex(/^\d{4}$/, "4 dígitos")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  dia_fechamento: z.coerce.number().int().min(1).max(31).optional(),
  dia_vencimento: z.coerce.number().int().min(1).max(31).optional(),
  limite: z.coerce.number().nonnegative().optional(),
  titular_id: z.string().uuid("Selecione o titular"),
});
export type CartaoInput = z.infer<typeof cartaoSchema>;

/* Conta fixa / recorrência — RF-040+ */
export const recorrenciaSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva a conta fixa").max(255),
  tipo: z.enum(TIPOS_TRANSACAO).default("despesa"),
  valor_previsto: z
    .number({ invalid_type_error: "Informe um valor" })
    .positive("O valor deve ser maior que zero"),
  frequencia: z.enum(FREQUENCIAS_RECORRENCIA).default("mensal"),
  data_inicio: z.string().min(1, "Informe a data de início"),
  data_fim: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  categoria_id: uuidOpt,
  meio_pagamento: z.enum(MEIOS_PAGAMENTO).optional(),
  cartao_id: uuidOpt,
  conta_id: uuidOpt,
});
export type RecorrenciaInput = z.infer<typeof recorrenciaSchema>;
