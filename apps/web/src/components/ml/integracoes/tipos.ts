/** Tipos compartilhados da tela de Integrações (client-safe — nada de segredo aqui). */

export type StatusIntegracao = "disconnected" | "connected" | "expiring" | "error" | "invalid" | "insufficient_scope";

/** Linha de `ml_integrations` como a UI enxerga: só metadados e máscaras (`secret_hints`). */
export interface IntegracaoView {
  provider: "mercadolivre" | "pinterest" | "openai" | "apify";
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
}

export interface Permissoes {
  /** operator+: testar, sincronizar, diagnóstico */
  operar: boolean;
  /** admin+: editar credenciais, conectar, desconectar */
  administrar: boolean;
}

export const NOME_PROVEDOR: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  pinterest: "Pinterest",
  openai: "OpenAI",
  apify: "Apify",
};

/** Lê um campo string de `config` com segurança. */
export function cfgTexto(config: Record<string, unknown>, chave: string): string {
  const v = config[chave];
  return typeof v === "string" ? v : "";
}

/** Já tem vínculo (mesmo que com erro) — o botão principal vira "Reconectar". */
export function jaVinculado(status: StatusIntegracao): boolean {
  return status !== "disconnected";
}
