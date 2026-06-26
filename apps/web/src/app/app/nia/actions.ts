"use server";

import { revalidatePath } from "next/cache";
import { resolveWorkspaceId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  criarTransacao,
  excluirTransacao,
  type TransacaoEditavel,
} from "@/app/app/transacoes/actions";
import { transacaoSchema, type TransacaoInput } from "@/lib/schemas/transacao";
import { criarCartao, criarConta, criarCategoria, criarEntidade } from "@/app/app/cadastros/actions";
import { listCategorias, listEntidades } from "@/lib/db/queries";
import {
  atualizarPerfilArgs,
  conciliarFaturaPayload,
  criarCartaoArgs,
  criarCategoriaArgs,
  criarCompromissoArgs,
  criarContaArgs,
  criarEventoArgs,
  criarMetaArgs,
  criarOrcamentoArgs,
  criarPessoaArgs,
  criarRecorrenciaArgs,
  lancarTransacaoArgs,
  lancarTransacaoDetalhadaArgs,
  lembrarFatoArgs,
  marcarEventoPayload,
} from "@/lib/nia/schemas";
import { atualizarAcao, votar } from "@/lib/nia/store";
import { avancarDataRecorrencia, primeiraGeracao } from "@/lib/recorrencias";
import { normalizarTexto } from "@/lib/normalize";
import {
  classificarItem,
  registrarCompraProduto,
  resolverCategoriaCanonica,
  resolverContexto,
  resolverProduto,
} from "@/lib/classificacao";

interface AcaoRow {
  id: string;
  workspace_id: string;
  conversa_id: string;
  ferramenta: string;
  status: string;
  payload_proposto: unknown;
  registro_id: string | null;
}

async function carregarAcao(acaoId: string): Promise<AcaoRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_acoes")
    .select("id, workspace_id, conversa_id, ferramenta, status, payload_proposto, registro_id")
    .eq("id", acaoId)
    .maybeSingle();
  return (data as AcaoRow | null) ?? null;
}

/** Itens (nome + valor) já lançados nesta conversa — base do dedupe ao confirmar. */
async function itensLancadosNaConversa(
  supabase: ReturnType<typeof createClient>,
  conversaId: string,
  exceto: string,
): Promise<{ nome: string; valorTotal: number | null }[]> {
  const { data: acoes } = await supabase
    .from("nia_acoes")
    .select("registro_id")
    .eq("conversa_id", conversaId)
    .eq("status", "executada")
    .neq("id", exceto)
    .not("registro_id", "is", null);
  const ids = ((acoes as { registro_id: string }[] | null) ?? []).map((a) => a.registro_id);
  if (ids.length === 0) return [];
  const { data: itens } = await supabase
    .from("itens_transacao")
    .select("descricao_original, valor_total")
    .in("transacao_id", ids);
  return ((itens as { descricao_original: string; valor_total: number | null }[] | null) ?? []).map((i) => ({
    nome: i.descricao_original,
    valorTotal: i.valor_total != null ? Number(i.valor_total) : null,
  }));
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

/** Resolve cartão/conta pelo apelido (exato normalizado → contém). */
async function resolverPagamento(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  cartao?: string,
  conta?: string,
): Promise<{ cartaoId?: string; contaId?: string }> {
  const out: { cartaoId?: string; contaId?: string } = {};
  const achar = (lista: { id: string; apelido: string }[], termo: string): string | undefined => {
    const alvo = normalizarTexto(termo);
    return (
      lista.find((c) => normalizarTexto(c.apelido) === alvo)?.id ??
      lista.find((c) => {
        const n = normalizarTexto(c.apelido);
        return n.includes(alvo) || alvo.includes(n);
      })?.id
    );
  };
  if (cartao) {
    const { data } = await supabase
      .from("cartoes")
      .select("id, apelido")
      .eq("workspace_id", workspaceId)
      .eq("ativo", true);
    out.cartaoId = achar(((data as { id: string; apelido: string }[] | null) ?? []), cartao);
  }
  if (conta) {
    const { data } = await supabase
      .from("contas_bancarias")
      .select("id, apelido")
      .eq("workspace_id", workspaceId)
      .eq("ativa", true);
    out.contaId = achar(((data as { id: string; apelido: string }[] | null) ?? []), conta);
  }
  return out;
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

  const pag = await resolverPagamento(supabaseTx, acao.workspace_id, d.cartao, d.conta);
  const beneficiarioId = d.beneficiario
    ? await resolverEntidade(acao.workspace_id, d.beneficiario)
    : undefined;

  const res = await criarTransacao({
    tipo: d.tipo,
    descricao: d.descricao,
    valor: d.valor,
    data_transacao: d.data_transacao ?? new Date().toISOString().slice(0, 10),
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    cartao_id: pag.cartaoId,
    conta_id: pag.contaId,
    beneficiario_id: beneficiarioId,
    estabelecimento,
    contexto: d.contexto,
    parcelas: d.parcelas,
    tags: [],
  });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true }, registroId: res.id });
  return { ok: true };
}

