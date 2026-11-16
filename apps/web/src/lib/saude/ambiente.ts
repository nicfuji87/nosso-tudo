import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Ambientes do módulo Saúde — os dois no MESMO projeto Supabase (o do Nosso Tudo):
 *
 * - production : workspaces reais. Só o site publicado escreve aqui.
 * - development: um workspace de TESTE (workspaces.settings.saude_ambiente = "development"),
 *                de um usuário de teste, com dados sintéticos. É o que `next dev` usa para testar.
 *
 * O ambiente do site vem de NEXT_PUBLIC_APP_ENV; sem ela, `next dev` = development e build = production.
 * Trava: em development, ações de Saúde só ESCREVEM em workspace de teste. Leitura é livre.
 */

export type Ambiente = "production" | "development";

export function ambienteAtual(): Ambiente {
  const v = process.env.NEXT_PUBLIC_APP_ENV;
  if (v === "production" || v === "development") return v;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export async function workspaceDeTeste(workspaceId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase.from("workspaces").select("settings").eq("id", workspaceId).maybeSingle();
  const settings = ((data as { settings?: unknown } | null)?.settings ?? {}) as Record<string, unknown>;
  return settings.saude_ambiente === "development";
}

/** Mensagem de erro se a escrita deve ser bloqueada; `null` se pode escrever. */
export async function bloqueioDeEscrita(workspaceId: string): Promise<string | null> {
  if (ambienteAtual() === "production") return null;
  if (await workspaceDeTeste(workspaceId)) return null;
  return "Site local (development) em um workspace real: alterações de Saúde estão bloqueadas. Entre com o usuário de teste.";
}

/** Rótulo para o selo da página (só aparece fora de produção). */
export async function rotuloAmbiente(workspaceId: string): Promise<{ texto: string; alerta: boolean } | null> {
  if (ambienteAtual() === "production") return null;
  return (await workspaceDeTeste(workspaceId))
    ? { texto: "DEV · workspace de teste (dados sintéticos)", alerta: false }
    : { texto: "DEV · workspace real — somente leitura", alerta: true };
}
