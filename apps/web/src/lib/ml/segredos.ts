import "server-only";
import { mlDb } from "./db";

/**
 * Segredos do ML no Supabase Vault (cifrados em repouso). Nomes:
 * `ml/<provider>/<campo>`. Só service_role consegue ler/escrever (RPCs
 * ml_secret_get/ml_secret_set). Nunca devolva o valor ao browser — use `mascarar`.
 */
export type Provider = "mercadolivre" | "pinterest" | "openai" | "apify";

export function nomeSegredo(provider: Provider | "worker", campo: string): string {
  return `ml/${provider}/${campo}`;
}

export async function lerSegredo(provider: Provider | "worker", campo: string): Promise<string | null> {
  const { data, error } = await mlDb().rpc("ml_secret_get", { p_name: nomeSegredo(provider, campo) });
  if (error) throw new Error(`Falha ao ler segredo (${provider}/${campo}): ${error.message}`);
  return (data as string | null) ?? null;
}

/** `null`/"" apaga o segredo. */
export async function gravarSegredo(provider: Provider, campo: string, valor: string | null): Promise<void> {
  const { error } = await mlDb().rpc("ml_secret_set", { p_name: nomeSegredo(provider, campo), p_value: valor ?? "" });
  if (error) throw new Error(`Falha ao gravar segredo (${provider}/${campo}): ${error.message}`);
}

/** "••••abcd" — o máximo que pode chegar ao frontend. */
export function mascarar(segredo: string | null | undefined): string | null {
  if (!segredo) return null;
  return `••••${segredo.slice(-4)}`;
}

let cacheWorker: { valor: string; em: number } | null = null;

/** Segredo do worker (gerado pelo próprio banco na migration). Cache de 5 min. */
export async function segredoWorker(): Promise<string | null> {
  if (cacheWorker && Date.now() - cacheWorker.em < 300_000) return cacheWorker.valor;
  const v = await lerSegredo("worker", "secret");
  if (v) cacheWorker = { valor: v, em: Date.now() };
  return v;
}
