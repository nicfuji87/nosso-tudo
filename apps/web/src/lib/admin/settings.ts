import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acesso à config global de integrações (`integration_settings`).
 * A tabela tem RLS deny-all; só o service_role (este módulo, server-only) lê/escreve.
 * Segredos NUNCA são enviados ao browser em claro — use as variantes `*Public`.
 */

export type AsaasEnvironment = "sandbox" | "production";

export interface AsaasConfig {
  environment: AsaasEnvironment;
  apiKey: string | null;
  webhookToken: string | null;
}

export interface WhatsappConfig {
  uazapiUrl: string | null;
  n8nWebhookUrl: string | null;
  uazapiToken: string | null;
  ingestSecret: string | null;
}

/** Mascara um segredo deixando só os últimos 4 caracteres. */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  const tail = secret.slice(-4);
  return `••••${tail}`;
}

interface SettingsRow {
  valor: Record<string, unknown>;
  secrets: Record<string, string>;
  updated_at: string;
}

async function readSettings(key: string): Promise<SettingsRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_settings")
    .select("valor, secrets, updated_at")
    .eq("key", key)
    .maybeSingle();
  return (data as SettingsRow | null) ?? null;
}

/**
 * Faz merge de `valor` (não-sensível) e `secrets` (sensível).
 * Em secrets: `undefined` = manter atual · `""`/`null` = limpar · string = sobrescrever.
 */
async function saveSettings(
  key: string,
  valor: Record<string, unknown>,
  secrets: Record<string, string | null | undefined>,
  updatedBy: string,
): Promise<void> {
  const admin = createAdminClient();
  const existing = await readSettings(key);
  const newValor = { ...(existing?.valor ?? {}) };
  for (const [k, v] of Object.entries(valor)) {
    if (v !== undefined) newValor[k] = v; // undefined = manter atual
  }
  const newSecrets: Record<string, string> = { ...(existing?.secrets ?? {}) };
  for (const [k, v] of Object.entries(secrets)) {
    if (v === undefined) continue;
    if (v === null || v === "") delete newSecrets[k];
    else newSecrets[k] = v;
  }
  await admin
    .from("integration_settings")
    .update({
      valor: newValor,
      secrets: newSecrets,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);
}

// ---- Asaas -----------------------------------------------------------------

export async function getAsaasConfig(): Promise<AsaasConfig> {
  const row = await readSettings("asaas");
  return {
    environment: row?.valor?.environment === "production" ? "production" : "sandbox",
    apiKey: row?.secrets?.api_key ?? null,
    webhookToken: row?.secrets?.webhook_token ?? null,
  };
}

export interface AsaasPublic {
  environment: AsaasEnvironment;
  apiKeyHint: string | null;
  hasWebhookToken: boolean;
  updatedAt: string | null;
}

export async function getAsaasPublic(): Promise<AsaasPublic> {
  const row = await readSettings("asaas");
  return {
    environment: row?.valor?.environment === "production" ? "production" : "sandbox",
    apiKeyHint: maskSecret(row?.secrets?.api_key),
    hasWebhookToken: Boolean(row?.secrets?.webhook_token),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveAsaas(
  input: { environment: AsaasEnvironment; apiKey?: string; webhookToken?: string },
  updatedBy: string,
): Promise<void> {
  await saveSettings(
    "asaas",
    { environment: input.environment },
    { api_key: input.apiKey, webhook_token: input.webhookToken },
    updatedBy,
  );
}

// ---- WhatsApp / uazapi + n8n ------------------------------------------------

export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  const row = await readSettings("whatsapp");
  return {
    uazapiUrl: (row?.valor?.uazapi_url as string) ?? null,
    n8nWebhookUrl: (row?.valor?.n8n_webhook_url as string) ?? null,
    uazapiToken: row?.secrets?.uazapi_token ?? null,
    ingestSecret: row?.secrets?.ingest_secret ?? null,
  };
}

export interface WhatsappPublic {
  uazapiUrl: string | null;
  n8nWebhookUrl: string | null;
  uazapiTokenHint: string | null;
  ingestSecretHint: string | null;
  hasIngestSecret: boolean;
  updatedAt: string | null;
}

export async function getWhatsappPublic(): Promise<WhatsappPublic> {
  const row = await readSettings("whatsapp");
  return {
    uazapiUrl: (row?.valor?.uazapi_url as string) ?? null,
    n8nWebhookUrl: (row?.valor?.n8n_webhook_url as string) ?? null,
    uazapiTokenHint: maskSecret(row?.secrets?.uazapi_token),
    ingestSecretHint: maskSecret(row?.secrets?.ingest_secret),
    hasIngestSecret: Boolean(row?.secrets?.ingest_secret),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveWhatsapp(
  input: { uazapiUrl?: string; n8nWebhookUrl?: string; uazapiToken?: string; ingestSecret?: string },
  updatedBy: string,
): Promise<void> {
  await saveSettings(
    "whatsapp",
    { uazapi_url: input.uazapiUrl, n8n_webhook_url: input.n8nWebhookUrl },
    { uazapi_token: input.uazapiToken, ingest_secret: input.ingestSecret },
    updatedBy,
  );
}

/**
 * Config para disparar a Edge Function de alertas (nia-alertas-cron).
 * `cronSecret` é o segredo compartilhado com o pg_cron; o admin reusa para
 * "disparar agora" / "enviar teste". `uazapiPronto` indica se há credencial
 * de envio (URL + token) cadastrada.
 */
export interface WhatsappDispatch {
  baseUrl: string | null;
  cronSecret: string | null;
  uazapiPronto: boolean;
}

export async function getWhatsappDispatch(): Promise<WhatsappDispatch> {
  const row = await readSettings("whatsapp");
  return {
    baseUrl: (row?.valor?.functions_base_url as string) ?? null,
    cronSecret: row?.secrets?.cron_secret ?? null,
    uazapiPronto: Boolean(row?.valor?.uazapi_url && row?.secrets?.uazapi_token),
  };
}

// ---- Nia (assistente de IA) -------------------------------------------------
// As keys ficam em secrets["<provedor>_api_key"] — o mesmo nome que lib/nia/config lê.

export interface NiaPublic {
  provider: string;
  anthropicKeyHint: string | null;
  hasAnthropicKey: boolean;
  openaiKeyHint: string | null;
  hasOpenaiKey: boolean;
  updatedAt: string | null;
}

export async function getNiaPublic(): Promise<NiaPublic> {
  const row = await readSettings("nia");
  return {
    provider: (row?.valor?.provider_default as string) ?? "anthropic",
    anthropicKeyHint: maskSecret(row?.secrets?.anthropic_api_key),
    hasAnthropicKey: Boolean(row?.secrets?.anthropic_api_key),
    openaiKeyHint: maskSecret(row?.secrets?.openai_api_key),
    hasOpenaiKey: Boolean(row?.secrets?.openai_api_key),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveNia(
  input: { anthropicApiKey?: string; openaiApiKey?: string },
  updatedBy: string,
): Promise<void> {
  await saveSettings(
    "nia",
    {},
    { anthropic_api_key: input.anthropicApiKey, openai_api_key: input.openaiApiKey },
    updatedBy,
  );
}
