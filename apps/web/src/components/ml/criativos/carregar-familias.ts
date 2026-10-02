import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ehUuid, fotoPrincipal, porIds } from "./carregar";
import type { FamiliaOpcao, FamiliaView } from "./rotulos";

/**
 * Famílias de criativos (V2 §3, §11.5) para a vista "Por família". Mesma
 * estratégia de `carregar.ts`: consultas separadas por id, em lotes, com RLS.
 */

export interface FiltrosFamilias {
  produto?: string | null;
  familia?: string | null;
  q?: string | null;
  /** Status de variante: só famílias com ao menos uma variante nesse status. */
  status?: string | null;
  arquivadas?: boolean;
  limite?: number;
}

const COLUNAS = "id, name, hypothesis, objective, status, created_at, product_id, default_board_id";

interface FamiliaLinha {
  id: string;
  name: string;
  hypothesis: string | null;
  objective: string | null;
  status: string;
  created_at: string;
  product_id: string;
  default_board_id: string | null;
}

const termoBusca = (q: string) =>
  q
    .replace(/[%*,().\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

export async function carregarFamilias(f: FiltrosFamilias = {}): Promise<FamiliaView[]> {
  const supabase = createClient();
  const limite = f.limite ?? 40;

  let restringirA: string[] | null = null;
  if (f.status) {
    const { data } = await supabase
      .from("ml_creatives")
      .select("family_id")
      .eq("status", f.status)
      .not("family_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    restringirA = [...new Set(((data ?? []) as { family_id: string | null }[]).map((r) => r.family_id).filter(ehUuid))];
    if (!restringirA.length) return [];
  }

  let q = supabase.from("ml_creative_families").select(COLUNAS).order("created_at", { ascending: false }).limit(limite);
  if (f.familia && ehUuid(f.familia)) q = q.eq("id", f.familia);
  else if (f.arquivadas) q = q.eq("status", "archived");
  else q = q.neq("status", "archived");
  if (f.produto && ehUuid(f.produto)) q = q.eq("product_id", f.produto);
  // Mais recentes primeiro; limitado para não estourar a URL do PostgREST.
  if (restringirA) q = q.in("id", restringirA.slice(0, 150));
  const termo = f.q ? termoBusca(f.q) : "";
  if (termo) q = q.or(`name.ilike.*${termo}*,hypothesis.ilike.*${termo}*`);

  const { data } = await q;
  const linhas = (data ?? []) as FamiliaLinha[];
  if (!linhas.length) return [];

  const [produtos, referencias, boards, variantes] = await Promise.all([
    porIds<{ id: string; title: string; thumbnail: string | null; pictures: unknown }>(
      linhas.map((l) => l.product_id),
      (lote) => supabase.from("ml_products").select("id, title, thumbnail, pictures").in("id", lote),
    ),
    porIds<{ product_id: string; public_url: string | null }>(
      linhas.map((l) => l.product_id),
      (lote) =>
        supabase
          .from("ml_product_media")
          .select("product_id, public_url")
          .in("product_id", lote)
          .eq("media_role", "primary_reference")
          .eq("status", "ready"),
    ),
    porIds<{ id: string; name: string }>(
      linhas.map((l) => l.default_board_id ?? ""),
      (lote) => supabase.from("ml_pinterest_boards").select("id, name").in("id", lote),
    ),
    porIds<{ family_id: string; status: string }>(
      linhas.map((l) => l.id),
      (lote) => supabase.from("ml_creatives").select("family_id, status").in("family_id", lote).neq("status", "archived").limit(1000),
    ),
  ]);

  const mProd = new Map(produtos.map((p) => [p.id, p]));
  const mRef = new Map(referencias.filter((r) => r.public_url).map((r) => [r.product_id, r.public_url!]));
  const mBoard = new Map(boards.map((b) => [b.id, b.name]));
  const totais = new Map<string, FamiliaView["totais"]>();
  for (const v of variantes) {
    const t = totais.get(v.family_id) ?? { variantes: 0, aprovadas: 0, publicadas: 0, revisao: 0 };
    t.variantes++;
    if (v.status === "approved") t.aprovadas++;
    if (v.status === "published") t.publicadas++;
    if (v.status === "review") t.revisao++;
    totais.set(v.family_id, t);
  }

  return linhas.map((l) => {
    const p = mProd.get(l.product_id);
    return {
      id: l.id,
      name: l.name,
      hypothesis: l.hypothesis,
      objective: l.objective,
      status: l.status,
      created_at: l.created_at,
      product_id: l.product_id,
      produto: p ? { id: p.id, title: p.title, thumbnail: fotoPrincipal(p) } : null,
      referencia: mRef.get(l.product_id) ?? null,
      default_board_id: l.default_board_id,
      board: l.default_board_id ? mBoard.get(l.default_board_id) ?? null : null,
      totais: totais.get(l.id) ?? { variantes: 0, aprovadas: 0, publicadas: 0, revisao: 0 },
    } satisfies FamiliaView;
  });
}

/** Opções do filtro "Família" (as mais recentes + a selecionada). */
export async function carregarOpcoesFamilia(selecionada: string | null): Promise<FamiliaOpcao[]> {
  const supabase = createClient();
  const { data } = await supabase.from("ml_creative_families").select("id, name").neq("status", "archived").order("created_at", { ascending: false }).limit(100);
  const lista = (data ?? []) as FamiliaOpcao[];
  if (selecionada && ehUuid(selecionada) && !lista.some((f) => f.id === selecionada)) {
    const { data: uma } = await supabase.from("ml_creative_families").select("id, name").eq("id", selecionada).maybeSingle();
    if (uma) lista.unshift(uma as FamiliaOpcao);
  }
  return lista;
}
