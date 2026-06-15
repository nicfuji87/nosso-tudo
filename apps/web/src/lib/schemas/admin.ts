import { z } from "zod";

/** Asaas — segredos opcionais (vazio = manter o atual). */
export const asaasConfigSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  apiKey: z.string().trim().optional(),
  webhookToken: z.string().trim().optional(),
});
export type AsaasConfigInput = z.infer<typeof asaasConfigSchema>;

/** WhatsApp/uazapi + n8n. */
export const whatsappConfigSchema = z.object({
  uazapiUrl: z
    .string()
    .trim()
    .url("URL inválida")
    .optional()
    .or(z.literal("")),
  n8nWebhookUrl: z
    .string()
    .trim()
    .url("URL inválida")
    .optional()
    .or(z.literal("")),
  uazapiToken: z.string().trim().optional(),
});
export type WhatsappConfigInput = z.infer<typeof whatsappConfigSchema>;

/** Edição de plano (admin de planos). */
export const planoSchema = z.object({
  id: z.string().uuid(),
  preco_mensal_brl: z.coerce.number().min(0).nullable(),
  preco_anual_brl: z.coerce.number().min(0).nullable(),
  exibe_anuncios: z.boolean(),
  ativo: z.boolean(),
});
export type PlanoInput = z.infer<typeof planoSchema>;

/** Anúncio (admin de anúncios — RF-100+). */
export const anuncioSchema = z.object({
  id: z.string().uuid().optional(),
  posicao: z.string().trim().min(1, "Informe a posição"),
  titulo: z.string().trim().min(1, "Informe o título"),
  texto: z.string().trim().optional().or(z.literal("")),
  url_destino: z.string().trim().url("URL inválida").optional().or(z.literal("")),
  imagem_url: z.string().trim().url("URL inválida").optional().or(z.literal("")),
  prioridade: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});
export type AnuncioInput = z.infer<typeof anuncioSchema>;
