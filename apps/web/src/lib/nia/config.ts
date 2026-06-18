import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Config do agente Nia (provedor, modelo, prompt) e cálculo de custo.
 * Lê de tabelas deny-all (nia_config, nia_precos, integration_settings) via service_role.
 * O super admin edita esses valores em /app/admin/nia — trocar provedor/modelo é dado, não deploy.
 */

export interface NiaConfig {
  provedor: string;
  modelo: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

const FALLBACK: NiaConfig = {
  provedor: "anthropic",
  modelo: "claude-haiku-4-5",
  systemPrompt:
    "Você é a Nia, assistente do Nosso Tudo. Fale português do Brasil, de forma breve e clara. " +
    "Use as ferramentas para qualquer dado financeiro; nunca invente. Proponha ações e só execute o que o usuário confirmar.",
  temperature: 0.3,
  // Alto o bastante para caber um tool-call de nota itemizada. max_tokens é só um
  // teto: não muda o custo (cobra-se pelo que é de fato gerado).
  maxTokens: 8192,
};

/** Config ativa de escopo global (versão mais recente). Cai no fallback se ausente. */
export async function getNiaConfig(): Promise<NiaConfig> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("nia_config")
    .select("system_prompt, provedor, modelo, parametros")
    .eq("escopo", "global")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return FALLBACK;
  const row = data as {
    system_prompt: string;
    provedor: string;
    modelo: string;
    parametros: { temperature?: number; max_tokens?: number } | null;
  };
  return {
    provedor: row.provedor,
    modelo: row.modelo,
    systemPrompt: row.system_prompt,
    temperature: row.parametros?.temperature ?? FALLBACK.temperature,
    maxTokens: row.parametros?.max_tokens ?? FALLBACK.maxTokens,
  };
}

/** API key do provedor escolhido (integration_settings key='nia', secrets["<provedor>_api_key"]). */
export async function getApiKey(provedor: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_settings")
    .select("secrets")
    .eq("key", "nia")
    .maybeSingle();
  const secrets = (data as { secrets: Record<string, string> } | null)?.secrets ?? {};
  return secrets[`${provedor}_api_key`] ?? null;
}

/**
 * Custo estimado em USD a partir de nia_precos. `tokensCache` é o subconjunto de
 * `tokensInput` que veio do cache (preço reduzido, se houver). Null se sem preço.
 */
export async function calcularCusto(
  provedor: string,
  modelo: string,
  tokensInput: number,
  tokensOutput: number,
  tokensCache = 0,
): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("nia_precos")
    .select("preco_entrada_por_milhao, preco_saida_por_milhao, preco_entrada_cache_por_milhao")
    .eq("provedor", provedor)
    .eq("modelo", modelo)
    .maybeSingle();
  if (!data) return null;
  const p = data as {
    preco_entrada_por_milhao: number;
    preco_saida_por_milhao: number;
    preco_entrada_cache_por_milhao: number | null;
  };
  const entrada = Number(p.preco_entrada_por_milhao);
  const precoCache = p.preco_entrada_cache_por_milhao != null ? Number(p.preco_entrada_cache_por_milhao) : entrada;
  const naoCache = Math.max(0, tokensInput - tokensCache);
  const custo =
    (naoCache / 1_000_000) * entrada +
    (tokensCache / 1_000_000) * precoCache +
    (tokensOutput / 1_000_000) * Number(p.preco_saida_por_milhao);
  return Number(custo.toFixed(6));
}