/**
 * Carrega a proposta de transação da Nia já com os IDs resolvidos (categoria,
 * cartão/conta, beneficiário), para pré-preencher o formulário de edição.
 */
export async function carregarPropostaEditavel(acaoId: string): Promise<TransacaoEditavel | null> {
  const acao = await carregarAcao(acaoId);
  if (!acao || acao.status !== "proposta" || acao.ferramenta !== "lancar_transacao") return null;
  const parsed = lancarTransacaoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return null;
  const d = parsed.data;

  const supabase = createClient();
  const cat = await resolverCategoriaCanonica(supabase, acao.workspace_id, d.categoria);
  const pag = await resolverPagamento(supabase, acao.workspace_id, d.cartao, d.conta);
  const beneficiarioId = d.beneficiario ? await resolverEntidade(acao.workspace_id, d.beneficiario) : undefined;

  return {
    tipo: d.tipo,
    descricao: d.descricao,
    valor: d.valor,
    data_transacao: d.data_transacao ?? new Date().toISOString().slice(0, 10),
    categoria_id: cat?.id ?? "",
    meio_pagamento: d.meio_pagamento,
    cartao_id: pag.cartaoId ?? "",
    conta_id: pag.contaId ?? "",
    beneficiario_id: beneficiarioId ?? "",
    estabelecimento: d.estabelecimento ?? "",
    contexto: d.contexto ?? "",
    observacoes: "",
    parcelas: d.parcelas,
  };
}

/** Confirma a proposta da Nia com os valores EDITADOS pelo usuário no formulário. */
export async function confirmarTransacaoComEdicao(
  acaoId: string,
  input: TransacaoInput,
): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao") return { error: "Ação não suportada." };

  const parsed = transacaoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  // Reusa criarTransacao (resolve estabelecimento/contexto, grava com os IDs editados).
  const res = await criarTransacao(parsed.data);
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, {
    status: "executada",
    resultado: { ok: true, editada: true },
    registroId: res.id,
  });
  return { ok: true };
}

