"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, type OnboardingInput } from "@/lib/schemas/onboarding";

/**
 * Conclui o onboarding (RF-002): provisiona o workspace (cria workspace +
 * entidade "Casa" + categorias padrão via RPC) e marca aceites/conclusão.
 */
export async function concluirOnboarding(input: OnboardingInput): Promise<{ error?: string }> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "Confira os dados e tente novamente." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data: workspaceId, error } = await supabase.rpc("provisionar_workspace", {
    p_nome: parsed.data.nomeWorkspace,
    p_owner_id: user.id,
  });
  if (error || !workspaceId) {
    return { error: "Não foi possível criar seu espaço. Tente novamente." };
  }

  const agora = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      onboarding_concluido: true,
      aceitou_termos_em: agora,
      aceitou_privacidade_em: agora,
      default_workspace_id: workspaceId as string,
    })
    .eq("id", user.id);
  if (upErr) return { error: "Erro ao finalizar. Tente novamente." };

  revalidatePath("/app", "layout");
  return {};
}
