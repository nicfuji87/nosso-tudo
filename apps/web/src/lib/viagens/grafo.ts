import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgramaViagem, TransferenciaViagem } from "@/lib/viagens/tipos";

/**
 * Leitura e escrita do grafo de milhas (viagem_programas / viagem_transferencias).
 *
 * As tabelas são RLS deny-all: só este módulo (service_role) toca nelas, e todo
 * caminho de escrita passa por um gate de platform admin nas server actions.
 * Ver migration 0036 e PLANO-VIAGENS.md §6.1.
 */

interface ProgramaRow {
  id: string;
  slug: string;
  nome: string;
  tipo: ProgramaViagem["tipo"];
  pais: string | null;
  alianca: ProgramaViagem["alianca"];
  fonte_seats_aero: string | null;
  valor_por_mil_cents: number | null;
  observacoes: string | null;
  ativo: boolean;
}

interface TransferenciaRow {
  id: string;
  origem_id: string;
  destino_id: string;
  ratio_origem: number;
  ratio_destino: number;
  bonus_percent: number | string;
  bonus_valido_ate: string | null;
  minimo_transferencia: number;
  multiplo: number;
  prazo_dias_min: number;
  prazo_dias_max: number;
  ativa: boolean;
  fonte_url: string | null;
  verificado_em: string | null;
  observacoes: string | null;
}

function toPrograma(r: ProgramaRow): ProgramaViagem {
  return {
    id: r.id,
    slug: r.slug,
    nome: r.nome,
    tipo: r.tipo,
    pais: r.pais,
    alianca: r.alianca,
    fonteSeatsAero: r.fonte_seats_aero,
    valorPorMilCents: r.valor_por_mil_cents,
    observacoes: r.observacoes,
    ativo: r.ativo,
  };
}

function toTransferencia(r: TransferenciaRow): TransferenciaViagem {
  return {
    id: r.id,
    origemId: r.origem_id,
    destinoId: r.destino_id,
    ratioOrigem: r.ratio_origem,
    ratioDestino: r.ratio_destino,
    // numeric do Postgres chega como string no supabase-js; Number() aqui evita
    // que o motor faça aritmética com "30" e produza concatenação silenciosa.
    bonusPercent: Number(r.bonus_percent),
    bonusValidoAte: r.bonus_valido_ate,
    minimoTransferencia: r.minimo_transferencia,
    multiplo: r.multiplo,
    prazoDiasMin: r.prazo_dias_min,
    prazoDiasMax: r.prazo_dias_max,
    ativa: r.ativa,
    verificadoEm: r.verificado_em,
    fonteUrl: r.fonte_url,
    observacoes: r.observacoes,
  };
}

const COLS_PROGRAMA =
  "id, slug, nome, tipo, pais, alianca, fonte_seats_aero, valor_por_mil_cents, observacoes, ativo";
const COLS_TRANSFERENCIA =
  "id, origem_id, destino_id, ratio_origem, ratio_destino, bonus_percent, bonus_valido_ate, " +
  "minimo_transferencia, multiplo, prazo_dias_min, prazo_dias_max, ativa, fonte_url, verificado_em, observacoes";

export async function listProgramas(): Promise<ProgramaViagem[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("viagem_programas").select(COLS_PROGRAMA).order("nome");
  return ((data as ProgramaRow[] | null) ?? []).map(toPrograma);
}

export async function listTransferencias(): Promise<TransferenciaViagem[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("viagem_transferencias").select(COLS_TRANSFERENCIA);
  return ((data as TransferenciaRow[] | null) ?? []).map(toTransferencia);
}

/** Grafo inteiro numa ida só — é o que o motor de caminho consome. */
export async function getGrafo(): Promise<{
  programas: ProgramaViagem[];
  transferencias: TransferenciaViagem[];
}> {
  const [programas, transferencias] = await Promise.all([listProgramas(), listTransferencias()]);
  return { programas, transferencias };
}

// ---------------------------------------------------------------------------
// Escrita (chamada só por server actions com gate de platform admin)
// ---------------------------------------------------------------------------

export type ProgramaInput = Omit<ProgramaViagem, "id">;
export type TransferenciaInput = Omit<TransferenciaViagem, "id">;

function programaToRow(p: ProgramaInput) {
  return {
    slug: p.slug,
    nome: p.nome,
    tipo: p.tipo,
    pais: p.pais,
    alianca: p.alianca,
    fonte_seats_aero: p.fonteSeatsAero,
    valor_por_mil_cents: p.valorPorMilCents,
    observacoes: p.observacoes,
    ativo: p.ativo,
  };
}

function transferenciaToRow(t: TransferenciaInput) {
  return {
    origem_id: t.origemId,
    destino_id: t.destinoId,
    ratio_origem: t.ratioOrigem,
    ratio_destino: t.ratioDestino,
    bonus_percent: t.bonusPercent,
    bonus_valido_ate: t.bonusValidoAte,
    minimo_transferencia: t.minimoTransferencia,
    multiplo: t.multiplo,
    prazo_dias_min: t.prazoDiasMin,
    prazo_dias_max: t.prazoDiasMax,
    ativa: t.ativa,
    fonte_url: t.fonteUrl,
    verificado_em: t.verificadoEm,
    observacoes: t.observacoes,
  };
}

export async function upsertPrograma(input: ProgramaInput, id?: string): Promise<void> {
  const admin = createAdminClient();
  const row = programaToRow(input);
  const { error } = id
    ? await admin.from("viagem_programas").update(row).eq("id", id)
    : await admin.from("viagem_programas").insert(row);
  if (error) throw new Error(error.message);
}

export async function upsertTransferencia(input: TransferenciaInput, id?: string): Promise<void> {
  const admin = createAdminClient();
  const row = transferenciaToRow(input);
  const { error } = id
    ? await admin.from("viagem_transferencias").update(row).eq("id", id)
    : await admin.from("viagem_transferencias").insert(row);
  if (error) throw new Error(error.message);
}

export async function removerTransferencia(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("viagem_transferencias").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Marca uma aresta como conferida hoje, opcionalmente gravando a fonte.
 * É a ação mais usada da curadoria — por isso tem atalho próprio em vez de
 * obrigar a abrir o formulário inteiro.
 */
export async function marcarVerificada(id: string, fonteUrl?: string | null): Promise<void> {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { verificado_em: new Date().toISOString().slice(0, 10) };
  if (fonteUrl !== undefined) patch.fonte_url = fonteUrl;
  const { error } = await admin.from("viagem_transferencias").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