/** Lança a compra detalhada (itens da nota) com os itens selecionados pelo usuário. */
export async function confirmarTransacaoDetalhada(
  acaoId: string,
  indicesIncluidos: number[],
  edicoes?: Record<number, { nome?: string; quantidade?: number; valor_total?: number; categoria_id?: string }>,
): Promise<{ error?: string; ok?: boolean; pulados?: number }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "lancar_transacao_detalhada") return { error: "Ação não suportada." };

  const parsed = lancarTransacaoDetalhadaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  // Aplica as edições do usuário (por índice) antes de filtrar os incluídos.
  const ed = edicoes ?? {};
  const itensComEdits = d.itens.map((it, i) => {
    const e = ed[i];
    if (!e) return it;
    return {
      ...it,
      nome: e.nome != null && e.nome.trim() ? e.nome.trim() : it.nome,
      quantidade: e.quantidade != null ? e.quantidade : it.quantidade,
      valor_total: e.valor_total != null ? e.valor_total : it.valor_total,
    };
  });
  // Mantém o índice original (para aplicar a categoria editada item a item).
  const selecionadosIdx = itensComEdits
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => indicesIncluidos.includes(i));
  if (selecionadosIdx.length === 0) return { error: "Selecione ao menos um item." };

  const valorItem = (it: (typeof itensComEdits)[number]): number =>
    it.valor_total ?? (it.valor_unitario != null && it.quantidade != null ? it.valor_unitario * it.quantidade : 0);

  const supabase = createClient();
  const ws = acao.workspace_id;
  const data = d.data_transacao ?? new Date().toISOString().slice(0, 10);

  // Rede de segurança: ignora itens idênticos (mesmo nome + mesmo valor) já lançados
  // nesta conversa, para não duplicar quando a Nia repropõe uma cesta já registrada.
  const lancadosPrev = await itensLancadosNaConversa(supabase, acao.conversa_id, acaoId);
  const jaLancado = (nome: string, vTotal: number): boolean =>
    vTotal > 0 &&
    lancadosPrev.some(
      (p) =>
        p.valorTotal != null &&
        Math.abs(p.valorTotal - vTotal) < 0.01 &&
        normalizarTexto(p.nome) === normalizarTexto(nome),
    );

  const inclusosIdx = selecionadosIdx.filter(({ it }) => !jaLancado(it.nome, valorItem(it)));
  const pulados = selecionadosIdx.length - inclusosIdx.length;
  if (inclusosIdx.length === 0) {
    return { error: "Esses itens já tinham sido lançados nesta conversa." };
  }

  const valor = Number(inclusosIdx.reduce((s, { it }) => s + valorItem(it), 0).toFixed(2));
  if (valor <= 0) return { error: "Não consegui os valores dos itens. Tente informar o total." };

  // Categoria geral da nota, ancorada no padrão (opcional).
  const catTx = await resolverCategoriaCanonica(supabase, ws, d.categoria);
  const categoriaId = catTx?.id;
  const pag = await resolverPagamento(supabase, ws, d.cartao, d.conta);
  const beneficiarioId = d.beneficiario ? await resolverEntidade(ws, d.beneficiario) : undefined;

  const res = await criarTransacao({
    tipo: "despesa",
    descricao: d.descricao,
    valor,
    data_transacao: data,
    categoria_id: categoriaId,
    meio_pagamento: d.meio_pagamento,
    cartao_id: pag.cartaoId,
    conta_id: pag.contaId,
    beneficiario_id: beneficiarioId,
    estabelecimento: d.estabelecimento,
    contexto: d.contexto,
    tags: [],
  });
  if (res.error) return { error: res.error };

  if (res.id) {
    const catTotais = new Map<string, number>();
    let ordem = 0;
    for (const { it, i } of inclusosIdx) {
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
      // Categoria editada pelo usuário no item (vence a classificação automática).
      const itemCategoriaId = ed[i]?.categoria_id || cls.categoriaId;
      // Correção gruda na memória: se o usuário editou a categoria, ela passa a
      // valer para as próximas compras do mesmo produto (senão a memória ficaria
      // com a classificação automática antiga e o erro se repetiria).
      if (prod.produtoId && itemCategoriaId && itemCategoriaId !== cls.categoriaId) {
        await supabase.from("produtos").update({ categoria_sugerida_id: itemCategoriaId }).eq("id", prod.produtoId);
      }
      const vTotal = valorItem(it);
      if (itemCategoriaId && vTotal > 0) {
        catTotais.set(itemCategoriaId, (catTotais.get(itemCategoriaId) ?? 0) + vTotal);
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
        categoria_id: itemCategoriaId,
        essencialidade: cls.essencialidade ?? undefined,
        tipo_item: cls.tipo,
        ordem_na_nota: ordem,
        status_revisao: "confirmado",
      });
      // Memória do produto: unidade padrão + último preço (comparável só na mesma unidade).
      if (prod.produtoId) {
        await registrarCompraProduto(supabase, prod.produtoId, {
          unidade: it.unidade ?? null,
          valorUnitario: it.valor_unitario ?? null,
          data,
        });
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
    resultado: { ok: true, itens: inclusosIdx.length, pulados },
    registroId: res.id,
  });
  return { ok: true, pulados };
}

/**
 * Concilia uma fatura de cartão: marca como conferidos os lançamentos que já
 * existiam (casados[linkarIdx]) — vinculando à fatura/cartão SEM mexer em valor
 * ou categoria — e lança só o que faltava (faltando[criarIdx]). Não duplica: as
 * linhas que já têm lançamento nunca viram transação nova.
 */
