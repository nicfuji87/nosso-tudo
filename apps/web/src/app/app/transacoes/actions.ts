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

/** Soma `n` meses a uma data ISO (YYYY-MM-DD), com clamp no último dia do mês. */
function addMonthsISO(iso: string, n: number): string {
  const partes = iso.split("-");
  const y = Number(partes[0]);
  const m = Number(partes[1]);
  const d = Number(partes[2]);
  const total = m - 1 + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0..11
  const ultimoDia = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, ultimoDia);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  // Campos comuns a todas as linhas (uma só, ou N parcelas).
  const base = {
    workspace_id: workspaceId,
    tipo: d.tipo,
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
    origem: "app" as const,
    criado_por: userId,
    status_revisao: "confirmado" as const,
  };

  const parcelas = d.parcelas && d.parcelas > 1 ? Math.min(60, Math.floor(d.parcelas)) : 1;

  if (parcelas === 1) {
    const { data: nova, error } = await supabase
      .from("transacoes")
      .insert({ ...base, descricao: d.descricao, valor: d.valor, data_transacao: d.data_transacao })
      .select("id")
      .maybeSingle();
    if (error) return { error: "Não foi possível salvar a transação." };
    revalidatePath("/app");
    revalidatePath("/app/transacoes");
    return { id: (nova as { id: string } | null)?.id };
  }

  // Parcelado: `valor` é o total; gera N lançamentos (1 por mês). A 1ª parcela é
  // a "pai"; as demais apontam para ela (transacao_pai_id) → excluir a pai
  // remove a série inteira (FK ON DELETE CASCADE). A sobra de centavos vai na 1ª.
  const centavos = Math.round(d.valor * 100);
  const baseParc = Math.floor(centavos / parcelas);
  const resto = centavos - baseParc * parcelas;
  let paiId: string | null = null;
  for (let i = 0; i < parcelas; i++) {
    const valorParc = (baseParc + (i === 0 ? resto : 0)) / 100;
    const linha: Record<string, unknown> = {
      ...base,
      descricao: `${d.descricao} (${i + 1}/${parcelas})`,
      valor: valorParc,
      data_transacao: addMonthsISO(d.data_transacao, i),
      eh_parcelado: true,
      total_parcelas: parcelas,
      numero_parcela: i + 1,
      transacao_pai_id: paiId,
    };
    const { data: nova, error } = await supabase
      .from("transacoes")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (error) return { error: "Não foi possível salvar as parcelas." };
    if (i === 0) paiId = (nova as { id: string } | null)?.id ?? null;
  }

  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  return { id: paiId ?? undefined };
}

export async function excluirTransacao(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("transacoes").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir a transação." };
  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  return {};
}
