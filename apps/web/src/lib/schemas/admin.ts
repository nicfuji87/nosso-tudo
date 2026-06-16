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

/** Nia — chaves de API dos provedores de LLM (vazio = manter a atual). */
export const niaConfigSchema = z.object({
  anthropicApiKey: z.string().trim().optional(),
  openaiApiKey: z.string().trim().optional(),
});
export type NiaConfigInput = z.infer<typeof niaConfigSchema>;

/** Nia — config do agente (prompt/provedor/modelo/parâmetros); cada save cria uma versão. */
export const niaAgentConfigSchema = z.object({
  systemPrompt: z.string().trim().min(10, "Prompt muito curto"),
  provedor: z.string().trim().min(1, "Escolha o provedor"),
  modelo: z.string().trim().min(1, "Informe o modelo"),
  temperature: z.coerce.number().min(0).max(2),
  maxTokens: z.coerce.number().int().min(1).max(32768),
});
export type NiaAgentConfigInput = z.infer<typeof niaAgentConfigSchema>;

/** Nia — preço de um modelo (USD por 1M tokens). */
export const niaPrecoSchema = z.object({
  provedor: z.string().trim().min(1, "Informe o provedor").max(40),
  modelo: z.string().trim().min(1, "Informe o modelo").max(80),
  precoEntrada: z.coerce.number().min(0),
  precoSaida: z.coerce.number().min(0),
  precoEntradaCache: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
});
export type NiaPrecoInput = z.infer<typeof niaPrecoSchema>;

/** Alerta proativo da Nia (push WhatsApp). Ver lib/admin/alertas + migration 0011. */
const alvoSchema = z.object({
  workspaceId: z.string().uuid(),
  profileId: z.string().uuid().nullable().default(null),
});

export const alertaSchema = z
  .object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1, "Informe um nome").max(120),
    tipo: z.enum([
      "saldo_negativo",
      "orcamento_estourado",
      "orcamento_perto",
      "cartao_limite",
      "resumo_semanal",
      "resumo_mensal",
      "personalizado",
    ]),
    ativo: z.boolean().default(false),
    frequencia: z.enum(["imediato", "diario", "semanal", "mensal"]),
    hora: z.coerce.number().int().min(0).max(23).default(9),
    diaSemana: z.coerce.number().int().min(0).max(6).nullable().optional(),
    diaMes: z.coerce.number().int().min(1).max(28).nullable().optional(),
    limiarPct: z.coerce.number().int().min(1).max(100).nullable().optional(),
    template: z.string().trim().max(800).optional().or(z.literal("")),
    publicoAlvo: z.enum(["todos_pro", "especificos"]),
    alvos: z.array(alvoSchema).max(200).default([]),
  })
  .refine((d) => d.tipo !== "personalizado" || (d.template && d.template.trim().length > 0), {
    message: "Alerta personalizado precisa de uma mensagem.",
    path: ["template"],
  })
  .refine((d) => d.publicoAlvo !== "especificos" || d.alvos.length > 0, {
    message: "Escolha ao menos um destinatário.",
    path: ["alvos"],
  });
export type AlertaInput = z.infer<typeof alertaSchema>;

/** Teste de envio WhatsApp (admin). */
export const testeWhatsappSchema = z.object({
  telefone: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ""))
    .pipe(z.string().min(10, "Telefone inválido").max(15)),
  mensagem: z.string().trim().max(800).optional().or(z.literal("")),
});
export type TesteWhatsappInput = z.infer<typeof testeWhatsappSchema>;

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
