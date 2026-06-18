import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/format";
import type { NiaWidget } from "@/lib/nia/schemas";
import type {
  Cartao,
  Categoria,
  ContaBancaria,
  Entidade,
  Essencialidade,
  Recorrencia,
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

/** `mesRef` = 1º dia do mês (YYYY-MM-DD); omitido = mês atual. */
export async function getResumoMes(workspaceId: string, mesRef?: string): Promise<ResumoMes> {
  const supabase = createClient();
  const { data } = await supabase.rpc("resumo_mes", {
    p_workspace_id: workspaceId,
    ...(mesRef ? { p_mes: mesRef } : {}),
  });
  const row = (data as ResumoMes[] | null)?.[0];
  return (
    row ?? { receitas: 0, despesas: 0, saldo: 0, total_transacoes: 0 }
  );
}

export async function getGastosPorCategoria(
  workspaceId: string,
  mesRef?: string,
  beneficiarioId?: string,
): Promise<GastoCategoria[]> {
  const supabase = createClient();
  // v2: soma pelos itens quando a nota está itemizada; cai na categoria da
  // transação quando não está (sem contagem dupla). Ver migration 0013.
  const { data } = await supabase.rpc("gastos_por_categoria_v2", {
    p_workspace_id: workspaceId,
    ...(mesRef ? { p_mes: mesRef } : {}),
    ...(beneficiarioId ? { p_beneficiario: beneficiarioId } : {}),
  });
  return (data as GastoCategoria[] | null) ?? [];
}

export interface CategoriaComparada {
  categoriaId: string;
  nome: string;
  cor: string | null;
  icone: string | null;
  atual: number;
  anterior: number;
  delta: number;
  /** variação % vs período anterior; null quando não havia gasto antes (categoria nova) */
  deltaPct: number | null;
}
export interface Comparativo {
  totalAtual: number;
  totalAnterior: number;
  /** categorias ordenadas por |delta| desc */
  categorias: CategoriaComparada[];
  /** rótulos vindos do período resolvido (ver lib/periodo.ts) */
  titulo: string;
  rotuloAtual: string;
  rotuloAnterior: string;
}

/** Janela já resolvida (lib/periodo) — atual + comparação + rótulos. */
export interface JanelaComparativo {
  inicio: string;
  fim: string;
  compInicio: string;
  compFim: string;
  titulo: string;
  rotuloAtual: string;
  rotuloAnterior: string;
}

/**
 * Comparativo por categoria de uma janela × a janela de comparação (período
 * anterior). As janelas e rótulos vêm de `resolverPeriodo`, então isto só roda
 * a RPC gastos_por_categoria_periodo (0021/0022) duas vezes e calcula os deltas.
 */
export async function getComparativoPeriodo(
  workspaceId: string,
  janela: JanelaComparativo,
  beneficiarioId?: string,
): Promise<Comparativo> {
  const supabase = createClient();
  type Row = { categoria_id: string; categoria_nome: string; cor: string | null; icone: string | null; total: number };
  const filtroPessoa = beneficiarioId ? { p_beneficiario: beneficiarioId } : {};
  const [atualRes, antRes] = await Promise.all([
    supabase.rpc("gastos_por_categoria_periodo", {
      p_workspace_id: workspaceId,
      p_inicio: janela.inicio,
      p_fim: janela.fim,
      ...filtroPessoa,
    }),
    supabase.rpc("gastos_por_categoria_periodo", {
      p_workspace_id: workspaceId,
      p_inicio: janela.compInicio,
      p_fim: janela.compFim,
      ...filtroPessoa,
    }),
  ]);
  const atual = (atualRes.data as Row[] | null) ?? [];
  const anterior = (antRes.data as Row[] | null) ?? [];

  const map = new Map<string, CategoriaComparada>();
  for (const r of atual) {
    map.set(r.categoria_id, {
      categoriaId: r.categoria_id,
      nome: r.categoria_nome,
      cor: r.cor,
      icone: r.icone,
      atual: Number(r.total),
      anterior: 0,
      delta: 0,
      deltaPct: null,
    });
  }
  for (const r of anterior) {
    const e = map.get(r.categoria_id);
    if (e) e.anterior = Number(r.total);
    else
      map.set(r.categoria_id, {
        categoriaId: r.categoria_id,
        nome: r.categoria_nome,
        cor: r.cor,
        icone: r.icone,
        atual: 0,
        anterior: Number(r.total),
        delta: 0,
        deltaPct: null,
      });
  }

  const categorias = [...map.values()]
    .map((c) => {
      c.delta = c.atual - c.anterior;
      c.deltaPct = c.anterior > 0 ? (c.delta / c.anterior) * 100 : null;
      return c;
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    totalAtual: atual.reduce((s, r) => s + Number(r.total), 0),
    totalAnterior: anterior.reduce((s, r) => s + Number(r.total), 0),
    categorias,
    titulo: janela.titulo,
    rotuloAtual: janela.rotuloAtual,
    rotuloAnterior: janela.rotuloAnterior,
  };
}

/** Resumo (receitas/despesas/saldo) num intervalo arbitrário — RPC resumo_periodo (0023). */
export async function getResumoPeriodo(workspaceId: string, inicio: string, fim: string): Promise<ResumoMes> {
  const supabase = createClient();
  const { data } = await supabase.rpc("resumo_periodo", {
    p_workspace_id: workspaceId,
    p_inicio: inicio,
    p_fim: fim,
  });
  return (data as ResumoMes[] | null)?.[0] ?? { receitas: 0, despesas: 0, saldo: 0, total_transacoes: 0 };
}

/** Gastos por categoria num intervalo (filtro de tempo completo) — RPC 0021/0022. */
export async function getGastosPorCategoriaPeriodo(
  workspaceId: string,
  inicio: string,
  fim: string,
  beneficiarioId?: string,
): Promise<GastoCategoria[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_categoria_periodo", {
    p_workspace_id: workspaceId,
    p_inicio: inicio,
    p_fim: fim,
    ...(beneficiarioId ? { p_beneficiario: beneficiarioId } : {}),
  });
  return (data as GastoCategoria[] | null) ?? [];
}

