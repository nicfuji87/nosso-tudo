import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cliente service_role do ML. Toda ESCRITA do módulo passa por aqui, sempre
 * depois de `requireMlAction` (ações) ou dentro de um job (worker). O browser
 * nunca escreve em tabelas ml_* (RLS só concede SELECT).
 */
let cliente: SupabaseClient | null = null;

export function mlDb(): SupabaseClient {
  cliente ??= createAdminClient();
  return cliente;
}

/** Lança erro legível se a operação do Supabase falhou. */
export function ok<T>(res: { data: T; error: { message: string; code?: string } | null }, contexto: string): T {
  if (res.error) throw new Error(`${contexto}: ${res.error.message}`);
  return res.data;
}
