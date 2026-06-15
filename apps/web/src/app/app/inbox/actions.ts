"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve uma sugestão de match (pré-conferência):
 * - 'mesmo'     → vira alias do existente, reaponta e remove a duplicata (confirmar_match)
 * - 'diferente' → mantém os dois como registros independentes
 */
export async function resolverSugestao(
  sugestaoId: string,
  decisao: "mesmo" | "diferente",
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("confirmar_match", {
    p_sugestao_id: sugestaoId,
    p_decisao: decisao,
  });
  if (error) return { error: "Não foi possível registrar sua escolha." };
  revalidatePath("/app/inbox");
  revalidatePath("/app");
  return {};
}