export async function confirmarConciliacao(
  acaoId: string,
  linkarIdx: number[],
  criarIdx: number[],
): Promise<{ error?: string; ok?: boolean; conferidos?: number; lancados?: number }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "conciliar_fatura") return { error: "Ação não suportada." };

  const parsed = conciliarFaturaPayload.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const p = parsed.data;

  const supabase = createClient();
  const ws = acao.workspace_id;

  // Fatura: só dá pra registrar a linha com cartão + mês de referência (NOT NULL +
  // UNIQUE). Sem cartão resolvido, segue sem fatura_id (só marca conciliado).
  let faturaId: string | null = null;
  if (p.cartaoId && p.mesReferencia) {
    const { data: fat } = await supabase
      .from("faturas_cartao")
      .upsert(
        {
          workspace_id: ws,
          cartao_id: p.cartaoId,
          mes_referencia: p.mesReferencia,
          data_vencimento: p.vencimento,
          valor_total: p.total,
          status: "fechada",
        },
        { onConflict: "cartao_id,mes_referencia" },
      )
      .select("id")
      .maybeSingle();
    faturaId = (fat as { id: string } | null)?.id ?? null;
  }

  // Casados → conferidos: vincula fatura + marca conciliado, sem tocar valor/categoria.
  let conferidos = 0;
  for (const i of linkarIdx) {
    const c = p.casados[i];
    if (!c) continue;
    const patch: Record<string, unknown> = { status_conciliacao: "conciliado" };
    if (faturaId) patch.fatura_id = faturaId;
    const { error } = await supabase
      .from("transacoes")
      .update(patch)
      .eq("id", c.transacaoId)
      .eq("workspace_id", ws);
    if (error) continue;
    conferidos++;
    // Preenche o cartão só quando estiver vazio (não sobrescreve um cartão correto).
    if (p.cartaoId) {
      await supabase
        .from("transacoes")
        .update({ cartao_id: p.cartaoId })
        .eq("id", c.transacaoId)
        .eq("workspace_id", ws)
        .is("cartao_id", null);
    }
  }

  // Faltando → lança como despesa de crédito, já conciliada e ligada à fatura.
  let lancados = 0;
  const hoje = new Date().toISOString().slice(0, 10);
  for (const i of criarIdx) {
    const f = p.faltando[i];
    if (!f) continue;
    // Categoria ancorada no padrão canônico (se a Nia inferiu uma).
    const cat = f.categoria ? await resolverCategoriaCanonica(supabase, ws, f.categoria) : null;
    const { error } = await supabase.from("transacoes").insert({
      workspace_id: ws,
      tipo: "despesa",
      descricao: f.descricao,
      valor: f.valor,
      data_transacao: f.data ?? hoje,
      categoria_id: cat?.id ?? null,
      meio_pagamento: "cartao_credito",
      cartao_id: p.cartaoId,
      origem: "fatura_cartao",
      fatura_id: faturaId,
      status_conciliacao: "conciliado",
      status_revisao: "confirmado",
    });
    if (!error) lancados++;
  }

  revalidatePath("/app");
  revalidatePath("/app/transacoes");
  revalidatePath("/app/relatorios");

  await atualizarAcao(acaoId, {
    status: "executada",
    resultado: { ok: true, conferidos, lancados },
    registroId: faturaId,
  });
  return { ok: true, conferidos, lancados };
}

/**
 * Cria a conta fixa (recorrência) proposta pela Nia. Por padrão NÃO recria o
 * passado: a geração começa na próxima data >= hoje (mantendo o ciclo ancorado
 * em data_inicio); só materializa "hoje" se a 1ª ocorrência for hoje ("paguei
 * hoje"). Quando o usuário pede explicitamente o retroativo, materializa todo o
 * histórico desde data_inicio. O cron diário cuida das futuras.
 */
