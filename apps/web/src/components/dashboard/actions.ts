"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Essencialidade, MeioPagamento, StatusRevisao, TipoTransacao } from "@/lib/types/db";

export interface ItemDetalhe {
  nome: string;
  quantidade: number | null;
  unidade: string | null;
  valorTotal: number | null;
  categoriaNome: string | null;
  categoriaIcone: string | null;
  essencialidade: Essencialidade | null;
}

export interface TransacaoDetalhe {
  id: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  data: string;
  meioPagamento: MeioPagamento | null;
  status: StatusRevisao;
  observacoes: string | null;
  categoriaNome: string | null;
  categoriaIcone: string | null;
  categoriaCor: string | null;
  estabelecimento: string | null;
  conta: string | null;
  cartao: string | null;
  beneficiario: string | null;
  contexto: string | null;
  itens: ItemDetalhe[];
}

/** Detalhe completo de uma transação para o sheet (RLS garante o workspace). */
export async function detalheTransacao(id: string): Promise<TransacaoDetalhe | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transacoes")
    .select(
      "id, descricao, valor, tipo, data_transacao, meio_pagamento, status_revisao, observacoes, " +
        "categoria:categorias(nome,icone,cor), estabelecimento:estabelecimentos(nome), " +
        "conta:contas_bancarias(apelido), cartao:cartoes(apelido), " +
        "beneficiario:entidades!transacoes_beneficiario_id_fkey(nome), contexto:contextos(nome)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const t = data as unknown as Record<string, unknown>;
  const rel = (k: string, f: string): string | null => {
    const o = t[k] as Record<string, unknown> | null;
    return o ? ((o[f] as string | null) ?? null) : null;
  };

  const { data: itensData } = await supabase
    .from("itens_transacao")
    .select("descricao_original, quantidade, unidade, valor_total, essencialidade, categoria:categorias(nome,icone)")
    .eq("transacao_id", id)
    .order("ordem_na_nota", { ascending: true });
  const itens = ((itensData as unknown as Record<string, unknown>[] | null) ?? []).map((i) => {
    const cat = i.categoria as { nome?: string; icone?: string } | null;
    return {
      nome: String(i.descricao_original ?? ""),
      quantidade: i.quantidade != null ? Number(i.quantidade) : null,
      unidade: (i.unidade as string | null) ?? null,
      valorTotal: i.valor_total != null ? Number(i.valor_total) : null,
      categoriaNome: cat?.nome ?? null,
      categoriaIcone: cat?.icone ?? null,
      essencialidade: (i.essencialidade as Essencialidade | null) ?? null,
    };
  });

  return {
    id: String(t.id),
    descricao: String(t.descricao ?? ""),
    valor: Number(t.valor ?? 0),
    tipo: t.tipo as TipoTransacao,
    data: String(t.data_transacao ?? ""),
    meioPagamento: (t.meio_pagamento as MeioPagamento | null) ?? null,
    status: (t.status_revisao as StatusRevisao) ?? "confirmado",
    observacoes: (t.observacoes as string | null) ?? null,
    categoriaNome: rel("categoria", "nome"),
    categoriaIcone: rel("categoria", "icone"),
    categoriaCor: rel("categoria", "cor"),
    estabelecimento: rel("estabelecimento", "nome"),
    conta: rel("conta", "apelido"),
    cartao: rel("cartao", "apelido"),
    beneficiario: rel("beneficiario", "nome"),
    contexto: rel("contexto", "nome"),
    itens,
  };
}

export interface CategoriaDrillTransacao {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  estabelecimento: string | null;
}
export interface CategoriaDrill {
  nome: string;
  total: number;
  transacoes: CategoriaDrillTransacao[];
}

/** Lançamentos (despesas confirmadas do mês) de uma categoria — para o drilldown. */
export async function transacoesPorCategoria(categoriaId: string): Promise<CategoriaDrill | null> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);

  // O donut agrupa por categoria-pai, então `categoriaId` costuma ser um pai:
  // inclui a própria categoria e suas subcategorias (taxonomia de 2 níveis).
  const { data: cats } = await supabase
    .from("categorias")
    .select("id, nome")
    .or(`id.eq.${categoriaId},categoria_pai_id.eq.${categoriaId}`);
  const lista = (cats as { id: string; nome: string }[] | null) ?? [];
  const ids = lista.length > 0 ? lista.map((c) => c.id) : [categoriaId];
  const nome = lista.find((c) => c.id === categoriaId)?.nome ?? "Categoria";

  const { data } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_transacao, estabelecimento:estabelecimentos(nome)")
    .in("categoria_id", ids)
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", mesRef)
    .order("data_transacao", { ascending: false });

  const transacoes = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((r) => {
    const estab = r.estabelecimento as { nome?: string } | null;
    return {
      id: String(r.id),
      descricao: String(r.descricao ?? ""),
      valor: Number(r.valor ?? 0),
      data: String(r.data_transacao ?? ""),
      estabelecimento: estab?.nome ?? null,
    };
  });
  const total = transacoes.reduce((s, t) => s + t.valor, 0);
  return { nome, total, transacoes };
}

