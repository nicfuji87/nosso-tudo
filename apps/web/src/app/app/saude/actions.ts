"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveWorkspaceId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

// ============================================================ Diário de saúde

const TIPOS_EVENTO = ["treino", "sintoma", "malestar", "medicamento", "alcool", "cafeina", "doenca", "estresse", "sono", "nota"] as const;
const quando = z.string().datetime({ offset: true });

const eventoSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO),
  inicio: quando,
  fim: quando.nullable().optional(),
  nota: z.string().trim().max(500).optional(),
  detalhes: z
    .object({
      modalidade: z.string().trim().max(40).optional(),
      esforco: z.number().int().min(0).max(10).optional(),
      intensidade: z.number().int().min(1).max(5).optional(),
      situacao: z.enum(["deitado", "levantando", "parado", "esforco", "outro"]).optional(),
      sintomas: z.array(z.string().trim().max(40)).max(12).optional(),
      quantidade: z.string().trim().max(60).optional(),
    })
    .default({}),
  origem: z.enum(["manual", "detectado"]).default("manual"),
});

/** Registra um evento no diário (sintoma, mal-estar, medicamento, álcool, treino manual…). */
export async function registrarEvento(raw: unknown): Promise<Resultado> {
  const p = eventoSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  if (p.data.fim && p.data.fim < p.data.inicio) return { error: "O fim precisa ser depois do início." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };

  const supabase = createClient();
  const { error } = await supabase.from("saude_eventos").insert({
    workspace_id: ctx.workspaceId,
    tipo: p.data.tipo,
    inicio: p.data.inicio,
    fim: p.data.fim ?? null,
    nota: p.data.nota || null,
    detalhes: p.data.detalhes,
    origem: p.data.origem,
    algoritmo: p.data.origem === "detectado" ? "treino-v1" : null,
  });
  if (error) return { error: "Não foi possível salvar no diário." };
  revalidatePath("/app/saude");
  return { ok: true };
}

/** "Não foi treino": guarda o descarte para a sugestão não voltar. */
export async function descartarTreino(raw: unknown): Promise<Resultado> {
  const p = z.object({ inicio: quando, fim: quando }).safeParse(raw);
  if (!p.success) return { error: "Treino inválido." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("saude_eventos").insert({
    workspace_id: ctx.workspaceId, tipo: "treino", inicio: p.data.inicio, fim: p.data.fim,
    origem: "detectado", descartado: true, algoritmo: "treino-v1",
  });
  if (error) return { error: "Não foi possível descartar." };
  revalidatePath("/app/saude");
  return { ok: true };
}

export async function excluirEvento(id: string): Promise<Resultado> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Evento inválido." };
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("saude_eventos").delete().eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: "Não foi possível excluir." };
  revalidatePath("/app/saude");
  return { ok: true };
}

/**
 * Confirma um treino detectado em 1 ou 2 partes (ex.: musculação 06:00–06:30 + natação 06:30–07:00).
 * Cada parte vira um evento próprio; o painel calcula os números de cada intervalo.
 */
const parteSchema = z.object({ inicio: quando, fim: quando, modalidade: z.string().trim().min(1).max(40) });
const confirmarSchema = z.object({
  partes: z.array(parteSchema).min(1).max(3),
  esforco: z.number().int().min(0).max(10).nullable().optional(),
});

export async function confirmarTreino(raw: unknown): Promise<Resultado> {
  const p = confirmarSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Treino inválido." };
  for (const parte of p.data.partes) {
    if (new Date(parte.fim) <= new Date(parte.inicio)) return { error: "Cada parte precisa terminar depois de começar." };
  }
  const ctx = await resolveWorkspaceId();
  if ("error" in ctx) return { error: ctx.error };
  const supabase = createClient();
  const { error } = await supabase.from("saude_eventos").insert(
    p.data.partes.map((parte) => ({
      workspace_id: ctx.workspaceId, tipo: "treino", inicio: parte.inicio, fim: parte.fim, origem: "detectado", algoritmo: "treino-v1",
      detalhes: { modalidade: parte.modalidade, ...(p.data.esforco != null ? { esforco: p.data.esforco } : {}) },
    })),
  );
  if (error) return { error: "Não foi possível salvar o treino." };
  revalidatePath("/app/saude");
  return { ok: true };
}
