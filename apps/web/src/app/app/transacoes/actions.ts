"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transacaoSchema, type TransacaoInput } from "@/lib/schemas/transacao";
import { normalizarTexto } from "@/lib/normalize";
import { resolverContexto } from "@/lib/classificacao";

async function getWorkspaceId(): Promise<{ workspaceId?: string; userId?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { default_workspace_id: string | null } | null)?.default_workspace_id;
  if (!workspaceId) return { error: "Workspace não encontrado.", userId: user.id };
  return { workspaceId, userId: user.id };
}

/** Resolve estabelecimento por nome (match exato normalizado) ou cria novo. */
async function resolverEstabelecimento(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  nomeRaw: string,
): Promise<string | null> {
  const nome = nomeRaw.trim();
  if (!nome) return null;
  const norm = normalizarTexto(nome);
  const { data: existente } = await supabase
    .from("estabelecimentos")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("nome_normalizado", norm)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;

  const { data: novo } = await supabase
    .from("estabelecimentos")
    .insert({
      workspace_id: workspaceId,
      nome,
      nome_normalizado: norm,
      origem_criacao: "app",
      status_revisao: "confirmado",
    })
    .select("id")
    .maybeSingle();
  return (novo as { id: string } | null)?.id ?? null;
}

export async function criarTransacao(input: TransacaoInput): Promise<{ error?: string; id?: string }> {
  const parsed = transacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const { workspaceId, userId, error: ctxErr } = await getWorkspaceId();
  if (ctxErr || !workspaceId) return { error: ctxErr ?? "Workspace não encontrado." };

  const supabase = createClient();
  const estabelecimentoId = d.estabelecimento
    ? await resolverEstabelecimento(supabase, workspaceId, d.estabelecimento)
    : null;
  const contextoId = d.contexto ? await resolverContexto(supabase, workspaceId, d.contexto) : null;

  const { data: nova, error } = await supabase
    .from("transacoes")
    .insert({
      workspace_id: workspaceId,
      tipo: d.tipo,
      descricao: d.descricao,
      valor: d.valor,
      data_transacao: d.data_transacao,
      categoria_id: d.categoria_id ?? null,
      meio_pagamento: d.meio_pagamento ?? null,
      cartao_id: d.cartao_id ?? null,
      conta_id: d.conta_id ?? null,
      pagador_id: d.pagador_id ?? null,
      beneficiario_id: d.beneficiario_id ?? null,
      estabelecimento_id: estabelecimentoId,
      contexto_id: contextoId,
      observacoes: d.observacoes ?? null,
      tags: d.tags,
      origem: "app",
      criado_por: userId,
      status_revisao: "confirmado",
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: "Não foi possível salvar a transação." };

  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  return { id: (nova as { id: string } | null)?.id };
}

export async function excluirTransacao(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("transacoes").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir a transação." };
  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  return {};
}
