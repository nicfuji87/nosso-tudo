import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { itensValidacao, PIN_COLUNAS, type CriativoResumo, type LinkResumo, type PinView } from "@/components/ml/publicacoes/tipos";
import { lerConfig } from "@/lib/ml/config";

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
  family_id: string | null;
  ai_modified: boolean | null;
  ai_disclosure_sent: boolean | null;
  affiliate_link_id: string | null;
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

const H = 3_600_000;
const D = 86_400_000;
/** Status que contam para repetição (espelha lib/ml/servicos/publicacao) e para o cooldown. */
const STATUS_REPETICAO = ["scheduled", "publishing", "published", "pending_approval"];
const STATUS_COOLDOWN = new Set(["scheduled", "publishing", "published"]);

interface PinVizinho {
  id: string;
  product_id: string;
  status: string;
  quando: number;
}

/**
 * Pins do mesmo produto relevantes para os indicadores V2 (§16): os que caem em ±7 dias de algum Pin da lista
 * (repetição) e os agendados/publicados recentes ou futuros (cooldown). Consulta em blocos de produtos.
 */
async function vizinhosPorProduto(supabase: Supa, linhas: LinhaPin[], cooldownHoras: number, agora: number): Promise<Map<string, PinVizinho[]>> {
  const porProduto = new Map<string, PinVizinho[]>();
  const produtos = Array.from(new Set(linhas.map((l) => l.product_id)));
  if (!produtos.length) return porProduto;
  const tempos = linhas.map((l) => l.published_at ?? l.scheduled_at).filter((t): t is string => Boolean(t)).map((t) => Date.parse(t));
  const de = Math.min(agora - cooldownHoras * H, ...tempos.map((t) => t - 7 * D));
  const ate = Math.max(agora + 7 * D, ...tempos.map((t) => t + 7 * D));
  const filtroData = orIntervalo(new Date(de).toISOString(), new Date(ate).toISOString());
  // Agendados além da janela também prolongam o cooldown do produto.
  const futuro = `scheduled_at.gte.${JSON.stringify(new Date(ate).toISOString())}`;
  const resultados = await Promise.all(
    blocos(produtos, 80).map((b) =>
      supabase
        .from("ml_pins")
        .select("id, product_id, status, published_at, scheduled_at")
        .in("product_id", b)
        .in("status", STATUS_REPETICAO)
        .or(`${filtroData},${futuro}`)
        .limit(1000),
    ),
  );
  for (const r of resultados) {
    for (const row of (r.data ?? []) as { id: string; product_id: string; status: string; published_at: string | null; scheduled_at: string | null }[]) {
      const t = row.published_at ?? row.scheduled_at;
      if (!t) continue;
      const lista = porProduto.get(row.product_id) ?? [];
      lista.push({ id: row.id, product_id: row.product_id, status: row.status, quando: Date.parse(t) });
      porProduto.set(row.product_id, lista);
    }
  }
  return porProduto;
}

/** "Nº Pin do produto na semana": posição do Pin entre os Pins do produto em ±7 dias (inclui ele mesmo). */
function repeticaoDoPin(l: LinhaPin, vizinhos: PinVizinho[]): PinView["repeticao"] {
  const t = l.published_at ?? l.scheduled_at;
  if (!t || l.status === "canceled") return null;
  const quando = Date.parse(t);
  const janela = vizinhos.filter((v) => v.id !== l.id && Math.abs(v.quando - quando) < 7 * D);
  if (!janela.length) return null;
  const antes = janela.filter((v) => v.quando < quando || (v.quando === quando && v.id < l.id)).length;
  return { ordem: antes + 1, total: janela.length + 1 };
}

/** Cooldown do produto: último Pin agendado/publicado + regra → horas que faltam (0 = livre). */
function cooldownDoProduto(vizinhos: PinVizinho[], regraHoras: number, agora: number): PinView["cooldown"] {
  if (regraHoras <= 0) return { regraHoras, faltamHoras: 0, liberaEm: null };
  const ultimos = vizinhos.filter((v) => STATUS_COOLDOWN.has(v.status)).map((v) => v.quando);
  if (!ultimos.length) return { regraHoras, faltamHoras: 0, liberaEm: null };
  const libera = Math.max(...ultimos) + regraHoras * H;
  return { regraHoras, faltamHoras: libera > agora ? Math.ceil((libera - agora) / H) : 0, liberaEm: new Date(libera).toISOString() };
}

/** Junta produto, board, criativo, família e link (consultas separadas, em blocos — evita URL gigante e ambiguidade de embed). */
export async function hidratarPins(supabase: Supa, dados: unknown): Promise<PinView[]> {
  const linhas = (dados ?? []) as LinhaPin[];
  if (!linhas.length) return [];
  const agora = Date.now();
  const cfg = await lerConfig("criativos_v2").catch(() => null);
  const cooldownHoras = cfg?.cooldown_variantes_horas ?? 0;
  const [produtos, boards, criativos, links, vizinhos] = await Promise.all([
    porIds<{ id: string; title: string; permalink: string | null }>(supabase, "ml_products", "id, title, permalink", linhas.map((l) => l.product_id)),
    porIds<{ id: string; name: string }>(supabase, "ml_pinterest_boards", "id, name", linhas.map((l) => l.board_id ?? "")),
    porIds<CriativoResumo>(
      supabase,
      "ml_creatives",
      "id, headline, visual_type, fidelity_mode, has_text_overlay, family_id",
      linhas.map((l) => l.creative_id),
    ),
    porIds<LinkResumo>(
      supabase,
      "ml_affiliate_links",
      "id, label, redirect_status, final_host, final_url, last_checked_at",
      linhas.map((l) => l.affiliate_link_id ?? ""),
    ),
    vizinhosPorProduto(supabase, linhas, cooldownHoras, agora),
  ]);
  const familiaDe = (l: LinhaPin) => l.family_id ?? criativos.get(l.creative_id)?.family_id ?? null;
  const familias = await porIds<{ id: string; name: string }>(supabase, "ml_creative_families", "id, name", linhas.map((l) => familiaDe(l) ?? ""));

  return linhas.map((l) => {
    const famId = familiaDe(l);
    const doProduto = vizinhos.get(l.product_id) ?? [];
    return {
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
      familia: famId ? (familias.get(famId) ?? { id: famId, name: "Família" }) : null,
      ai_modified: Boolean(l.ai_modified),
      ai_disclosure_sent: l.ai_disclosure_sent,
      link: l.affiliate_link_id ? (links.get(l.affiliate_link_id) ?? null) : null,
      repeticao: repeticaoDoPin(l, doProduto),
      cooldown: cfg ? cooldownDoProduto(doProduto, cooldownHoras, agora) : null,
    };
  });
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
