import { z } from "zod";
import {
  COMPORTAMENTOS_CATEGORIA,
  TIPOS_CONTA_BANCARIA,
  TIPOS_ENTIDADE,
} from "@/lib/types/db";

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
