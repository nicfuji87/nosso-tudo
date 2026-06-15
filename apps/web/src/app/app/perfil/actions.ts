"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const perfilSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  telefone: z.string().trim().max(20).optional().or(z.literal("")),
});

export async function atualizarPerfil(input: { nome: string; telefone?: string }): Promise<{ error?: string }> {
  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou." };

  const { error } = await supabase
    .from("profiles")
    .update({ nome: parsed.data.nome, telefone: parsed.data.telefone || null })
    .eq("id", user.id);
  if (error) return { error: "Não foi possível atualizar o perfil." };

  revalidatePath("/app", "layout");
  return {};
}
