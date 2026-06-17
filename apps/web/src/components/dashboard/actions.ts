"use server";

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
