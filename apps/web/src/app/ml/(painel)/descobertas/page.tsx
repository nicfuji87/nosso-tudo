import type { Metadata } from "next";
import Link from "next/link";
import { Compass, EyeOff, FolderTree, SearchX } from "lucide-react";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABEL } from "@/lib/ml/estados";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect } from "@/components/ml/campos";
import { BotaoAdicionarProduto, BotaoExecutarDescoberta } from "@/components/ml/descobertas/acoes-cabecalho";
import { ListaDescobertas } from "@/components/ml/descobertas/lista-descobertas";
import { TendenciasSemana, type TendenciaResumo } from "@/components/ml/descobertas/tendencias-semana";
import type { ItemDescoberta } from "@/components/ml/descobertas/tipos";
import { FormFiltros } from "@/components/ml/produtos/form-filtros";
import { Paginacao } from "@/components/ml/produtos/paginacao";
import { caminhoCategoria, decimal, inteiro, n, param, termoBusca, textos } from "@/components/ml/produtos/formato";

export const metadata: Metadata = { title: "Descobertas" };

const POR_PAGINA = 24;
const TRIAGEM = ["discovered", "enriching", "analyzed"];
const PERIODOS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };

const ORDENS = {
  score: { label: "Maior score", col: "score", asc: false },
  recentes: { label: "Mais recentes", col: "first_seen_at", asc: false },
  ranking: { label: "Melhor ranking", col: "current_rank", asc: true },
  preco: { label: "Menor preço", col: "current_price", asc: true },
  preco_desc: { label: "Maior preço", col: "current_price", asc: false },
  desconto: { label: "Maior desconto", col: "discount_pct", asc: false },
  avaliacoes: { label: "Mais avaliações", col: "reviews_count", asc: false },
} as const;
type Ordem = keyof typeof ORDENS;

const COLUNAS =
  "id, title, thumbnail, category_id, status, current_price, original_price, discount_pct, current_rank, rank_delta, trend_keywords, rating, reviews_count, sources, score, score_confidence, score_id, eligible, available, first_seen_at, times_seen, times_promoted, last_promoted_at, permalink";

interface LinhaProduto {
  id: string;
  title: string;
  thumbnail: string | null;
  category_id: string | null;
  status: string;
  current_price: number | string | null;
  original_price: number | string | null;
  discount_pct: number | string | null;
  current_rank: number | null;
  rank_delta: number | null;
  trend_keywords: string[] | null;
  rating: number | string | null;
  reviews_count: number | null;
  sources: string[] | null;
  score: number | string | null;
  score_confidence: number | string | null;
  score_id: string | null;
  eligible: boolean | null;
  available: boolean | null;
  first_seen_at: string;
  times_seen: number;
  times_promoted: number;
  last_promoted_at: string | null;
  permalink: string | null;
}

interface Filtros {
  q: string | null;
  categoria?: string;
  status?: string;
  origem?: string;
  promovido?: string;
  disponivel?: string;
  elegivel: "sim" | "nao" | "todos";
  scoreMin: number | null;
  scoreMax: number | null;
  precoMin: number | null;
  precoMax: number | null;
  periodo?: string;
}

type Cliente = ReturnType<typeof createClient>;

/** Monta a consulta com os filtros da URL (mesma base para a lista e as contagens). */
function consulta(supabase: Cliente, f: Filtros, opts: { colunas: string; head?: boolean; elegivel?: Filtros["elegivel"] }) {
  let q = supabase.from("ml_products").select(opts.colunas, { count: "exact", head: opts.head ?? false });
  if (f.status === "todos") {
    // sem filtro de status
  } else if (f.status && (PRODUCT_STATUSES as readonly string[]).includes(f.status)) {
    q = q.eq("status", f.status);
  } else {
    q = q.in("status", TRIAGEM);
  }
  const elegivel = opts.elegivel ?? f.elegivel;
  if (elegivel === "sim") q = q.not("eligible", "is", false);
  else if (elegivel === "nao") q = q.eq("eligible", false);
  if (f.q) q = q.ilike("title", `%${f.q}%`);
  if (f.categoria) q = q.eq("category_id", f.categoria);
  if (f.origem === "bestseller") q = q.contains("sources", ["bestseller"]);
  else if (f.origem === "trend") q = q.or("sources.cs.{trend},trend_keywords.neq.{}");
  else if (f.origem === "manual") q = q.overlaps("sources", ["manual", "search"]);
  if (f.promovido === "sim") q = q.gt("times_promoted", 0);
  else if (f.promovido === "nao") q = q.eq("times_promoted", 0);
  if (f.disponivel === "sim") q = q.eq("available", true);
  else if (f.disponivel === "nao") q = q.eq("available", false);
  if (f.scoreMin != null) q = q.gte("score", f.scoreMin);
  if (f.scoreMax != null) q = q.lte("score", f.scoreMax);
  if (f.precoMin != null) q = q.gte("current_price", f.precoMin);
  if (f.precoMax != null) q = q.lte("current_price", f.precoMax);
  const dias = f.periodo ? PERIODOS[f.periodo] : undefined;
  if (dias) q = q.gte("first_seen_at", new Date(Date.now() - dias * 86_400_000).toISOString());
  return q;
}

