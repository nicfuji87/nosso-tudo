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

function revalidarRevisao() {
  revalidatePath("/app/inbox");
  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  revalidatePath("/app/relatorios");
}

/** Aprova uma transação pendente (ex.: conta fixa gerada) — passa a contar no saldo. */
export async function confirmarTransacaoRevisao(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("transacoes").update({ status_revisao: "confirmado" }).eq("id", id);
  if (error) return { error: "Não foi possível confirmar." };
  revalidarRevisao();
  return {};
}

/** Ajusta o valor (contas que variam, ex.: luz) e confirma de uma vez. */
export async function ajustarEConfirmarTransacao(id: string, valor: number): Promise<{ error?: string }> {
  if (!(valor > 0)) return { error: "Informe um valor maior que zero." };
  const supabase = createClient();
  const { error } = await supabase
    .from("transacoes")
    .update({ valor, status_revisao: "confirmado" })
    .eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidarRevisao();
  return {};
}

/** Descarta uma transação pendente ("não veio esse mês") — remove do histórico. */
export async function descartarTransacaoRevisao(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("transacoes").delete().eq("id", id);
  if (error) return { error: "Não foi possível descartar." };
  revalidarRevisao();
  return {};
}