export async function confirmarRecorrencia(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_recorrencia") return { error: "Ação não suportada." };

  const parsed = criarRecorrenciaArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const supabase = createClient();
  const ws = acao.workspace_id;
  const hoje = new Date().toISOString().slice(0, 10);
  const dataInicio = d.data_inicio ?? hoje;
  const cat = await resolverCategoriaCanonica(supabase, ws, d.categoria);

  // Dedupe: se já existe uma conta fixa ativa com mesma descrição + frequência,
  // reaproveita em vez de duplicar. Protege contra reenviar a mesma proposta
  // (ex.: o usuário acha que não criou e pede de novo) gerando cobranças em dobro.
  const { data: existente } = await supabase
    .from("recorrencias")
    .select("id")
    .eq("workspace_id", ws)
    .eq("frequencia", d.frequencia)
    .eq("ativa", true)
    .ilike("descricao", d.descricao)
    .limit(1)
    .maybeSingle();
  if (existente) {
    const recId = (existente as { id: string }).id;
    await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true, jaExistia: true }, registroId: recId });
    return { ok: true };
  }

  // Onde a geração começa:
  // - retroativo → desde data_inicio (recria o histórico, só sob pedido explícito);
  // - vencimento DESTE período já passou (data_inicio <= hoje e a próxima ocorrência
  //   ainda é futura) → lança o período atual agora, senão a conta fixa fica
  //   "invisível" (nenhum lançamento) até o próximo ciclo e parece que falhou;
  // - caso contrário (conta antiga ou início no futuro) → 1ª data >= hoje.
  const lancaPeriodoAtual =
    !d.retroativo && dataInicio <= hoje && avancarDataRecorrencia(dataInicio, d.frequencia) > hoje;
  const inicioGeracao = lancaPeriodoAtual
    ? dataInicio
    : primeiraGeracao(d.frequencia, dataInicio, hoje, d.retroativo ?? false);

  const { data: rec, error } = await supabase
    .from("recorrencias")
    .insert({
      workspace_id: ws,
      descricao: d.descricao,
      tipo: d.tipo,
      valor_previsto: d.valor,
      frequencia: d.frequencia,
      data_inicio: dataInicio,
      data_fim: d.data_fim ?? null,
      categoria_id: cat?.id ?? null,
      dia_vencimento: Number(dataInicio.slice(8, 10)) || 1,
      proxima_geracao: inicioGeracao,
      ativa: true,
    })
    .select("id")
    .maybeSingle();
  if (error || !rec) return { error: "Não foi possível criar a conta fixa." };
  const recId = (rec as { id: string }).id;

  // Materializa só o que já venceu a partir do início da geração (idempotente);
  // o cron segue com as futuras. Sem retroativo, isso é no máximo a ocorrência de hoje.
  let v = inicioGeracao;
  let guard = 0;
  while (v <= hoje && (!d.data_fim || v <= d.data_fim) && guard < 60) {
    const { data: existe } = await supabase
      .from("transacoes")
      .select("id")
      .eq("recorrencia_id", recId)
      .eq("data_transacao", v)
      .maybeSingle();
    if (!existe) {
      await supabase.from("transacoes").insert({
        workspace_id: ws,
        tipo: d.tipo,
        descricao: d.descricao,
        valor: d.valor,
        data_transacao: v,
        categoria_id: cat?.id ?? null,
        origem: "recorrente",
        recorrencia_id: recId,
        status_revisao: "confirmado",
      });
    }
    v = avancarDataRecorrencia(v, d.frequencia);
    guard++;
  }
  await supabase.from("recorrencias").update({ proxima_geracao: v, ultima_geracao: hoje }).eq("id", recId);

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true }, registroId: recId });
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
  const d = parsed.data;
  const supabase = createClient();

  // Subcategoria: resolve (ou cria) o grupo-pai e cria a categoria dentro dele.
  if (d.categoria_pai) {
    const paiId = await resolverOuCriarCategoria(supabase, acao.workspace_id, d.categoria_pai);
    const slug = `${normalizarTexto(d.nome).replace(/ /g, "-")}-${Date.now().toString(36)}`;
    const { error } = await supabase.from("categorias").insert({
      workspace_id: acao.workspace_id,
      nome: d.nome,
      slug,
      comportamento: d.comportamento,
      icone: d.icone ?? null,
      categoria_pai_id: paiId ?? null,
    });
    if (error) return { error: "Não foi possível criar a subcategoria." };
    await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
    return { ok: true };
  }

  // Sem pai: ancora no padrão canônico — se já existe equivalente, reusa (não duplica).
  const existente = await resolverCategoriaCanonica(supabase, acao.workspace_id, d.nome, 0.6);
  if (existente) {
    await atualizarAcao(acaoId, {
      status: "executada",
      resultado: { ok: true, reaproveitada: existente.nome },
      registroId: existente.id,
    });
    return { ok: true };
  }

  const res = await criarCategoria({ nome: d.nome, comportamento: d.comportamento, icone: d.icone });
  if (res.error) return { error: res.error };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true } });
  return { ok: true };
}

