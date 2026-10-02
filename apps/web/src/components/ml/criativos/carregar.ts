import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AssetRow, BoardRow, CriativoRow, ProdutoRow } from "@/lib/ml/tipos";
import type { BoardOpcao, CriativoView, ErroPacote, FidelidadeIAView, MetricasView } from "./rotulos";

/**
 * Leitura de criativos para as telas (cliente do usuário ⇒ RLS). Faz as
 * junções (asset atual, produto, ângulo, board) em consultas separadas por id,
 * em lotes, para não depender de embed ambíguo nem estourar a URL.
 */

const COLUNAS =
  "id, product_id, angle_id, status, image_mode, format, headline, title, description, alt_text, cta, keywords, board_id, quality_score, quality_notes, rejection_reason, last_error, image_prompt, reference_image_url, current_asset_id, created_at, updated_at, family_id, visual_type, scene_preset_id, fidelity_mode, fidelity_status, fidelity_score, fidelity_notes, has_text_overlay, ai_modified, package_status, package_errors, board_section_id, interests, source_media_ids, approved_at";

type CriativoLinha = Pick<
  CriativoRow,
  | "id"
  | "product_id"
  | "angle_id"
  | "status"
  | "image_mode"
  | "format"
  | "headline"
  | "title"
  | "description"
  | "alt_text"
  | "cta"
  | "keywords"
  | "board_id"
  | "quality_score"
  | "quality_notes"
  | "rejection_reason"
  | "last_error"
  | "image_prompt"
  | "reference_image_url"
  | "current_asset_id"
  | "created_at"
  | "updated_at"
  | "family_id"
  | "visual_type"
  | "scene_preset_id"
  | "fidelity_mode"
  | "fidelity_status"
  | "fidelity_score"
  | "fidelity_notes"
  | "has_text_overlay"
  | "ai_modified"
  | "package_status"
  | "package_errors"
  | "board_section_id"
  | "interests"
  | "source_media_ids"
  | "approved_at"
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export async function porIds<T>(ids: string[], buscar: (lote: string[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let i = 0; i < unicos.length; i += 80) {
    const { data } = await buscar(unicos.slice(i, i + 80));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export interface FiltrosCriativos {
  status?: string | null;
  produto?: string | null;
  modo?: string | null;
  q?: string | null;
  ids?: string[];
  /** Só variantes destas famílias (V2). */
  familias?: string[];
  limite?: number;
  maisAntigosPrimeiro?: boolean;
}

/** Remove caracteres com significado na sintaxe de filtro do PostgREST. */
function termoBusca(q: string): string {
  return q.replace(/[%*,().\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function carregarCriativos(f: FiltrosCriativos = {}): Promise<CriativoView[]> {
  const supabase = createClient();
  let q = supabase
    .from("ml_creatives")
    .select(COLUNAS)
    .order("created_at", { ascending: Boolean(f.maisAntigosPrimeiro) })
    .limit(f.limite ?? 200);
  if (f.ids) {
    const ids = f.ids.filter(ehUuid);
    if (!ids.length) return [];
    q = q.in("id", ids);
  }
  if (f.familias) {
    const fams = f.familias.filter(ehUuid);
    if (!fams.length) return [];
    q = q.in("family_id", fams);
  }
  if (f.status) q = q.eq("status", f.status);
  else if (!f.ids) q = q.neq("status", "archived");
  if (f.produto && ehUuid(f.produto)) q = q.eq("product_id", f.produto);
  if (f.modo) q = q.eq("image_mode", f.modo);
  const termo = f.q ? termoBusca(f.q) : "";
  if (termo) q = q.or(`headline.ilike.*${termo}*,title.ilike.*${termo}*`);

  const { data } = await q;
  const linhas = (data ?? []) as CriativoLinha[];
  if (!linhas.length) return [];

  const [assets, produtos, angulos, boards, cenas, pins, links] = await Promise.all([
    porIds<Pick<AssetRow, "id" | "public_url" | "width" | "height">>(
      linhas.map((c) => c.current_asset_id ?? ""),
      (lote) => supabase.from("ml_creative_assets").select("id, public_url, width, height").in("id", lote),
    ),
    porIds<Pick<ProdutoRow, "id" | "title" | "thumbnail" | "pictures">>(
      linhas.map((c) => c.product_id),
      (lote) => supabase.from("ml_products").select("id, title, thumbnail, pictures").in("id", lote),
    ),
    porIds<{ id: string; type: string }>(
      linhas.map((c) => c.angle_id ?? ""),
      (lote) => supabase.from("ml_creative_angles").select("id, type").in("id", lote),
    ),
    porIds<Pick<BoardRow, "id" | "name">>(
      linhas.map((c) => c.board_id ?? ""),
      (lote) => supabase.from("ml_pinterest_boards").select("id, name").in("id", lote),
    ),
    porIds<{ id: string; name: string }>(
      linhas.map((c) => c.scene_preset_id ?? ""),
      (lote) => supabase.from("ml_scene_presets").select("id, name").in("id", lote),
    ),
    porIds<{ id: string; creative_id: string; status: string }>(
      linhas.map((c) => c.id),
      (lote) => supabase.from("ml_pins").select("id, creative_id, status").in("creative_id", lote).limit(1000),
    ),
    porIds<{ product_id: string; affiliate_url: string }>(
      linhas.map((c) => c.product_id),
      (lote) => supabase.from("ml_affiliate_links").select("product_id, affiliate_url").in("product_id", lote).eq("active", true),
    ),
  ]);
  const mLink = new Map(links.map((l) => [l.product_id, l.affiliate_url]));

  // Métricas: soma das linhas diárias dos Pins publicados (limitado — é só um resumo no card).
  const publicados = pins.filter((p) => p.status === "published");
  const metricas = publicados.length
    ? await porIds<{ pin_id: string; impressions: number; saves: number; pin_clicks: number; outbound_clicks: number }>(
        publicados.map((p) => p.id),
        (lote) =>
          supabase
            .from("ml_pin_metrics")
            .select("pin_id, impressions, saves, pin_clicks, outbound_clicks")
            .in("pin_id", lote)
            .order("date", { ascending: false })
            .limit(1000),
      )
    : [];
  const criativoDoPin = new Map(pins.map((p) => [p.id, p.creative_id]));
  const mMetricas = new Map<string, MetricasView>();
  for (const m of metricas) {
    const cid = criativoDoPin.get(m.pin_id);
    if (!cid) continue;
    const atual = mMetricas.get(cid) ?? { impressoes: 0, saves: 0, cliques: 0, outbound: 0 };
    atual.impressoes += Number(m.impressions) || 0;
    atual.saves += Number(m.saves) || 0;
    atual.cliques += Number(m.pin_clicks) || 0;
    atual.outbound += Number(m.outbound_clicks) || 0;
    mMetricas.set(cid, atual);
  }
  const pinsPorCriativo = new Map<string, number>();
  for (const p of pins) pinsPorCriativo.set(p.creative_id, (pinsPorCriativo.get(p.creative_id) ?? 0) + 1);
  const mCena = new Map(cenas.map((c) => [c.id, c.name]));

  const mAsset = new Map(assets.map((a) => [a.id, a]));
  const mProd = new Map(produtos.map((p) => [p.id, p]));
  const mAng = new Map(angulos.map((a) => [a.id, a.type]));
  const mBoard = new Map(boards.map((b) => [b.id, b.name]));

  return linhas.map((c) => {
    const p = mProd.get(c.product_id);
    const a = c.current_asset_id ? mAsset.get(c.current_asset_id) : undefined;
    const notas = (c.quality_notes as { heuristica?: unknown } | null)?.heuristica;
    return {
      id: c.id,
      product_id: c.product_id,
      status: c.status,
      image_mode: c.image_mode,
      format: c.format,
      headline: c.headline,
      title: c.title,
      description: c.description,
      alt_text: c.alt_text,
      cta: c.cta,
      keywords: c.keywords ?? [],
      board_id: c.board_id,
      quality_score: c.quality_score != null ? Number(c.quality_score) : null,
      quality_notes: Array.isArray(notas) ? notas.filter((n): n is string => typeof n === "string") : [],
      rejection_reason: c.rejection_reason,
      last_error: c.last_error,
      image_prompt: c.image_prompt,
      reference_image_url: c.reference_image_url,
      created_at: c.created_at,
      updated_at: c.updated_at,
      asset: a ? { id: a.id, public_url: a.public_url, width: a.width, height: a.height } : null,
      produto: p ? { id: p.id, title: p.title, thumbnail: fotoPrincipal(p), link: mLink.get(p.id) ?? null } : null,
      angulo: c.angle_id ? mAng.get(c.angle_id) ?? null : null,
      board: c.board_id ? mBoard.get(c.board_id) ?? null : null,
      family_id: c.family_id,
      visual_type: c.visual_type,
      scene_preset_id: c.scene_preset_id,
      cena: c.scene_preset_id ? mCena.get(c.scene_preset_id) ?? null : null,
      fidelity_mode: c.fidelity_mode,
      fidelity_status: c.fidelity_status,
      fidelity_score: c.fidelity_score != null ? Number(c.fidelity_score) : null,
      fidelity_ia: lerFidelidadeIA(c.fidelity_notes),
      fidelity_humano: lerFidelidadeHumano(c.fidelity_notes),
      has_text_overlay: c.has_text_overlay,
      ai_modified: c.ai_modified,
      package_status: c.package_status,
      package_errors: lerErrosPacote(c.package_errors),
      board_section_id: c.board_section_id,
      interests: c.interests ?? [],
      source_media_ids: c.source_media_ids ?? [],
      approved_at: c.approved_at,
      pins: pinsPorCriativo.get(c.id) ?? 0,
      metricas: mMetricas.get(c.id) ?? null,
    } satisfies CriativoView;
  });
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** `fidelity_notes.ia` (análise de fidelidade por IA — §5.2). */
export function lerFidelidadeIA(notas: unknown): FidelidadeIAView | null {
  const ia = obj(obj(notas)?.ia);
  if (!ia) return null;
  const itens: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(ia)) if (typeof v === "boolean") itens[k] = v;
  return {
    score: typeof ia.score === "number" ? ia.score : null,
    resumo: typeof ia.resumo === "string" ? ia.resumo : null,
    problemas: textos(ia.problemas),
    itens,
  };
}

/** `fidelity_notes.humano` (checklist revisado por uma pessoa). */
export function lerFidelidadeHumano(notas: unknown): CriativoView["fidelity_humano"] {
  const h = obj(obj(notas)?.humano);
  if (!h) return null;
  const checklist: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj(h.checklist) ?? {})) if (typeof v === "boolean") checklist[k] = v;
  return { nota: typeof h.nota === "string" ? h.nota : null, em: typeof h.em === "string" ? h.em : null, checklist };
}

export function lerErrosPacote(v: unknown): ErroPacote[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => obj(e))
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e!.mensagem === "string")
    .map((e) => ({ campo: typeof e.campo === "string" ? e.campo : "", mensagem: e.mensagem as string }));
}

/** Primeira foto do produto (pictures[0].url) ou a miniatura. */
export function fotoPrincipal(p: { pictures?: unknown; thumbnail: string | null }): string | null {
  const fotos = Array.isArray(p.pictures) ? (p.pictures as { url?: unknown }[]) : [];
  const url = fotos[0]?.url;
  return typeof url === "string" && url ? url : p.thumbnail;
}

/** Boards disponíveis para seleção (ativos e ainda existentes no Pinterest). */
export async function carregarBoards(): Promise<BoardOpcao[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("ml_pinterest_boards")
    .select("id, name, is_default")
    .eq("active", true)
    .is("removed_at", null)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .limit(500);
  return (data ?? []) as BoardOpcao[];
}
