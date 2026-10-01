import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AssetRow, BoardRow, CriativoRow, ProdutoRow } from "@/lib/ml/tipos";
import type { BoardOpcao, CriativoView } from "./rotulos";

/**
 * Leitura de criativos para as telas (cliente do usuário ⇒ RLS). Faz as
 * junções (asset atual, produto, ângulo, board) em consultas separadas por id,
 * em lotes, para não depender de embed ambíguo nem estourar a URL.
 */

const COLUNAS =
  "id, product_id, angle_id, status, image_mode, format, headline, title, description, alt_text, cta, keywords, board_id, quality_score, quality_notes, rejection_reason, last_error, image_prompt, reference_image_url, current_asset_id, created_at, updated_at";

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
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

async function porIds<T>(ids: string[], buscar: (lote: string[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
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
  if (f.status) q = q.eq("status", f.status);
  else if (!f.ids) q = q.neq("status", "archived");
  if (f.produto && ehUuid(f.produto)) q = q.eq("product_id", f.produto);
  if (f.modo) q = q.eq("image_mode", f.modo);
  const termo = f.q ? termoBusca(f.q) : "";
  if (termo) q = q.or(`headline.ilike.*${termo}*,title.ilike.*${termo}*`);

  const { data } = await q;
  const linhas = (data ?? []) as CriativoLinha[];
  if (!linhas.length) return [];

  const [assets, produtos, angulos, boards] = await Promise.all([
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
  ]);

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
      produto: p ? { id: p.id, title: p.title, thumbnail: fotoPrincipal(p) } : null,
      angulo: c.angle_id ? mAng.get(c.angle_id) ?? null : null,
      board: c.board_id ? mBoard.get(c.board_id) ?? null : null,
    } satisfies CriativoView;
  });
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