/** Resolve uma categoria pelo nome (ancorada no padrão) ou cria como grupo básico. */
async function resolverOuCriarCategoria(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  nome: string,
): Promise<string | undefined> {
  const existente = await resolverCategoriaCanonica(supabase, workspaceId, nome, 0.6);
  if (existente) return existente.id;
  const slug = `${normalizarTexto(nome).replace(/ /g, "-")}-${Date.now().toString(36)}`;
  const { data } = await supabase
    .from("categorias")
    .insert({ workspace_id: workspaceId, nome, slug, comportamento: "basico" })
    .select("id")
    .maybeSingle();
  return (data as { id: string } | null)?.id;
}

/** Cria o evento/contexto proposto pela Nia (idempotente: reusa se já existir). */
export async function confirmarEvento(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "criar_evento") return { error: "Ação não suportada." };

  const parsed = criarEventoArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const supabase = createClient();
  const contextoId = await resolverContexto(
    supabase,
    acao.workspace_id,
    d.nome,
    d.tipo ?? null,
    d.data_referencia ?? null,
  );
  if (!contextoId) return { error: "Não foi possível criar o evento." };

  await atualizarAcao(acaoId, { status: "executada", resultado: { ok: true }, registroId: contextoId });
  return { ok: true };
}

/**
 * Liga ao evento APENAS os lançamentos que o usuário deixou marcados (índices da
 * lista proposta), sem mudar categorias. Os IDs vêm do payload — não re-roda a
 * busca por data, que poderia ter mudado desde a proposta.
 */
export async function confirmarMarcarEvento(
  acaoId: string,
  indicesIncluidos: number[],
): Promise<{ error?: string; ok?: boolean; marcados?: number }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "marcar_evento") return { error: "Ação não suportada." };

  const parsed = marcarEventoPayload.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const p = parsed.data;

  const ids = indicesIncluidos
    .map((i) => p.lancamentos[i]?.transacaoId)
    .filter((x): x is string => !!x);
  if (ids.length === 0) return { error: "Selecione ao menos um lançamento." };

  const supabase = createClient();
  const contextoId = await resolverContexto(supabase, acao.workspace_id, p.evento);
  if (!contextoId) return { error: "Não foi possível criar o evento." };

  const { error } = await supabase
    .from("transacoes")
    .update({ contexto_id: contextoId })
    .in("id", ids)
    .eq("workspace_id", acao.workspace_id);
  if (error) return { error: "Não foi possível marcar os lançamentos." };

  revalidatePath("/app");
  revalidatePath("/app/relatorios");

  await atualizarAcao(acaoId, {
    status: "executada",
    resultado: { ok: true, marcados: ids.length },
    registroId: contextoId,
  });
  return { ok: true, marcados: ids.length };
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
  // Memória domada: não duplica fato equivalente e mantém só os 30 mais recentes
  // (o que é estrutural deve ir pro perfil via atualizar_perfil, não acumular aqui).
  const novoFato = parsed.data.fato;
  const jaExiste = atuais.some((f) => normalizarTexto(f) === normalizarTexto(novoFato));
  const fatos = (jaExiste ? atuais : [...atuais, novoFato]).slice(-30);

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

/** Aplica a atualização do PERFIL FIXO da família proposta pela Nia (sinal forte). */
export async function confirmarAtualizarPerfil(acaoId: string): Promise<{ error?: string; ok?: boolean }> {
  const acao = await carregarAcao(acaoId);
  if (!acao) return { error: "Ação não encontrada." };
  if (acao.status !== "proposta") return { error: "Essa ação já foi processada." };
  if (acao.ferramenta !== "atualizar_perfil") return { error: "Ação não suportada." };

  const parsed = atualizarPerfilArgs.safeParse(acao.payload_proposto);
  if (!parsed.success) return { error: "Dados da proposta inválidos." };
  const d = parsed.data;

  const supabase = createClient();
  const { data: ctxRow } = await supabase
    .from("nia_contexto")
    .select("perfil")
    .eq("workspace_id", acao.workspace_id)
    .maybeSingle();
  const perfil = { ...(((ctxRow as { perfil?: Record<string, unknown> } | null)?.perfil) ?? {}) };
  perfil[d.campo] = d.texto;

  const { error } = await supabase
    .from("nia_contexto")
    .upsert(
      { workspace_id: acao.workspace_id, perfil, atualizado_em: new Date().toISOString() },
      { onConflict: "workspace_id" },
    );
  if (error) return { error: "Não foi possível atualizar o perfil." };

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
