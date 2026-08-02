import { z } from "zod";
import { ALIANCAS, TIPOS_PROGRAMA } from "@/lib/viagens/tipos";

/**
 * Validação da curadoria do grafo de milhas.
 *
 * Aqui a rigidez é proposital: cada campo destes vira uma conta que o usuário
 * usa para mover milhas de forma irreversível. Ratio zerado, múltiplo negativo
 * ou prazo incoerente não podem chegar ao banco nem ao motor.
 */

const textoOpcional = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : null));

export const programaSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(2, "O slug precisa de ao menos 2 caracteres.")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen."),
  nome: z.string().trim().min(2, "Informe o nome do programa.").max(80),
  tipo: z.enum(TIPOS_PROGRAMA),
  pais: z
    .string()
    .trim()
    .max(2)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  alianca: z
    .union([z.enum(ALIANCAS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  fonteSeatsAero: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  valorPorMilCents: z
    .union([z.coerce.number().int().min(0).max(1_000_000), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  observacoes: textoOpcional,
  ativo: z.boolean().default(true),
});

export const transferenciaSchema = z
  .object({
    id: z.string().uuid().optional(),
    origemId: z.string().uuid("Escolha o programa de origem."),
    destinoId: z.string().uuid("Escolha o programa de destino."),
    ratioOrigem: z.coerce.number().int().min(1, "O ratio de origem precisa ser ao menos 1."),
    ratioDestino: z.coerce.number().int().min(1, "O ratio de destino precisa ser ao menos 1."),
    bonusPercent: z.coerce.number().min(0).max(500).default(0),
    bonusValidoAte: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    minimoTransferencia: z.coerce.number().int().min(0).default(0),
    multiplo: z.coerce.number().int().min(1, "O múltiplo precisa ser ao menos 1.").default(1),
    prazoDiasMin: z.coerce.number().int().min(0).default(0),
    prazoDiasMax: z.coerce.number().int().min(0).default(0),
    ativa: z.boolean().default(true),
    fonteUrl: z
      .union([z.string().trim().url("Informe uma URL válida."), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    verificadoEm: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    observacoes: textoOpcional,
  })
  .refine((d) => d.origemId !== d.destinoId, {
    message: "Origem e destino precisam ser programas diferentes.",
    path: ["destinoId"],
  })
  .refine((d) => d.prazoDiasMax >= d.prazoDiasMin, {
    message: "O prazo máximo não pode ser menor que o mínimo.",
    path: ["prazoDiasMax"],
  })
  .refine((d) => d.bonusPercent === 0 || d.bonusValidoAte !== null, {
    // Bônus sem validade é a pegadinha clássica: fica valendo para sempre no
    // motor e infla toda simulação muito depois de a promoção ter acabado.
    message: "Bônus precisa de uma data de validade — senão vale para sempre na simulação.",
    path: ["bonusValidoAte"],
  });

/** Simulador do admin: saldos digitados à mão para validar o grafo. */
export const simulacaoSchema = z.object({
  alvoProgramaId: z.string().uuid("Escolha o programa da emissão."),
  milhas: z.coerce.number().int().min(1, "Informe quantas milhas a emissão custa."),
  saldos: z
    .array(
      z.object({
        programaId: z.string().uuid(),
        saldo: z.coerce.number().int().min(0),
      }),
    )
    .default([]),
});

export type ProgramaFormValues = z.input<typeof programaSchema>;
export type TransferenciaFormValues = z.input<typeof transferenciaSchema>;