export interface GastoEssencialidade {
  essencialidade: Essencialidade;
  total: number;
}

export async function getGastosPorEssencialidade(
  workspaceId: string,
  mesRef?: string,
  beneficiarioId?: string,
): Promise<GastoEssencialidade[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_essencialidade", {
    p_workspace_id: workspaceId,
    ...(mesRef ? { p_mes: mesRef } : {}),
    ...(beneficiarioId ? { p_beneficiario: beneficiarioId } : {}),
  });
  return ((data as { essencialidade: Essencialidade; total: number }[] | null) ?? []).map((r) => ({
    essencialidade: r.essencialidade,
    total: Number(r.total),
  }));
}

/** Breakdown de uma categoria-pai em subcategorias, num intervalo — RPC 0024. */
export async function getGastosPorSubcategoriaPeriodo(
  workspaceId: string,
  inicio: string,
  fim: string,
  categoriaId: string,
  beneficiarioId?: string,
): Promise<GastoCategoria[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_subcategoria_periodo", {
    p_workspace_id: workspaceId,
    p_inicio: inicio,
    p_fim: fim,
    p_categoria: categoriaId,
    ...(beneficiarioId ? { p_beneficiario: beneficiarioId } : {}),
  });
  return (data as GastoCategoria[] | null) ?? [];
}

/** Essencial × supérfluo num intervalo arbitrário — RPC gastos_por_essencialidade_periodo (0023). */
export async function getGastosPorEssencialidadePeriodo(
  workspaceId: string,
  inicio: string,
  fim: string,
  beneficiarioId?: string,
): Promise<GastoEssencialidade[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_essencialidade_periodo", {
    p_workspace_id: workspaceId,
    p_inicio: inicio,
    p_fim: fim,
    ...(beneficiarioId ? { p_beneficiario: beneficiarioId } : {}),
  });
  return ((data as { essencialidade: Essencialidade; total: number }[] | null) ?? []).map((r) => ({
    essencialidade: r.essencialidade,
    total: Number(r.total),
  }));
}

export interface GastoContexto {
  contextoId: string;
  nome: string;
  tipo: string | null;
  cor: string | null;
  icone: string | null;
  dataReferencia: string | null;
  total: number;
  nTransacoes: number;
}