export interface PessoaDrill {
  nome: string;
  total: number;
  transacoes: CategoriaDrillTransacao[];
}

/**
 * Lançamentos (despesas confirmadas do mês) de uma pessoa/beneficiário — ou dos
 * "Não atribuído" quando `beneficiarioId` é "—" (sem beneficiário). Espelha
 * transacoesPorCategoria para o drilldown do "Gasto por pessoa".
 */
export async function transacoesPorPessoa(beneficiarioId: string): Promise<PessoaDrill> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);

  const semBeneficiario = !beneficiarioId || beneficiarioId === "—";
  let query = supabase
    .from("transacoes")
    .select("id, descricao, valor, data_transacao, estabelecimento:estabelecimentos(nome)")
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", mesRef)
    .order("data_transacao", { ascending: false });
  query = semBeneficiario ? query.is("beneficiario_id", null) : query.eq("beneficiario_id", beneficiarioId);
  const { data } = await query;

  const transacoes = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((r) => {
    const estab = r.estabelecimento as { nome?: string } | null;
    return {
      id: String(r.id),
      descricao: String(r.descricao ?? ""),
      valor: Number(r.valor ?? 0),
      data: String(r.data_transacao ?? ""),
      estabelecimento: estab?.nome ?? null,
    };
  });

  let nome = "Não atribuído";
  if (!semBeneficiario) {
    const { data: ent } = await supabase.from("entidades").select("nome").eq("id", beneficiarioId).maybeSingle();
    nome = (ent as { nome: string } | null)?.nome ?? "Pessoa";
  }
  const total = transacoes.reduce((s, t) => s + t.valor, 0);
  return { nome, total, transacoes };
}

export interface EssencialidadeLinha {
  /** id da transação de origem (para abrir/linkar, se quiser) */
  id: string;
  descricao: string;
  estabelecimento: string | null;
  data: string;
  valor: number;
  /** "item" = linha de nota; "transacao" = caiu no padrão da categoria */
  origem: "item" | "transacao";
}
export interface EssencialidadeDrill {
  total: number;
  linhas: EssencialidadeLinha[];
}

/**
 * O que entra em cada natureza de gasto (essencial / supérfluo / …) no mês.
 * Espelha a RPC `gastos_por_essencialidade` (0019): soma item a item quando a
 * nota está itemizada e cai no `essencialidade_padrao` da categoria para o
 * resto não-itemizado — para o total bater com a barra do relatório.
 */
