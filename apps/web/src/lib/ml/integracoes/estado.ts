import "server-only";
import { mlDb } from "../db";
import { gerarState } from "./pkce";
import type { Provider } from "../segredos";

export type StatusIntegracao = "disconnected" | "connected" | "expiring" | "error" | "invalid" | "insufficient_scope";

export interface IntegracaoRow {
  provider: Provider;
  status: StatusIntegracao;
  account_id: string | null;
  account_name: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  secret_hints: Record<string, string>;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  connected_at: string | null;
  last_refresh_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  lock_until: string | null;
  updated_at: string;
}

export async function lerIntegracao(provider: Provider): Promise<IntegracaoRow> {
  const { data, error } = await mlDb().from("ml_integrations").select("*").eq("provider", provider).single();
  if (error) throw new Error(`Integração ${provider} não encontrada: ${error.message}`);
  return data as IntegracaoRow;
}

export async function atualizarIntegracao(provider: Provider, patch: Partial<IntegracaoRow>): Promise<void> {
  const { error } = await mlDb().from("ml_integrations").update(patch).eq("provider", provider);
  if (error) throw new Error(`Falha ao atualizar integração ${provider}: ${error.message}`);
}

/** Mescla `config` (não sensível) sem perder chaves existentes. */
export async function mesclarConfigIntegracao(provider: Provider, parcial: Record<string, unknown>): Promise<void> {
  const atual = await lerIntegracao(provider);
  await atualizarIntegracao(provider, { config: { ...atual.config, ...parcial } });
}

export async function mesclarHints(provider: Provider, parcial: Record<string, string | null>): Promise<void> {
  const atual = await lerIntegracao(provider);
  const hints: Record<string, string> = { ...atual.secret_hints };
  for (const [k, v] of Object.entries(parcial)) {
    if (v == null) delete hints[k];
    else hints[k] = v;
  }
  await atualizarIntegracao(provider, { secret_hints: hints });
}

// ---------------------------------------------------------------------------
// OAuth: state de uso único + PKCE
// ---------------------------------------------------------------------------
export { gerarPkce } from "./pkce";

export async function criarStateOAuth(p: {
  provider: "mercadolivre" | "pinterest";
  userId: string;
  returnTo?: string;
  codeVerifier?: string | null;
}): Promise<string> {
  const state = gerarState();
  const { error } = await mlDb()
    .from("ml_oauth_states")
    .insert({
      state,
      provider: p.provider,
      profile_id: p.userId,
      return_to: p.returnTo ?? "/ml/integracoes",
      code_verifier: p.codeVerifier ?? null,
    });
  if (error) throw new Error(`Falha ao iniciar OAuth: ${error.message}`);
  // limpeza oportunista de states vencidos
  await mlDb().from("ml_oauth_states").delete().lt("expires_at", new Date().toISOString());
  return state;
}

/** Consome (apaga) o state; null se inexistente, de outro provedor ou vencido. */
export async function consumirStateOAuth(
  state: string,
  provider: "mercadolivre" | "pinterest",
): Promise<{ profile_id: string | null; return_to: string | null; code_verifier: string | null } | null> {
  const { data } = await mlDb()
    .from("ml_oauth_states")
    .delete()
    .eq("state", state)
    .eq("provider", provider)
    .select("profile_id, return_to, code_verifier, expires_at")
    .maybeSingle();
  const row = data as { profile_id: string | null; return_to: string | null; code_verifier: string | null; expires_at: string } | null;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/** Base pública do app para montar redirect_uri (precisa bater com o cadastrado no provedor). */
export function urlBaseApp(origemRequisicao?: string | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/$/, "");
  return (origemRequisicao ?? env ?? "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(provider: "mercadolivre" | "pinterest", origem?: string | null): string {
  return `${urlBaseApp(origem)}/api/ml/oauth/${provider}/callback`;
}