/** Custo por contexto/evento (all-time) — "quanto custou o passeio inteiro". */
export async function getGastosPorContexto(workspaceId: string): Promise<GastoContexto[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("gastos_por_contexto", { p_workspace_id: workspaceId });
  return ((data as
    | {
        contexto_id: string;
        nome: string;
        tipo: string | null;
        cor: string | null;
        icone: string | null;
        data_referencia: string | null;
        total: number;
        n_transacoes: number;
      }[]
    | null) ?? []).map((r) => ({
    contextoId: r.contexto_id,
    nome: r.nome,
    tipo: r.tipo,
    cor: r.cor,
    icone: r.icone,
    dataReferencia: r.data_referencia,
    total: Number(r.total),
    nTransacoes: Number(r.n_transacoes),
  }));
}

export interface ItemDeTransacao {
  id: string;
  transacaoId: string;
  descricao: string;
  quantidade: number;
  valorTotal: number | null;
  categoriaNome: string | null;
  categoriaIcone: string | null;
  categoriaCor: string | null;
  essencialidade: Essencialidade;
  tipoItem: string | null;
}

/** Itens (linhas de nota) das transações informadas, agrupados por transação. */
export async function getItensPorTransacao(
  workspaceId: string,
  transacaoIds: string[],
): Promise<Record<string, ItemDeTransacao[]>> {
  const out: Record<string, ItemDeTransacao[]> = {};
  if (transacaoIds.length === 0) return out;
  const supabase = createClient();
  const { data } = await supabase
    .from("itens_transacao")
    .select(
      "id, transacao_id, descricao_original, quantidade, valor_total, essencialidade, tipo_item, categoria:categorias(nome, icone, cor)",
    )
    .eq("workspace_id", workspaceId)
    .in("transacao_id", transacaoIds)
    .order("ordem_na_nota", { ascending: true });
  const rows =
    (data as
      | {
          id: string;
          transacao_id: string;
          descricao_original: string;
          quantidade: number | null;
          valor_total: number | null;
          essencialidade: Essencialidade;
          tipo_item: string | null;
          categoria: { nome: string; icone: string | null; cor: string | null } | null;
        }[]
      | null) ?? [];
  for (const r of rows) {
    (out[r.transacao_id] ??= []).push({
      id: r.id,
      transacaoId: r.transacao_id,
      descricao: r.descricao_original,
      quantidade: Number(r.quantidade ?? 1),
      valorTotal: r.valor_total != null ? Number(r.valor_total) : null,
      categoriaNome: r.categoria?.nome ?? null,
      categoriaIcone: r.categoria?.icone ?? null,
      categoriaCor: r.categoria?.cor ?? null,
      essencialidade: r.essencialidade,
      tipoItem: r.tipo_item,
    });
  }
  return out;
}

export interface TransacaoFilters {
  tipo?: string;
  categoriaId?: string;
  busca?: string;
  limit?: number;
  /** "data" (padrão, por data da compra) ou "criacao" (último lançado primeiro). */
  ordenarPor?: "data" | "criacao";
}

export async function listTransacoes(
  workspaceId: string,
  filters: TransacaoFilters = {},
): Promise<TransacaoComRelacoes[]> {
  const supabase = createClient();
  let query = supabase.from("transacoes").select(TX_SELECT).eq("workspace_id", workspaceId);
  // "criacao" = ordem de lançamento (o que foi registrado por último vem primeiro).
  if (filters.ordenarPor === "criacao") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("data_transacao", { ascending: false }).order("created_at", { ascending: false });
  }
  query = query.limit(filters.limit ?? 100);

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

export interface GastoPessoa {
  id: string;
  nome: string;
  total: number;
}

/** Despesas confirmadas do mês agrupadas por quem se BENEFICIOU (beneficiário). */
export async function getGastosPorPessoa(workspaceId: string): Promise<GastoPessoa[]> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("transacoes")
    .select("valor, beneficiario:entidades!transacoes_beneficiario_id_fkey(id, nome)")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", mesRef);
  const rows =
    (data as { valor: number; beneficiario: { id: string; nome: string } | null }[] | null) ?? [];
  const map = new Map<string, { nome: string; total: number }>();
  for (const r of rows) {
    const key = r.beneficiario?.id ?? "—";
    const atual = map.get(key) ?? { nome: r.beneficiario?.nome ?? "Não atribuído", total: 0 };
    atual.total += Number(r.valor);
    map.set(key, atual);
  }
  return [...map.entries()]
    .map(([id, v]) => ({ id, nome: v.nome, total: v.total }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Categorias de topo (pais) ativas — opções do filtro por categoria. */
export async function listCategoriasPai(
  workspaceId: string,
): Promise<{ id: string; nome: string; icone: string | null }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categorias")
    .select("id, nome, icone")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true)
    .is("categoria_pai_id", null)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  return (data as { id: string; nome: string; icone: string | null }[] | null) ?? [];
}