export async function transacoesPorEssencialidade(
  essencialidade: Essencialidade,
): Promise<EssencialidadeDrill> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);

  const { data: txData } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_transacao, categoria_id, estabelecimento:estabelecimentos(nome)")
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", mesRef);
  const txs = ((txData as unknown as Record<string, unknown>[] | null) ?? []).map((r) => {
    const estab = r.estabelecimento as { nome?: string } | null;
    return {
      id: String(r.id),
      descricao: String(r.descricao ?? ""),
      valor: Number(r.valor ?? 0),
      data: String(r.data_transacao ?? ""),
      categoriaId: (r.categoria_id as string | null) ?? null,
      estabelecimento: estab?.nome ?? null,
    };
  });
  if (txs.length === 0) return { total: 0, linhas: [] };
  const txById = new Map(txs.map((t) => [t.id, t]));

  const { data: itData } = await supabase
    .from("itens_transacao")
    .select("transacao_id, descricao_original, valor_total, essencialidade")
    .in("transacao_id", txs.map((t) => t.id));
  const itens =
    (itData as
      | { transacao_id: string; descricao_original: string; valor_total: number | null; essencialidade: Essencialidade | null }[]
      | null) ?? [];

  const catIds = [...new Set(txs.map((t) => t.categoriaId).filter(Boolean))] as string[];
  const { data: catData } = catIds.length
    ? await supabase.from("categorias").select("id, essencialidade_padrao").in("id", catIds)
    : { data: [] as { id: string; essencialidade_padrao: Essencialidade | null }[] };
  const catPad = new Map(
    ((catData as { id: string; essencialidade_padrao: Essencialidade | null }[] | null) ?? []).map(
      (c) => [c.id, (c.essencialidade_padrao ?? "necessario") as Essencialidade],
    ),
  );

  const somaItens = new Map<string, number>();
  for (const i of itens) somaItens.set(i.transacao_id, (somaItens.get(i.transacao_id) ?? 0) + Number(i.valor_total ?? 0));

  const linhas: EssencialidadeLinha[] = [];
  // 1) Itens cuja essencialidade própria casa com a buscada.
  for (const i of itens) {
    const v = Number(i.valor_total ?? 0);
    if (i.essencialidade === essencialidade && v > 0) {
      const tx = txById.get(i.transacao_id);
      linhas.push({
        id: i.transacao_id,
        descricao: i.descricao_original,
        estabelecimento: tx?.estabelecimento ?? null,
        data: tx?.data ?? "",
        valor: v,
        origem: "item",
      });
    }
  }
  // 2) Parte não-itemizada → padrão da categoria.
  for (const t of txs) {
    const padrao = (t.categoriaId && catPad.get(t.categoriaId)) || "necessario";
    if (padrao !== essencialidade) continue;
    const soma = somaItens.get(t.id);
    const valor = soma == null ? t.valor : t.valor - soma;
    if (valor > 0.005) {
      linhas.push({
        id: t.id,
        descricao: t.descricao,
        estabelecimento: t.estabelecimento,
        data: t.data,
        valor,
        origem: "transacao",
      });
    }
  }
  linhas.sort((a, b) => b.valor - a.valor);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return { total, linhas };
}

export interface ContextoTransacao {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  categoriaNome: string | null;
  categoriaIcone: string | null;
}
export interface ContextoDetalhe {
  nome: string;
  total: number;
  transacoes: ContextoTransacao[];
}

/** Transações confirmadas de um evento/contexto, para o sheet do evento. */
export async function transacoesDoContexto(contextoId: string): Promise<ContextoDetalhe | null> {
  const supabase = createClient();
  const { data: ctx } = await supabase.from("contextos").select("nome").eq("id", contextoId).maybeSingle();
  if (!ctx) return null;
  const { data } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_transacao, categoria:categorias(nome,icone)")
    .eq("contexto_id", contextoId)
    .eq("status_revisao", "confirmado")
    .order("data_transacao", { ascending: false })
    .limit(50);
  const transacoes = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((r) => {
    const cat = r.categoria as { nome?: string; icone?: string } | null;
    return {
      id: String(r.id),
      descricao: String(r.descricao ?? ""),
      valor: Number(r.valor ?? 0),
      data: String(r.data_transacao ?? ""),
      categoriaNome: cat?.nome ?? null,
      categoriaIcone: cat?.icone ?? null,
    };
  });
  const total = transacoes.reduce((s, t) => s + t.valor, 0);
  return { nome: String((ctx as { nome: string }).nome), total, transacoes };
}

/** Renomeia um evento/contexto já criado (RLS garante o workspace). */
export async function renomearEvento(
  contextoId: string,
  nome: string,
): Promise<{ error?: string; ok?: boolean }> {
  const n = nome.trim();
  if (!n) return { error: "Informe um nome." };
  if (n.length > 120) return { error: "Nome muito longo." };
  const supabase = createClient();
  const { error } = await supabase.from("contextos").update({ nome: n }).eq("id", contextoId);
  if (error) return { error: "Não foi possível renomear o evento." };
  revalidatePath("/app");
  revalidatePath("/app/relatorios");
  return { ok: true };
}

/**
 * Tira um lançamento de um evento (desfaz o agrupamento), sem apagar a transação.
 * Também desliga itens que tinham esse contexto explicitamente (não herdado).
 */
export async function removerLancamentoDoEvento(
  contextoId: string,
  transacaoId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("transacoes")
    .update({ contexto_id: null })
    .eq("id", transacaoId)
    .eq("contexto_id", contextoId);
  if (error) return { error: "Não foi possível remover o lançamento do evento." };
  await supabase
    .from("itens_transacao")
    .update({ contexto_id: null })
    .eq("transacao_id", transacaoId)
    .eq("contexto_id", contextoId);
  revalidatePath("/app");
  revalidatePath("/app/relatorios");
  return { ok: true };
}
