"use server";

import { resolveWorkspaceId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { criarTransacao, excluirTransacao } from "@/app/app/transacoes/actions";
import { criarEntidade } from "@/app/app/cadastros/actions";
import { listCategorias } from "@/lib/db/queries";
import { criarCompromissoArgs, criarPessoaArgs, lancarTransacaoArgs } from "@/lib/nia/schemas";
import { atualizarAcao, votar } from "@/lib/nia/store";
import { normalizarTexto } from "@/lib/normalize";

interface AcaoRow {
  id: string;
  workspace_id: string;
  ferramenta: string;
  status: string;
  payload_proposto: unknown;
  registro_id: string | null;
}

async function carregarAcao(acaoId: string): Promise<AcaoRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_acoes")
    .select("id, workspace_id, ferramenta, status, payload_proposto, registro_id")
    .eq("id", acaoId)
    .maybeSingle();
  return (data as AcaoRow | null) ?? null;
}

/** Executa o lançamento proposto pela Nia, após confirmação do usuário. */
export async function confirmarTransacao(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao") return { error: "Ação não suportada." };

  const parsed = lancarTransacaoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  // Resolve categoria por nome (match exato normalizado), se informada.
  let categoriaId: string | undefined;
  if (d.categoria) {
    const alvo = normalizarTexto(d.categoria);
    const cats = await listCategorias(acao.workspace_id);
    categoriaId = cats.find((c) => normalizarTexto(c.nome) === alvo)?.id;
  }

  const res = await criarTransacao({
    tipo: d.tipo,
    descricao: d.descricao,
    valor: d.valor,
    data_transacao: d.data_transacao ?? new Date().toISOString().slice(0, 10),
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    estabelecimento: d.estabelecimento,
    tags: [],
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true }, registroId: res.id });
  return { ok: true };
}

/** Cadastra a pessoa/grupo proposto pela Nia. */
export async function confirmarPessoa(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_pessoa") return { error: "Ação não suportada." };

  const parsed = criarPessoaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };

  const res = await criarEntidade({ nome: parsed.data.nome, tipo: parsed.data.tipo });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Cria o compromisso (compra coletiva) proposto pela Nia. */
export async function confirmarCompromisso(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_compromisso") return { error: "Ação não suportada." };

  const parsed = criarCompromissoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const supabase = createClient();

  // Garante uma categoria de comportamento 'compromisso' (cria "Compras coletivas" se faltar).
  const { data: cat } = await supabase
    .from("categorias")
    .select("id")
    .eq("workspace_id", acao.workspace_id)
    .eq("comportamento", "compromisso")
    .eq("ativa", true)
    .limit(1)
    .maybeSingle();
  let categoriaId = (cat as { id: string } | null)?.id;
  if (!categoriaId) {
    const slug = `compras-coletivas-${Date.now().toString(36)}`;
    const { data: novaCat } = await supabase
      .from("categorias")
      .insert({
        workspace_id: acao.workspace_id,
        nome: "Compras coletivas",
        slug,
        comportamento: "compromisso",
        icone: "🛍️",
      })
      .select("id")
      .maybeSingle();
    categoriaId = (novaCat as { id: string } | null)?.id;
  }
  if (!categoriaId) return { error: "Não consegui preparar a categoria do compromisso." };

  const { data: col, error } = await supabase
    .from("colecoes")
    .insert({
      workspace_id: acao.workspace_id,
      categoria_id: categoriaId,
      nome: d.nome,
      valor_estimado: d.valor_estimado ?? null,
      data_estimada_entrega: d.data_estimada_entrega ?? null,
      status_compromisso: "aberto",
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: "Não foi possível criar o compromisso." };

  await atualizarAcao(acaoId, {
    status: "executada",
    resultado: { ok: true },
    registroId: (col as { id: string } | null)?.id ?? null,
  });
  return { ok: true };
}

/** Desfaz um lançamento recém-confirmado (DN3: alta confiança = auto + desfazer). */
export async function desfazerTransacao(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "executada") return { error: "Nada para desfazer." };
  if (acao.ferramenta !== "lancar_transacao" || !acao.registro_id) {
    return { error: "Essa ação não pode ser desfeita." };
  }

  const res = await excluirTransacao(acao.registro_id);
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "desfeita" });
  return { ok: true };
}

/** Descarta uma proposta da Nia. */
export async function rejeitarAcao(acaoId: string): Promise<{ ok: boolean }> {
  await atualizarAcao(acaoId, { status: "rejeitada" });
  return { ok: true };
}

/** Voto 👍/👎 numa mensagem da Nia (alimenta a análise conversacional). */
export async function votarMensagem(
  mensagemId: string,
  voto: "positivo" | "negativo",
): Promise<{ ok: boolean }> {
  if (voto !== "positivo" && voto !== "negativo") return { ok: false };
  const wk = await resolveWorkspaceId();
  if ("error" in wk) return { ok: false };
  await votar(mensagemId, wk.workspaceId, wk.userId, voto);
  return { ok: true };
}