/** Pessoas/grupos que aparecem como beneficiário em despesas — opções do filtro. */
export async function listBeneficiarios(workspaceId: string): Promise<{ id: string; nome: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transacoes")
    .select("beneficiario:entidades!transacoes_beneficiario_id_fkey(id, nome)")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "despesa")
    .not("beneficiario_id", "is", null);
  const map = new Map<string, string>();
  for (const r of (data as { beneficiario: { id: string; nome: string } | null }[] | null) ?? []) {
    if (r.beneficiario) map.set(r.beneficiario.id, r.beneficiario.nome);
  }
  return [...map.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function listRecorrencias(workspaceId: string): Promise<Recorrencia[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("recorrencias")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("ativa", { ascending: false })
    .order("descricao", { ascending: true });
  return (data as Recorrencia[] | null) ?? [];
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

export interface ItemBusca {
  nome: string;
  data: string;
  estabelecimento: string | null;
  valorTotal: number | null;
}

/** Busca itens comprados (linhas de nota) por termo na descrição. */
export async function buscarItens(workspaceId: string, termo: string, limite = 12): Promise<ItemBusca[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("itens_transacao")
    .select("descricao_original, valor_total, transacao:transacoes(data_transacao, estabelecimento:estabelecimentos(nome))")
    .eq("workspace_id", workspaceId)
    .ilike("descricao_original", `%${termo}%`)
    .limit(limite);
  const rows =
    (data as
      | {
          descricao_original: string;
          valor_total: number | null;
          transacao: { data_transacao: string; estabelecimento: { nome: string } | null } | null;
        }[]
      | null) ?? [];
  return rows
    .map((r) => ({
      nome: r.descricao_original,
      data: r.transacao?.data_transacao ?? "",
      estabelecimento: r.transacao?.estabelecimento?.nome ?? null,
      valorTotal: r.valor_total != null ? Number(r.valor_total) : null,
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
}

export interface DocBusca {
  id: string;
  nome: string | null;
  resumo: string | null;
  data: string;
  tipo: string;
}

/** Busca documentos (notas/recibos) pela leitura de texto guardada (texto_extraido). */
export async function buscarDocumentos(workspaceId: string, termo?: string, limite = 8): Promise<DocBusca[]> {
  const supabase = createClient();
  let q = supabase
    .from("midias")
    .select("id, nome_original, texto_extraido, created_at, tipo")
    .eq("workspace_id", workspaceId)
    .in("tipo", ["imagem", "pdf"])
    .not("texto_extraido", "is", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (termo) q = q.ilike("texto_extraido", `%${termo}%`);
  const { data } = await q;
  return ((data as
    | { id: string; nome_original: string | null; texto_extraido: string | null; created_at: string; tipo: string }[]
    | null) ?? []).map((m) => ({
    id: m.id,
    nome: m.nome_original,
    resumo: m.texto_extraido,
    data: m.created_at,
    tipo: m.tipo,
  }));
}

export interface MidiaArquivo {
  bucket: string;
  storagePath: string;
  nome: string | null;
  mimeType: string | null;
  tipo: string;
}

export async function getMidia(workspaceId: string, midiaId: string): Promise<MidiaArquivo | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("midias")
    .select("bucket, storage_path, nome_original, mime_type, tipo")
    .eq("workspace_id", workspaceId)
    .eq("id", midiaId)
    .maybeSingle();
  if (!data) return null;
  const m = data as { bucket: string; storage_path: string; nome_original: string | null; mime_type: string | null; tipo: string };
  return { bucket: m.bucket, storagePath: m.storage_path, nome: m.nome_original, mimeType: m.mime_type, tipo: m.tipo };
}

export interface Alerta {
  nivel: "atencao" | "alerta";
  texto: string;
}

/**
 * Avisos financeiros determinísticos (sem LLM): saldo negativo, orçamento
 * estourado/perto e cartão perto do limite. Base da Nia proativa.
 */
export async function getAlertas(workspaceId: string): Promise<Alerta[]> {
  const supabase = createClient();
  const alertas: Alerta[] = [];
  const inicio = new Date();
  inicio.setDate(1);
  const mesRef = inicio.toISOString().slice(0, 10);

  const resumo = await getResumoMes(workspaceId);
  if (resumo.saldo < 0) {
    alertas.push({ nivel: "alerta", texto: `Saldo do mês está negativo: ${formatBRL(resumo.saldo)}.` });
  }

  for (const o of await listOrcamentos(workspaceId)) {
    const pct = Math.round((o.gasto / Math.max(1, o.planejado)) * 100);
    if (o.gasto > o.planejado) {
      alertas.push({
        nivel: "alerta",
        texto: `Orçamento de ${o.categoriaNome} estourou: ${formatBRL(o.gasto)} de ${formatBRL(o.planejado)} (${pct}%).`,
      });
    } else if (o.gasto >= o.planejado * 0.8) {
      alertas.push({
        nivel: "atencao",
        texto: `Orçamento de ${o.categoriaNome} em ${pct}% (${formatBRL(o.gasto)} de ${formatBRL(o.planejado)}).`,
      });
    }
  }

  const cartoes = (await listCartoes(workspaceId)).filter((c) => c.limite && c.limite > 0);
  if (cartoes.length > 0) {
    const { data } = await supabase
      .from("transacoes")
      .select("cartao_id, valor")
      .eq("workspace_id", workspaceId)
      .eq("tipo", "despesa")
      .eq("status_revisao", "confirmado")
      .gte("data_transacao", mesRef)
      .not("cartao_id", "is", null);
    const uso = new Map<string, number>();
    for (const t of (data as { cartao_id: string; valor: number }[] | null) ?? []) {
      uso.set(t.cartao_id, (uso.get(t.cartao_id) ?? 0) + Number(t.valor));
    }
    for (const c of cartoes) {
      const limite = c.limite as number;
      const usado = uso.get(c.id) ?? 0;
      if (usado >= limite * 0.8) {
        const pct = Math.round((usado / limite) * 100);
        alertas.push({
          nivel: usado >= limite ? "alerta" : "atencao",
          texto: `Cartão ${c.apelido} em ${pct}% do limite (${formatBRL(usado)} de ${formatBRL(limite)}).`,
        });
      }
    }
  }

  return alertas;
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
    .select("papel, conteudo, midias, created_at")
    .eq("conversa_id", conversaId)
    .in("papel", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limite);
  const rows =
    (data as { papel: string; conteudo: string | null; midias: { leitura?: string | null }[] | null }[] | null) ?? [];
  const msgs: TurnoHistorico[] = [];
  for (const r of rows.reverse()) {
    // Leitura do anexo (imagem/PDF) injetada como contexto invisível — a Nia "lembra"
    // da nota mesmo nos turnos seguintes, sem reenviar o arquivo bruto.
    const leitura = Array.isArray(r.midias)
      ? r.midias.map((m) => m?.leitura).filter(Boolean).join("\n").trim()
      : "";
    let content = (r.conteudo ?? "").trim();
    if (leitura) content = `${content}\n\n[Conteúdo do anexo enviado: ${leitura}]`.trim();
    if (!content) continue;
    msgs.push({ role: r.papel === "assistant" ? "assistant" : "user", content: content.slice(0, 6000) });
  }
  // Anthropic exige que a 1ª mensagem seja do usuário.
  while (msgs.length > 0 && msgs[0]!.role === "assistant") msgs.shift();
  return msgs;
}

export interface LancamentoConversa {
  descricao: string;
  valor: number;
  estabelecimento: string | null;
  itens: { nome: string; quantidade: number | null; unidade: string | null }[];
}

/**
 * Lançamentos (despesas/receitas) já confirmados NESTA conversa, via nia_acoes
 * (status 'executada' → registro_id). Vira memória de curto prazo da Nia: o route
 * injeta isso no contexto para ela não repropor a mesma compra/itens já lançados.
 */
export async function getLancamentosDaConversa(
  conversaId: string,
  limite = 10,
): Promise<LancamentoConversa[]> {
  const supabase = createClient();
  const { data: acoes } = await supabase
    .from("nia_acoes")
    .select("registro_id")
    .eq("conversa_id", conversaId)
    .eq("status", "executada")
    .in("ferramenta", ["lancar_transacao", "lancar_transacao_detalhada"])
    .not("registro_id", "is", null)
    .order("confirmado_em", { ascending: false })
    .limit(limite);
  const ids = ((acoes as { registro_id: string }[] | null) ?? []).map((a) => a.registro_id);
  if (ids.length === 0) return [];

  const [{ data: txs }, { data: itens }] = await Promise.all([
    supabase
      .from("transacoes")
      .select("id, descricao, valor, estabelecimento:estabelecimentos(nome)")
      .in("id", ids),
    supabase
      .from("itens_transacao")
      .select("transacao_id, descricao_original, quantidade, unidade")
      .in("transacao_id", ids),
  ]);

  const itensPorTx = new Map<string, LancamentoConversa["itens"]>();
  for (const it of (itens as
    | { transacao_id: string; descricao_original: string; quantidade: number | null; unidade: string | null }[]
    | null) ?? []) {
    const arr = itensPorTx.get(it.transacao_id) ?? [];
    arr.push({
      nome: it.descricao_original,
      quantidade: it.quantidade != null ? Number(it.quantidade) : null,
      unidade: it.unidade,
    });
    itensPorTx.set(it.transacao_id, arr);
  }

  const txRows =
    (txs as
      | { id: string; descricao: string; valor: number; estabelecimento: { nome: string } | null }[]
      | null) ?? [];
  // Preserva a ordem de `ids` (mais recente primeiro).
  return ids
    .map((id) => txRows.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      descricao: t.descricao,
      valor: Number(t.valor),
      estabelecimento: t.estabelecimento?.nome ?? null,
      itens: itensPorTx.get(t.id) ?? [],
    }));
}

export interface MensagemHistorico {
  id: string;
  autor: "user" | "nia";
  texto: string;
  widgets: NiaWidget[];
  mensagemId: string | null;
  anexos?: { tipo: string; nome: string }[];
}

/** Conversa mais recente (não arquivada) do workspace — base da continuidade do chat. */
export async function getConversaAtiva(workspaceId: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("conversas_ia")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("arquivada", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Todas as mensagens de uma conversa, em ordem cronológica, no shape do chat. */
export async function getMensagensConversa(conversaId: string): Promise<MensagemHistorico[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mensagens_ia")
    .select("id, papel, conteudo, widgets, midias, created_at")
    .eq("conversa_id", conversaId)
    .in("papel", ["user", "assistant"])
    .order("created_at", { ascending: true });
  const rows =
    (data as
      | {
          id: string;
          papel: string;
          conteudo: string | null;
          widgets: NiaWidget[] | null;
          midias: { tipo?: string; nome?: string | null }[] | null;
          created_at: string;
        }[]
      | null) ?? [];

  const msgs: MensagemHistorico[] = [];
  for (const r of rows) {
    const texto = r.conteudo ?? "";
    const widgets = Array.isArray(r.widgets) ? r.widgets : [];
    if (r.papel === "user") {
      const anexos = Array.isArray(r.midias)
        ? r.midias
            .filter((m) => m && m.tipo)
            .map((m) => ({ tipo: m.tipo as string, nome: m.nome ?? "anexo" }))
        : [];
      if (!texto.trim() && anexos.length === 0) continue;
      msgs.push({ id: r.id, autor: "user", texto, widgets: [], mensagemId: null, anexos });
    } else {
      if (!texto.trim() && widgets.length === 0) continue;
      msgs.push({ id: r.id, autor: "nia", texto, widgets, mensagemId: r.id });
    }
  }
  return msgs;
}

/** Status das ações propostas numa conversa: { acaoId → status } (cards do histórico). */
export async function getStatusAcoes(conversaId: string): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_acoes")
    .select("id, status")
    .eq("conversa_id", conversaId);
  const rows = (data as { id: string; status: string }[] | null) ?? [];
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
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
