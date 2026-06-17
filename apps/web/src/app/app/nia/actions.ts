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
  criarMetaArgs,
  criarOrcamentoArgs,
  criarPessoaArgs,
  lancarTransacaoArgs,
  lancarTransacaoDetalhadaArgs,
  lembrarFatoArgs,
} from "@/lib/nia/schemas";
import { atualizarAcao, votar } from "@/lib/nia/store";
import { normalizarTexto } from "@/lib/normalize";
import { classificarItem, resolverCategoriaCanonica, resolverProduto } from "@/lib/classificacao";

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

  // Resolve categoria ancorando no padrão canônico (exato → fuzzy), se informada.
  const supabaseTx = createClient();
  const cat = await resolverCategoriaCanonica(supabaseTx, acao.workspace_id, d.categoria);
  const categoriaId = cat?.id;

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
    contexto: d.contexto,
    tags: [],
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true }, registroId: res.id });
  return { ok: true };
}

/** Lança a compra detalhada (itens da nota) com os itens selecionados pelo usuário. */
export async function confirmarTransacaoDetalhada(
  acaoId: string,
  indicesIncluidos: number[],
): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao_detalhada") return { error: "Ação não suportada." };

  const parsed = lancarTransacaoDetalhadaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const inclusos = d.itens.filter((_, i) => indicesIncluidos.includes(i));
  if (inclusos.length === 0) return { error: "Selecione ao menos um item." };

  const valorItem = (it: (typeof inclusos)[number]): number =>
    it.valor_total ?? (it.valor_unitario != null && it.quantidade != null ? it.valor_unitario * it.quantidade : 0);
  const valor = Number(inclusos.reduce((s, it) => s + valorItem(it), 0).toFixed(2));
  if (valor <= 0) return { error: "Não consegui os valores dos itens. Tente informar o total." };

  const supabase = createClient();
  const ws = acao.workspace_id;
  const data = d.data_transacao ?? new Date().toISOString().slice(0, 10);

  // Categoria geral da nota, ancorada no padrão (opcional).
  const catTx = await resolverCategoriaCanonica(supabase, ws, d.categoria);
  const categoriaId = catTx?.id;

  const res = await criarTransacao({
    tipo: "despesa",
    descricao: d.descricao,
    valor,
    data_transacao: data,
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    estabelecimento: d.estabelecimento,
    contexto: d.contexto,
    tags: [],
  });
  if (res.error) return { error: res.error };

  if (res.id) {
    const catTotais = new Map<string, number>();
    let ordem = 0;
    for (const it of inclusos) {
      ordem++;
      const prod = await resolverProduto(supabase, ws, it.nome, null);
      const cls = await classificarItem(
        supabase,
        ws,
        prod.produtoId,
        it.categoria ?? null,
        it.essencialidade ?? null,
        it.tipo ?? null,
        categoriaId ?? null,
      );
      const vTotal = valorItem(it);
      if (cls.categoriaId && vTotal > 0) {
        catTotais.set(cls.categoriaId, (catTotais.get(cls.categoriaId) ?? 0) + vTotal);
      }
      await supabase.from("itens_transacao").insert({
        workspace_id: ws,
        transacao_id: res.id,
        produto_id: prod.produtoId,
        descricao_original: it.nome,
        quantidade: it.quantidade ?? 1,
        unidade: it.unidade ?? null,
        valor_unitario: it.valor_unitario ?? null,
        valor_total: it.valor_total ?? null,
        categoria_id: cls.categoriaId,
        essencialidade: cls.essencialidade ?? undefined,
        tipo_item: cls.tipo,
        ordem_na_nota: ordem,
        status_revisao: "confirmado",
      });
      if (prod.produtoId) {
        await supabase
          .from("produtos")
          .update({ ultimo_preco_unitario: it.valor_unitario ?? null, ultima_compra_em: data })
          .eq("id", prod.produtoId);
      }
    }

    // Se a nota não tinha categoria geral, herda a dominante dos itens.
    if (!categoriaId && catTotais.size > 0) {
      const dominante = [...catTotais.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (dominante) await supabase.from("transacoes").update({ categoria_id: dominante }).eq("id", res.id);
    }
  }

  await atualizarAcao(acaoId, {
    status: "executada",
    resultado: { ok: true, itens: inclusos.length },
    registroId: res.id,
  });
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

  // Ancora no padrão canônico: se já existe categoria equivalente, reusa (não duplica).
  const supabase = createClient();
  const existente = await resolverCategoriaCanonica(supabase, acao.workspace_id, parsed.data.nome, 0.6);
  if (existente) {
    await atualizarAcao(acaoId, {
      status: "executada",
      resultado: { ok: true, reaproveitada: existente.nome },
      registroId: existente.id,
    });
    return { ok: true };
  }

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

/** Cria a meta financeira proposta pela Nia. */
export async function confirmarMeta(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_meta") return { error: "Ação não suportada." };

  const parsed = criarMetaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from("metas_financeiras").insert({
    workspace_id: acao.workspace_id,
    nome: d.nome,
    valor_alvo: d.valor_alvo,
    data_alvo: d.data_alvo ?? null,
  });
  if (error) return { error: "Não foi possível criar a meta." };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Define/atualiza o orçamento mensal de uma categoria (proposto pela Nia). */
export async function confirmarOrcamento(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_orcamento") return { error: "Ação não suportada." };

  const parsed = criarOrcamentoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const alvo = normalizarTexto(d.categoria);
  const cats = await listCategorias(acao.workspace_id);
  const categoriaId = cats.find((c) => normalizarTexto(c.nome) === alvo)?.id;
  if (!categoriaId) return { error: `A categoria "${d.categoria}" não existe. Crie-a primeiro.` };

  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);

  const { data: existente } = await supabase
    .from("orcamentos")
    .select("id")
    .eq("workspace_id", acao.workspace_id)
    .eq("categoria_id", categoriaId)
    .eq("mes_referencia", mesRef)
    .is("entidade_id", null)
    .maybeSingle();

  const erro = existente
    ? (await supabase.from("orcamentos").update({ valor_planejado: d.valor_planejado }).eq("id", (existente as { id: string }).id)).error
    : (
        await supabase.from("orcamentos").insert({
          workspace_id: acao.workspace_id,
          categoria_id: categoriaId,
          mes_referencia: mesRef,
          valor_planejado: d.valor_planejado,
        })
      ).error;
  if (erro) return { error: "Não foi possível salvar o orçamento." };

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
