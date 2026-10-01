import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { itensValidacao, PIN_COLUNAS, type PinView } from "@/components/ml/publicacoes/tipos";

type Supa = ReturnType<typeof createClient>;

/** Grupos de status das abas (Agendados inclui "publicando"; Falhas = falhou + bloqueado). */
export const GRUPOS_STATUS: Record<string, { label: string; status: string[] }> = {
  draft: { label: "Rascunho", status: ["draft"] },
  pending_approval: { label: "Aguardando aprovação", status: ["pending_approval"] },
  scheduled: { label: "Agendados", status: ["scheduled", "publishing"] },
  published: { label: "Publicados", status: ["published"] },
  falhas: { label: "Falhas", status: ["failed", "blocked"] },
  paused: { label: "Pausados", status: ["paused"] },
  canceled: { label: "Cancelados", status: ["canceled"] },
};

export interface FiltrosPin {
  status?: string[];
  produto?: string;
  board?: string;
}

interface Filtravel {
  eq(coluna: string, valor: string): Filtravel;
  in(coluna: string, valores: string[]): Filtravel;
}

/** Aplica status/produto/board a qualquer query de ml_pins (o builder do PostgREST é estrutural). */
export function filtrar<T>(q: T, f: FiltrosPin): T {
  let r = q as unknown as Filtravel;
  if (f.status?.length) r = f.status.length === 1 ? r.eq("status", f.status[0]!) : r.in("status", f.status);
  if (f.produto) r = r.eq("product_id", f.produto);
  if (f.board) r = r.eq("board_id", f.board);
  return r as unknown as T;
}

interface LinhaPin {
  id: string;
  status: string;
  title: string | null;
  description: string | null;
  alt_text: string | null;
  link_url: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  environment: string | null;
  last_error: string | null;
  external_url: string | null;
  attempts: number | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
  duplicated_from: string | null;
  validation: unknown;
  board_id: string | null;
  product_id: string;
  creative_id: string;
}

function blocos<T>(lista: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

async function porIds<T extends { id: string }>(supabase: Supa, tabela: string, colunas: string, ids: string[]): Promise<Map<string, T>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, T>();
  if (!unicos.length) return mapa;
  const resultados = await Promise.all(blocos(unicos).map((b) => supabase.from(tabela).select(colunas).in("id", b)));
  for (const r of resultados) for (const row of ((r.data ?? []) as unknown as T[])) mapa.set(row.id, row);
  return mapa;
}

/** Junta produto, board e criativo (consultas separadas, em blocos — evita URL gigante e ambiguidade de embed). */
export async function hidratarPins(supabase: Supa, dados: unknown): Promise<PinView[]> {
  const linhas = (dados ?? []) as LinhaPin[];
  if (!linhas.length) return [];
  const [produtos, boards, criativos] = await Promise.all([
    porIds<{ id: string; title: string; permalink: string | null }>(supabase, "ml_products", "id, title, permalink", linhas.map((l) => l.product_id)),
    porIds<{ id: string; name: string }>(supabase, "ml_pinterest_boards", "id, name", linhas.map((l) => l.board_id ?? "")),
    porIds<{ id: string; headline: string | null }>(supabase, "ml_creatives", "id, headline", linhas.map((l) => l.creative_id)),
  ]);
  return linhas.map((l) => ({
    id: l.id,
    status: l.status,
    title: l.title,
    description: l.description,
    alt_text: l.alt_text,
    link_url: l.link_url,
    media_url: l.media_url,
    scheduled_at: l.scheduled_at,
    published_at: l.published_at,
    environment: l.environment,
    last_error: l.last_error,
    external_url: l.external_url,
    attempts: l.attempts ?? 0,
    validated_at: l.validated_at,
    created_at: l.created_at,
    updated_at: l.updated_at,
    duplicated_from: l.duplicated_from,
    validacao: itensValidacao(l.validation),
    product: produtos.get(l.product_id) ?? null,
    board: l.board_id ? (boards.get(l.board_id) ?? null) : null,
    creative: criativos.get(l.creative_id) ?? null,
  }));
}

export async function lerPinPorId(supabase: Supa, id: string): Promise<PinView | null> {
  const { data } = await supabase.from("ml_pins").select(PIN_COLUNAS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [pin] = await hidratarPins(supabase, [data]);
  return pin ?? null;
}

/** Filtro OR "data de referência no intervalo": publicado no intervalo, ou não publicado e agendado no intervalo. */
export function orIntervalo(deIso: string, ateIso: string): string {
  const a = `"${deIso}"`;
  const b = `"${ateIso}"`;
  return `and(published_at.gte.${a},published_at.lt.${b}),and(published_at.is.null,scheduled_at.gte.${a},scheduled_at.lt.${b})`;
}
