"use server";

import { resolveWorkspaceId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { criarTransacao, excluirTransacao } from "@/app/app/transacoes/actions";
import { criarCartao, criarConta, criarCategoria, criarEntidade } from "@/app/app/cadastros/actions";
import { listCategorias, listEntidades } from "@/lib/db/queries";
import {
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
  criarPessoaArgs,
  lancarTransacaoArgs,
  lembrarFatoArgs,
} from "@/lib/nia/schemas";
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

/** Aprende um apelido para um estabelecimento (zona cinza confirmada como "o mesmo"). */
async function adicionarApelido(estabId: string, apelido: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase
    .from("estabelecimentos")
    .select("apelidos")
    .eq("id", estabId)
    .maybeSingle();
  const atuais = Array.isArray((data as { apelidos: string[] } | null)?.apelidos)
    ? (data as { apelidos: string[] }).apelidos
    : [];
  const norm = normalizarTexto(apelido);
  if (atuais.some((a) => normalizarTexto(a) === norm)) return;
  await supabase.from("estabelecimentos").update({ apelidos: [...atuais, apelido] }).eq("id", estabId);
}

/**
 * Executa o lançamento proposto pela Nia, após confirmação do usuário.
 * `decisaoMatch` resolve a zona cinza de estabelecimento: "mesmo" vincula ao
 * candidato (e aprende o apelido); "outro" cria um estabelecimento novo.
 */
export async function confirmarTransacao(
  acaoId: string,
  decisaoMatch?: "mesmo" | "outro",
): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao") return { error: "Ação não suportada." };

  const parsed = lancarTransacaoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;
  const match =
    (acao.payload_proposto as { _match?: { candidatoId: string; sugestao: string } | null } | null)
      ?._match ?? null;

  // Resolve categoria por nome (match exato normalizado), se informada.
  let categoriaId: string | undefined;
  if (d.categoria) {
    const alvo = normalizarTexto(d.categoria);
    const cats = await listCategorias(acao.workspace_id);
    categoriaId = cats.find((c) => normalizarTexto(c.nome) === alvo)?.id;
  }

  // Zona cinza: "mesmo" (default) vincula ao existente; "outro" mantém o nome digitado.
  let estabelecimento = d.estabelecimento;
  if (match && decisaoMatch !== "outro") {
    estabelecimento = match.sugestao;
    if (d.estabelecimento) await adicionarApelido(match.candidatoId, d.estabelecimento);
  }

  const res = await criarTransacao({
    tipo: d.tipo,
    descricao: d.descricao,
    valor: d.valor,
    data_transacao: d.data_transacao ?? new Date().toISOString().slice(0, 10),
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    estabelecimento,
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

async function resolverEntidade(workspaceId: string, nome: string): Promise<string | undefined> {
  const alvo = normalizarTexto(nome);
  const list = await listEntidades(workspaceId);
  return list.find((e) => normalizarTexto(e.nome) === alvo)?.id;
}

/** Cadastra a categoria proposta pela Nia. */
export async function confirmarCategoria(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_categoria") return { error: "Ação não suportada." };

  const parsed = criarCategoriaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };

  const res = await criarCategoria({
    nome: parsed.data.nome,
    comportamento: parsed.data.comportamento,
    icone: parsed.data.icone,
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Cadastra a conta bancária proposta pela Nia (resolve o titular por nome). */
export async function confirmarConta(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_conta") return { error: "Ação não suportada." };

  const parsed = criarContaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const titularId = await resolverEntidade(acao.workspace_id, d.titular);
  if (!titularId) return { error: `A pessoa "${d.titular}" não está cadastrada. Cadastre-a primeiro.` };

  const res = await criarConta({
    banco: d.banco,
    apelido: d.apelido,
    tipo: d.tipo,
    titular_id: titularId,
    eh_conta_compartilhada: false,
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Cadastra o cartão proposto pela Nia (resolve o titular por nome). */
export async function confirmarCartao(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_cartao") return { error: "Ação não suportada." };

  const parsed = criarCartaoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const titularId = await resolverEntidade(acao.workspace_id, d.titular);
  if (!titularId) return { error: `A pessoa "${d.titular}" não está cadastrada. Cadastre-a primeiro.` };

  const res = await criarCartao({
    banco: d.banco,
    apelido: d.apelido,
    titular_id: titularId,
    ultimos_digitos: d.ultimos_digitos,
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Guarda um fato na memória da família (nia_contexto.fatos). */
export async function confirmarFato(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lembrar_fato") return { error: "Ação não suportada." };

  const parsed = lembrarFatoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };

  const supabase = createClient();
  const { data: ctxRow } = await supabase
    .from("nia_contexto")
    .select("fatos")
    .eq("workspace_id", acao.workspace_id)
    .maybeSingle();
  const atuais = Array.isArray((ctxRow as { fatos: unknown } | null)?.fatos)
    ? ((ctxRow as { fatos: string[] }).fatos as string[])
    : [];
  const fatos = [...atuais, parsed.data.fato].slice(-50);

  const { error } = await supabase
    .from("nia_contexto")
    .upsert(
      { workspace_id: acao.workspace_id, fatos, atualizado_em: new Date().toISOString() },
      { onConflict: "workspace_id" },
    );
  if (error) return { error: "Não foi possível salvar na memória." };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
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
