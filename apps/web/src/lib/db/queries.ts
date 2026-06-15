import { createClient } from "@/lib/supabase/server";
import type {
  Cartao,
  Categoria,
  ContaBancaria,
  Entidade,
  TransacaoComRelacoes,
} from "@/lib/types/db";

const TX_SELECT =
  "*, categoria:categorias(id,nome,icone,cor), estabelecimento:estabelecimentos(id,nome), pagador:entidades!transacoes_pagador_id_fkey(id,nome)";

export interface ResumoMes {
  receitas: number;
  despesas: number;
  saldo: number;
  total_transacoes: number;
}

export interface GastoCategoria {
  categoria_id: string;
  categoria_nome: string;
  cor: string | null;
  icone: string | null;
  total: number;
}

export async function getResumoMes(workspaceId: string): Promise<ResumoMes> {
  const supabase = createClient();
  const { data } = await supabase.rpc("resumo_mes", { p_workspace_id: workspaceId });
  const row = (data as ResumoMes[] | null)?.[0];
  return (
    row ?? { receitas: 0, despesas: 0, saldo: 0, total_transacoes: 0 }
  );
}

export async function getGastosPorCategoria(workspaceId: string): Promise<GastoCategoria[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_categoria", { p_workspace_id: workspaceId });
  return (data as GastoCategoria[] | null) ?? [];
}

export interface TransacaoFilters {
  tipo?: string;
  categoriaId?: string;
  busca?: string;
  limit?: number;
}

export async function listTransacoes(
  workspaceId: string,
  filters: TransacaoFilters = {},
): Promise<TransacaoComRelacoes[]> {
  const supabase = createClient();
  let query = supabase
    .from("transacoes")
    .select(TX_SELECT)
    .eq("workspace_id", workspaceId)
    .order("data_transacao", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (filters.categoriaId) query = query.eq("categoria_id", filters.categoriaId);
  if (filters.busca) query = query.ilike("descricao", `%${filters.busca}%`);

  const { data } = await query;
  return (data as TransacaoComRelacoes[] | null) ?? [];
}

export async function listCategorias(workspaceId: string): Promise<Categoria[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categorias")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  return (data as Categoria[] | null) ?? [];
}

export async function listEntidades(workspaceId: string): Promise<Entidade[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("entidades")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true)
    .order("nome", { ascending: true });
  return (data as Entidade[] | null) ?? [];
}

export async function listContas(workspaceId: string): Promise<ContaBancaria[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("contas_bancarias")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true)
    .order("apelido", { ascending: true });
  return (data as ContaBancaria[] | null) ?? [];
}

export async function listCartoes(workspaceId: string): Promise<Cartao[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cartoes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("ativo", true)
    .order("apelido", { ascending: true });
  return (data as Cartao[] | null) ?? [];
}
