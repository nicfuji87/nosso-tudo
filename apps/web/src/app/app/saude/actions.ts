"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveWorkspaceId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bloqueioDeEscrita } from "@/lib/saude/ambiente";

/**
 * Vincula um relógio pelo código de 6 letras que ele mostra na tela.
 * Quem valida tudo é a RPC `saude_vincular_dispositivo` (SECURITY DEFINER):
 * confere que o usuário é membro do workspace e que o código está válido.
 */

type Resultado = { error?: string; ok?: boolean };

const ERROS: Record<string, string> = {
  codigo_invalido_ou_expirado: "Código inválido ou expirado. Gere outro no relógio.",
  sem_acesso_ao_workspace: "Você não tem acesso a este espaço.",
  nao_autenticado: "Sua sessão expirou. Entre novamente.",
};

const schema = z.object({
  codigo: z
    .string()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((v) => /^[A-Z2-9]{6}$/.test(v), "O código tem 6 letras/números, como aparece no relógio."),
  nome: z.string().trim().max(40).optional(),
});

export async function vincularRelogio(raw: unknown): Promise<Resultado> {
  const bloqueio = bloqueioDeEscrita();
  if (bloqueio) return { error: bloqueio };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase.rpc("saude_vincular_dispositivo", {
    p_workspace_id: ctx.workspaceId,
    p_codigo: parsed.data.codigo,
    p_nome: parsed.data.nome || null,
  });
  if (error) {
    const chave = Object.keys(ERROS).find((k) => error.message.includes(k));
    return { error: chave ? ERROS[chave] : "Não foi possível conectar o relógio." };
  }

  revalidatePath("/app/saude");
  return { ok: true };
}

export async function desvincularRelogio(dispositivoId: string): Promise<Resultado> {
  const bloqueio = bloqueioDeEscrita();
  if (bloqueio) return { error: bloqueio };
  if (!z.string().uuid().safeParse(dispositivoId).success) return { error: "Relógio inválido." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  // RLS (p_ws_update) garante que só membros do workspace alteram; GRANT só libera nome/revogado_em.
  const supabase = createClient();
  const { error } = await supabase
    .from("saude_dispositivos")
    .update({ revogado_em: new Date().toISOString() })
    .eq("id", dispositivoId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível desconectar." };

  revalidatePath("/app/saude");
  return { ok: true };
}
