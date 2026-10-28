import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listProgramas } from "@/lib/viagens/grafo";
import {
  lotesExpirando,
  resumirLotes,
  type AlertaExpiracao,
  type LoteMilhas,
  type OrigemLote,
} from "@/lib/viagens/custo";
import type { ProgramaViagem } from "@/lib/viagens/tipos";
import { hojeISO } from "@/lib/format";

/**
 * Carteira de milhas da família.
 *
 * `viagem_lotes` é RLS por workspace (policy p_ws), então lemos com o client
 * do usuário — o banco garante o isolamento, não este arquivo. O grafo
 * (`viagem_programas`) é deny-all e vem via service_role em grafo.ts.
 */

interface LoteRow {
  id: string;
  programa_id: string;
  titular_id: string | null;
  quantidade: number | string;
  quantidade_restante: number | string;
  custo_cents: number | string;
  origem: OrigemLote;
  lote_origem_id: string | null;
  data: string;
  expira_em: string | null;
  descricao: string | null;
  extrato_id: string | null;
}

const COLS_LOTE =
  "id, programa_id, titular_id, quantidade, quantidade_restante, custo_cents, origem, " +
  "lote_origem_id, data, expira_em, descricao, extrato_id";

/** bigint do Postgres chega como string no supabase-js — Number() ou a matemática vira concatenação. */
function toLote(r: LoteRow): LoteMilhas & {
  titularId: string | null;
  descricao: string | null;
  extratoId: string | null;
} {
  return {
    id: r.id,
    programaId: r.programa_id,
    quantidade: Number(r.quantidade),
    quantidadeRestante: Number(r.quantidade_restante),
    custoCents: Number(r.custo_cents),
    origem: r.origem,
    data: r.data,
    expiraEm: r.expira_em,
    titularId: r.titular_id,
    descricao: r.descricao,
    extratoId: r.extrato_id,
  };
}

export type LoteCarteira = ReturnType<typeof toLote>;

export interface ProgramaCarteira {
  programa: ProgramaViagem;
  saldo: number;
  custoRestanteCents: number;
  /** Centavos por 1.000 milhas — o que a família REALMENTE pagou. */
  custoPorMilCents: number | null;
  lotes: LoteCarteira[];
  proximaExpiracao: string | null;
}

export interface Carteira {
  programas: ProgramaCarteira[];
  saldoTotal: number;
  investidoTotalCents: number;
  alertas: AlertaExpiracao[];
  /** Programas do grafo que ainda não têm lote — para o seletor de "adicionar". */
  programasDisponiveis: ProgramaViagem[];
}

export async function getCarteira(workspaceId: string): Promise<Carteira> {
  const supabase = createClient();
  const [{ data }, programas] = await Promise.all([
    supabase
      .from("viagem_lotes")
      .select(COLS_LOTE)
      .eq("workspace_id", workspaceId)
      .gt("quantidade_restante", 0)
      .order("data", { ascending: true }),
    listProgramas(),
  ]);

  const lotes = ((data as LoteRow[] | null) ?? []).map(toLote);
  const porPrograma = new Map<string, LoteCarteira[]>();
  for (const l of lotes) {
    porPrograma.set(l.programaId, [...(porPrograma.get(l.programaId) ?? []), l]);
  }

  const mapaProgramas = new Map(programas.map((p) => [p.id, p]));
  const resultado: ProgramaCarteira[] = [];

  for (const [programaId, doPrograma] of porPrograma) {
    const programa = mapaProgramas.get(programaId);
    if (!programa) continue;
    const resumo = resumirLotes(doPrograma);
    const expiracoes = doPrograma
      .map((l) => l.expiraEm)
      .filter((e): e is string => e !== null)
      .sort();
    resultado.push({
      programa,
      saldo: resumo.saldo,
      custoRestanteCents: resumo.custoRestanteCents,
      custoPorMilCents: resumo.custoPorMilCents,
      lotes: doPrograma,
      proximaExpiracao: expiracoes[0] ?? null,
    });
  }

  resultado.sort((a, b) => b.saldo - a.saldo);

  return {
    programas: resultado,
    saldoTotal: resultado.reduce((s, p) => s + p.saldo, 0),
    investidoTotalCents: resultado.reduce((s, p) => s + p.custoRestanteCents, 0),
    alertas: lotesExpirando(lotes, hojeISO(), 120),
    programasDisponiveis: programas.filter((p) => p.ativo),
  };
}

/**
 * Saldos no formato que o motor de caminho consome, já com o CUSTO REAL.
 * É o que faz a simulação deixar de usar estimativa de mercado.
 */
