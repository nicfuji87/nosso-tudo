import { z } from "zod";
import { MEIOS_PAGAMENTO, TIPOS_TRANSACAO } from "@/lib/types/db";

const uuidOpt = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const transacaoSchema = z.object({
  tipo: z.enum(TIPOS_TRANSACAO),
  descricao: z.string().trim().min(1, "Descreva a transação").max(255),
  valor: z
    .number({ invalid_type_error: "Informe um valor" })
    .positive("O valor deve ser maior que zero"),
  data_transacao: z.string().min(1, "Informe a data"),
  categoria_id: uuidOpt,
  meio_pagamento: z.enum(MEIOS_PAGAMENTO).optional(),
  cartao_id: uuidOpt,
  conta_id: uuidOpt,
  pagador_id: uuidOpt,
  beneficiario_id: uuidOpt,
  estabelecimento: z.string().trim().max(120).optional(),
  contexto: z.string().trim().max(120).optional(),
  observacoes: z.string().trim().max(500).optional(),
  tags: z.array(z.string()).default([]),
});
export type TransacaoInput = z.infer<typeof transacaoSchema>;
