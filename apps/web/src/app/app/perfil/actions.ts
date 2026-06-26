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

async function getWorkspaceId(): Promise<{ workspaceId?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { default_workspace_id: string | null } | null)?.default_workspace_id;
  if (!workspaceId) return { error: "Workspace não encontrado." };
  return { workspaceId };
}

/** Lê a memória da família que a Nia usa como contexto (nia_contexto.fatos). */
export async function getMemoriaNia(): Promise<string[]> {
  const { workspaceId } = await getWorkspaceId();
  if (!workspaceId) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_contexto")
    .select("fatos")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const fatos = (data as { fatos: unknown } | null)?.fatos;
  return Array.isArray(fatos) ? (fatos.filter((f) => typeof f === "string") as string[]) : [];
}

const fatosSchema = z.array(z.string().trim().min(1).max(300)).max(50);

/** Salva a memória da família editada no perfil (substitui a lista de fatos). */
export async function salvarMemoriaNia(fatos: string[]): Promise<{ error?: string; ok?: boolean }> {
  const { workspaceId, error } = await getWorkspaceId();
  if (error || !workspaceId) return { error: error ?? "Workspace não encontrado." };

  const limpos = (Array.isArray(fatos) ? fatos : []).map((f) => String(f).trim()).filter(Boolean).slice(0, 50);
  const parsed = fatosSchema.safeParse(limpos);
  if (!parsed.success) return { error: "Algum item ficou muito longo (máx. 300 caracteres)." };

  const supabase = createClient();
  // upsert só toca workspace_id/fatos/atualizado_em — rotina/preferencias ficam intactas.
  const { error: e } = await supabase
    .from("nia_contexto")
    .upsert(
      { workspace_id: workspaceId, fatos: parsed.data, atualizado_em: new Date().toISOString() },
      { onConflict: "workspace_id" },
    );
  if (e) return { error: "Não foi possível salvar a memória." };

  revalidatePath("/app/perfil");
  return { ok: true };
}