export default async function DescobertasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const [role, geral] = await Promise.all([getMlRole(), lerConfig("geral")]);
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");

  const elegivelParam = param(searchParams, "elegivel");
  const f: Filtros = {
    q: termoBusca(param(searchParams, "q")),
    categoria: param(searchParams, "categoria"),
    status: param(searchParams, "status"),
    origem: param(searchParams, "origem"),
    promovido: param(searchParams, "promovido"),
    disponivel: param(searchParams, "disponivel"),
    elegivel: elegivelParam === "nao" || elegivelParam === "todos" ? elegivelParam : "sim",
    scoreMin: decimal(param(searchParams, "score_min")),
    scoreMax: decimal(param(searchParams, "score_max")),
    precoMin: decimal(param(searchParams, "preco_min")),
    precoMax: decimal(param(searchParams, "preco_max")),
    periodo: param(searchParams, "periodo"),
  };
  const ordemParam = param(searchParams, "ordem");
  const ordem: Ordem = ordemParam && ordemParam in ORDENS ? (ordemParam as Ordem) : "score";
  const pagina = inteiro(param(searchParams, "pagina"), 1);
  const o = ORDENS[ordem];

  const paramsAtuais: Record<string, string | undefined> = {};
  for (const k of Object.keys(searchParams)) paramsAtuais[k] = param(searchParams, k);
  const filtrosAtivos = Object.entries(paramsAtuais).some(([k, v]) => v && !["ordem", "pagina"].includes(k));

  const [lista, ocultos, cats, semanaRes] = await Promise.all([
    consulta(supabase, f, { colunas: COLUNAS })
      .order(o.col, { ascending: o.asc, nullsFirst: false })
      .order("id", { ascending: true })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    f.elegivel === "sim"
      ? consulta(supabase, f, { colunas: "id", head: true, elegivel: "nao" })
      : Promise.resolve({ count: 0 }),
    supabase.from("ml_categories").select("id, name, path").eq("tracked", true).order("name").limit(500),
    supabase.from("ml_trends").select("week_start").order("week_start", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const linhas = (lista.data ?? []) as unknown as LinhaProduto[];
  const total = lista.count ?? 0;
  const foraDoIntervalo = !!lista.error && pagina > 1;
  const qtdOcultos = ocultos.count ?? 0;

  // Scores atuais (motivos/alertas), nomes das categorias da página e tendências da semana
  const scoreIds = linhas.map((l) => l.score_id).filter((x): x is string => !!x);
  const categoriasTracked = (cats.data ?? []) as { id: string; name: string; path: unknown }[];
  const faltandoCat = Array.from(
    new Set(linhas.map((l) => l.category_id).filter((c): c is string => !!c && !categoriasTracked.some((t) => t.id === c))),
  );
  const semana = (semanaRes.data as { week_start: string } | null)?.week_start ?? null;
  const [scores, catsExtras, trends] = await Promise.all([
    scoreIds.length
      ? supabase.from("ml_product_scores").select("id, positives, alerts, hard_rule_failures").in("id", scoreIds)
      : Promise.resolve({ data: [] }),
    faltandoCat.length
      ? supabase.from("ml_categories").select("id, name, path").in("id", faltandoCat)
      : Promise.resolve({ data: [] }),
    semana
      ? supabase
          .from("ml_trends")
          .select("id, keyword, url, trend_type, position")
          .eq("week_start", semana)
          .order("position", { ascending: true, nullsFirst: false })
          .limit(60)
      : Promise.resolve({ data: [] }),
  ]);

  const nomeCategoria = new Map<string, string>();
  for (const c of [...categoriasTracked, ...((catsExtras.data ?? []) as { id: string; name: string; path: unknown }[])]) {
    nomeCategoria.set(c.id, c.name);
  }
  const scorePorId = new Map(
    ((scores.data ?? []) as { id: string; positives: unknown; alerts: unknown; hard_rule_failures: string[] | null }[]).map((s) => [s.id, s]),
  );

  const vistos = new Set<string>();
  const tendencias: TendenciaResumo[] = [];
  for (const t of (trends.data ?? []) as TendenciaResumo[]) {
    const k = t.keyword.trim().toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    tendencias.push(t);
    if (tendencias.length >= 12) break;
  }

  const fmtData = (d: string | null) => formatarNoFuso(d, tz, { dateStyle: "short", timeStyle: "short" });
  const itens: ItemDescoberta[] = linhas.map((l) => {
    const s = l.score_id ? scorePorId.get(l.score_id) : undefined;
    const repeticao = [
      l.times_promoted > 0
        ? `Promovido ${l.times_promoted}x${l.last_promoted_at ? `, último em ${formatarNoFuso(l.last_promoted_at, tz, { dateStyle: "short" })}` : ""}`
        : "Nunca promovido",
      l.times_seen > 1 ? `visto ${l.times_seen} vezes` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: l.id,
      titulo: l.title,
      thumb: l.thumbnail,
      categoria: l.category_id ? (nomeCategoria.get(l.category_id) ?? l.category_id) : null,
      status: l.status,
      preco: n(l.current_price),
      precoOriginal: n(l.original_price),
      desconto: n(l.discount_pct),
      rank: l.current_rank,
      rankDelta: l.rank_delta,
      tendencias: l.trend_keywords ?? [],
      rating: n(l.rating),
      reviews: l.reviews_count,
      origens: l.sources ?? [],
      score: n(l.score),
      confianca: n(l.score_confidence),
      elegivel: l.eligible,
      disponivel: l.available,
      descobertoEm: `em ${fmtData(l.first_seen_at)}`,
      repeticao,
      vezesVisto: l.times_seen,
      porque: textos(s?.positives).slice(0, 3),
      alertas: textos(s?.alerts).slice(0, 2),
      regrasDuras: l.eligible === false ? (s?.hard_rule_failures ?? []) : [],
      permalink: l.permalink,
    };
  });

  const qsOcultos = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsAtuais)) if (v && k !== "pagina" && k !== "elegivel") qsOcultos.set(k, v);
  qsOcultos.set("elegivel", "nao");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Descobertas"
        description="Produtos encontrados nos mais vendidos e nas tendências, prontos para triagem."
        actions={
          podeOperar ? (
            <div className="flex flex-wrap items-start gap-2">
              <BotaoAdicionarProduto />
              <BotaoExecutarDescoberta />
            </div>
          ) : undefined
        }
      />

      <TendenciasSemana itens={tendencias} semana={semana} tz={tz} />

      <FormFiltros key={JSON.stringify(paramsAtuais)} limparHref="/ml/descobertas">
        <Campo label="Buscar" className="col-span-2">
          <Input name="q" defaultValue={f.q ?? ""} placeholder="Título do produto" className="h-10" />
        </Campo>
        <Campo label="Categoria" className="col-span-2 sm:col-span-1">
          <NativeSelect name="categoria" defaultValue={f.categoria ?? ""} className="w-full">
            <option value="">Todas</option>
            {categoriasTracked.map((c) => {
              const caminho = caminhoCategoria(c.path);
              return (
                <option key={c.id} value={c.id}>
                  {caminho.length > 1 ? caminho.slice(-2).join(" › ") : c.name}
                </option>
              );
            })}
          </NativeSelect>
        </Campo>
        <Campo label="Status">
          <NativeSelect name="status" defaultValue={f.status ?? ""} className="w-full">
            <option value="">Em triagem</option>
            {TRIAGEM.map((s) => (
              <option key={s} value={s}>
                {PRODUCT_STATUS_LABEL[s as keyof typeof PRODUCT_STATUS_LABEL]}
              </option>
            ))}
            <option value="todos">Todos os status</option>
          </NativeSelect>
        </Campo>
        <Campo label="Origem">
          <NativeSelect name="origem" defaultValue={f.origem ?? ""} className="w-full">
            <option value="">Todas</option>
            <option value="bestseller">Mais vendidos</option>
            <option value="trend">Tendência</option>
            <option value="manual">Busca / manual</option>
          </NativeSelect>
        </Campo>
        <Campo label="Descoberto">
          <NativeSelect name="periodo" defaultValue={f.periodo ?? ""} className="w-full">
            <option value="">Qualquer data</option>
            <option value="24h">Últimas 24 h</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </NativeSelect>
        </Campo>
        <Campo label="Score">
          <div className="flex items-center gap-1.5">
            <Input name="score_min" type="number" min={0} max={100} defaultValue={f.scoreMin ?? ""} placeholder="mín" className="h-10 px-3" aria-label="Score mínimo" />
            <Input name="score_max" type="number" min={0} max={100} defaultValue={f.scoreMax ?? ""} placeholder="máx" className="h-10 px-3" aria-label="Score máximo" />
          </div>
        </Campo>
        <Campo label="Preço (R$)">
          <div className="flex items-center gap-1.5">
            <Input name="preco_min" type="number" min={0} step="0.01" defaultValue={f.precoMin ?? ""} placeholder="mín" className="h-10 px-3" aria-label="Preço mínimo" />
            <Input name="preco_max" type="number" min={0} step="0.01" defaultValue={f.precoMax ?? ""} placeholder="máx" className="h-10 px-3" aria-label="Preço máximo" />
          </div>
        </Campo>
        <Campo label="Promoção">
          <NativeSelect name="promovido" defaultValue={f.promovido ?? ""} className="w-full">
            <option value="">Todos</option>
            <option value="nao">Nunca promovido</option>
            <option value="sim">Já promovido</option>
          </NativeSelect>
        </Campo>
        <Campo label="Disponibilidade">
          <NativeSelect name="disponivel" defaultValue={f.disponivel ?? ""} className="w-full">
            <option value="">Todos</option>
            <option value="sim">Disponível</option>
            <option value="nao">Indisponível</option>
          </NativeSelect>
        </Campo>
        <Campo label="Elegibilidade">
          <NativeSelect name="elegivel" defaultValue={f.elegivel === "sim" ? "" : f.elegivel} className="w-full">
            <option value="">Só elegíveis</option>
            <option value="nao">Só inelegíveis</option>
            <option value="todos">Todos</option>
          </NativeSelect>
        </Campo>
        <Campo label="Ordenar por">
          <NativeSelect name="ordem" defaultValue={ordem === "score" ? "" : ordem} className="w-full">
            {(Object.keys(ORDENS) as Ordem[]).map((k) => (
              <option key={k} value={k === "score" ? "" : k}>
                {ORDENS[k].label}
              </option>
            ))}
          </NativeSelect>
        </Campo>
      </FormFiltros>

      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-muted-foreground">
        <p className="tabular">
          {total.toLocaleString("pt-BR")} produto{total === 1 ? "" : "s"}
          {f.elegivel === "nao" ? " inelegíveis" : ""}
        </p>
        {qtdOcultos > 0 && (
          <Link
            href={`/ml/descobertas?${qsOcultos.toString()}`}
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
          >
            <EyeOff className="size-4" aria-hidden />
            {qtdOcultos} oculto{qtdOcultos === 1 ? "" : "s"} por inelegibilidade — ver
          </Link>
        )}
      </div>

      {lista.error && !foraDoIntervalo ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar as descobertas" description={lista.error.message} />
      ) : itens.length === 0 ? (
        foraDoIntervalo || filtrosAtivos ? (
          <EmptyState
            icon={SearchX}
            title={foraDoIntervalo ? "Página fora do intervalo" : "Nenhum produto com esses filtros"}
            description="Ajuste ou limpe os filtros para ver mais produtos."
            action={
              <Button asChild variant="secondary">
                <Link href="/ml/descobertas">Limpar filtros</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Compass}
            title="Nada para triar agora"
            description="Escolha as categorias que quer acompanhar e rode uma descoberta — os produtos aparecem aqui com score e motivos."
            action={
              <div className="flex flex-wrap items-start justify-center gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/ml/configuracoes?secao=categorias">
                    <FolderTree /> Escolher categorias
                  </Link>
                </Button>
                {podeOperar && <BotaoExecutarDescoberta />}
              </div>
            }
          />
        )
      ) : (
        <ListaDescobertas itens={itens} podeOperar={podeOperar} />
      )}

      <Paginacao base="/ml/descobertas" params={paramsAtuais} pagina={pagina} total={total} porPagina={POR_PAGINA} />
    </div>
  );
}
