import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com service_role — IGNORA RLS. Usar APENAS no servidor, em fluxos
 * privilegiados e bem auditados (ex.: webhooks Asaas, jobs). Nunca expor a
 * SUPABASE_SERVICE_ROLE_KEY ao browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
