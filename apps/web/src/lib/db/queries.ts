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

export interface MetaResumo {
  id: string;
  nome: string;
  valorAlvo: number;
  valorAtual: number;
  dataAlvo: string | null;
  status: string;
}

export async function listMetas(workspaceId: string): Promise<MetaResumo[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("metas_financeiras")
    .select("id, nome, valor_alvo, valor_atual, data_alvo, status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  return ((data as
    | { id: string; nome: string; valor_alvo: number; valor_atual: number; data_alvo: string | null; status: string }[]
    | null) ?? []).map((m) => ({
    id: m.id,
    nome: m.nome,
    valorAlvo: Number(m.valor_alvo),
    valorAtual: Number(m.valor_atual ?? 0),
    dataAlvo: m.data_alvo,
    status: m.status,
  }));
}

export interface OrcamentoResumo {
  categoriaId: string;
  categoriaNome: string;
  planejado: number;
  gasto: number;
}

export async function listOrcamentos(workspaceId: string): Promise<OrcamentoResumo[]> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("orcamentos")
    .select("valor_planejado, categoria:categorias(id, nome)")
    .eq("workspace_id", workspaceId)
    .eq("mes_referencia", mesRef);
  const rows =
    (data as { valor_planejado: number; categoria: { id: string; nome: string } | null }[] | null) ?? [];
  const gastos = await getGastosPorCategoria(workspaceId);
  const gastoPorCat = new Map(gastos.map((g) => [g.categoria_id, g.total]));
  return rows
    .filter((r) => r.categoria)
    .map((r) => ({
      categoriaId: r.categoria!.id,
      categoriaNome: r.categoria!.nome,
      planejado: Number(r.valor_planejado),
      gasto: gastoPorCat.get(r.categoria!.id) ?? 0,
    }));
}

export interface TurnoHistorico {
  role: "user" | "assistant";
  content: string;
}

/** Últimas N mensagens da conversa (janela de contexto), em ordem cronológica. */
export async function getHistoricoRecente(
  conversaId: string,
  limite = 10,
): Promise<TurnoHistorico[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mensagens_ia")
    .select("papel, conteudo, created_at")
    .eq("conversa_id", conversaId)
    .in("papel", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limite);
  const rows = (data as { papel: string; conteudo: string }[] | null) ?? [];
  const msgs: TurnoHistorico[] = rows
    .reverse()
    .filter((r) => r.conteudo && r.conteudo.trim().length > 0)
    .map((r) => ({
      role: r.papel === "assistant" ? "assistant" : "user",
      content: r.conteudo.slice(0, 4000),
    }));
  // Anthropic exige que a 1ª mensagem seja do usuário.
  while (msgs.length > 0 && msgs[0]!.role === "assistant") msgs.shift();
  return msgs;
}

export interface MatchEstabelecimento {
  id: string;
  nome: string;
  score: number;
}

/** Melhor candidato de estabelecimento por similaridade (pg_trgm), ou null. Sob RLS. */
export async function buscarMatchEstabelecimento(
  workspaceId: string,
  nome: string,
): Promise<MatchEstabelecimento | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("buscar_match_estabelecimento", {
    p_workspace_id: workspaceId,
    p_nome: nome,
  });
  const top = (data as { id: string; nome: string; score: number }[] | null)?.[0];
  return top ? { id: top.id, nome: top.nome, score: Number(top.score) } : null;
}

export interface ColecaoResumo {
  id: string;
  nome: string;
  tipo: string | null;
  status: string | null;
  valor: number | null;
}

export async function listColecoes(workspaceId: string): Promise<ColecaoResumo[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("colecoes")
    .select(
      "id, nome, valor_estimado, valor_final, orcamento_previsto, status_compromisso, status_projeto, categoria:categorias(comportamento)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows =
    (data as
      | {
          id: string;
          nome: string;
          valor_estimado: number | null;
          valor_final: number | null;
          orcamento_previsto: number | null;
          status_compromisso: string | null;
          status_projeto: string | null;
          categoria: { comportamento: string } | null;
        }[]
      | null) ?? [];
  return rows.map((r) => {
    const tipo = r.categoria?.comportamento ?? null;
    return {
      id: r.id,
      nome: r.nome,
      tipo,
      status: tipo === "projeto" ? r.status_projeto : r.status_compromisso,
      valor: r.valor_final ?? r.valor_estimado ?? r.orcamento_previsto ?? null,
    };
  });
}