export async function getSaldosParaMotor(
  workspaceId: string,
): Promise<{ programaId: string; saldo: number; custoPorMilCents: number | null }[]> {
  const carteira = await getCarteira(workspaceId);
  return carteira.programas.map((p) => ({
    programaId: p.programa.id,
    saldo: p.saldo,
    custoPorMilCents: p.custoPorMilCents,
  }));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export interface NovoLoteInput {
  programaId: string;
  titularId?: string | null;
  quantidade: number;
  custoCents: number;
  origem: OrigemLote;
  data: string;
  expiraEm?: string | null;
  descricao?: string | null;
  extratoId?: string | null;
  loteOrigemId?: string | null;
}

export async function criarLote(workspaceId: string, input: NovoLoteInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("viagem_lotes")
    .insert({
      workspace_id: workspaceId,
      programa_id: input.programaId,
      titular_id: input.titularId ?? null,
      quantidade: input.quantidade,
      // Lote novo nasce inteiro; o consumo desconta depois.
      quantidade_restante: input.quantidade,
      custo_cents: input.custoCents,
      origem: input.origem,
      lote_origem_id: input.loteOrigemId ?? null,
      data: input.data,
      expira_em: input.expiraEm ?? null,
      descricao: input.descricao ?? null,
      extrato_id: input.extratoId ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Insere vários lotes de uma vez (importação de extrato). */
export async function criarLotes(
  workspaceId: string,
  inputs: NovoLoteInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const supabase = createClient();
  const { error } = await supabase.from("viagem_lotes").insert(
    inputs.map((i) => ({
      workspace_id: workspaceId,
      programa_id: i.programaId,
      titular_id: i.titularId ?? null,
      quantidade: i.quantidade,
      quantidade_restante: i.quantidade,
      custo_cents: i.custoCents,
      origem: i.origem,
      lote_origem_id: i.loteOrigemId ?? null,
      data: i.data,
      expira_em: i.expiraEm ?? null,
      descricao: i.descricao ?? null,
      extrato_id: i.extratoId ?? null,
    })),
  );
  if (error) throw new Error(error.message);
  return inputs.length;
}

export async function removerLote(workspaceId: string, loteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("viagem_lotes")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", loteId);
  if (error) throw new Error(error.message);
}

/**
 * Confere o saldo declarado pelo extrato contra a soma dos lotes.
 * Divergência não é erro fatal — é sinal de que falta lote (ou sobra), e o
 * usuário precisa saber em vez de a gente discordar do banco em silêncio.
 */
export interface Reconciliacao {
  saldoCalculado: number;
  saldoDeclarado: number;
  diferenca: number;
  confere: boolean;
}

export function reconciliar(saldoCalculado: number, saldoDeclarado: number): Reconciliacao {
  const diferenca = saldoDeclarado - saldoCalculado;
  return {
    saldoCalculado,
    saldoDeclarado,
    diferenca,
    confere: diferenca === 0,
  };
}

/** Extratos já importados (histórico + rastreabilidade). */
export async function listExtratos(workspaceId: string, limite = 20) {
  const supabase = createClient();
  const { data } = await supabase
    .from("viagem_extratos")
    .select("id, programa_id, periodo_inicio, periodo_fim, saldo_declarado, importado_em, observacoes")
    .eq("workspace_id", workspaceId)
    .order("importado_em", { ascending: false })
    .limit(limite);
  return (data ?? []) as {
    id: string;
    programa_id: string | null;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    saldo_declarado: number | null;
    importado_em: string;
    observacoes: string | null;
  }[];
}

/** Cria o registro do extrato importado. Devolve o id para amarrar os lotes. */
export async function criarExtrato(
  workspaceId: string,
  input: {
    programaId?: string | null;
    titularId?: string | null;
    midiaId?: string | null;
    periodoInicio?: string | null;
    periodoFim?: string | null;
    saldoDeclarado?: number | null;
    observacoes?: string | null;
    importadoPor?: string | null;
  },
): Promise<string> {
  // service_role aqui porque a importação pode rodar a partir da Nia, fora do
  // contexto de request com cookie do usuário.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viagem_extratos")
    .insert({
      workspace_id: workspaceId,
      programa_id: input.programaId ?? null,
      titular_id: input.titularId ?? null,
      midia_id: input.midiaId ?? null,
      periodo_inicio: input.periodoInicio ?? null,
      periodo_fim: input.periodoFim ?? null,
      saldo_declarado: input.saldoDeclarado ?? null,
      observacoes: input.observacoes ?? null,
      importado_por: input.importadoPor ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
