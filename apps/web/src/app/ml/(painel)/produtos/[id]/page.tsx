import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Star,
  TrendingUp,
  Truck,
  XCircle,
} from "lucide-react";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { PRODUCT_STATUS_LABEL } from "@/lib/ml/estados";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import type { AnaliseIA, ProdutoRow } from "@/lib/ml/tipos";
import { createClient } from "@/lib/supabase/server";
import { Secao } from "@/components/ml/campos";
import { StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RankDelta } from "@/components/ml/descobertas/card-descoberta";
import { AcoesProduto } from "@/components/ml/produtos/acoes-produto";
import { Angulos, type AnguloItem } from "@/components/ml/produtos/angulos";
import { Galeria } from "@/components/ml/produtos/galeria";
import { GraficoPreco, GraficoRanking, type PontoSerie } from "@/components/ml/produtos/graficos-historico";
import { LinkAfiliado, type LinkAntigo, type LinkAtivo } from "@/components/ml/produtos/link-afiliado";
import { ScoreDetalhe, type ScoreLinha } from "@/components/ml/produtos/score-detalhe";
import {
  ATOR_LABEL,
  brl,
  caminhoCategoria,
  CONDICAO_LABEL,
  lerImagens,
  MODO_IMAGEM_LABEL,
  MOTIVO_LABEL,
  n,
  nota,
  numero,
  ORIGEM_LABEL,
  textos,
} from "@/components/ml/produtos/formato";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  if (!UUID.test(params.id)) return { title: "Produto" };
  const { data } = await createClient().from("ml_products").select("title").eq("id", params.id).maybeSingle();
  const t = (data as { title: string } | null)?.title;
  return { title: t ? t.slice(0, 60) : "Produto" };
}

interface Snapshot {
  captured_at: string;
  price: number | string | null;
  rank_position: number | null;
  rank_category_id: string | null;
  rating: number | string | null;
  reviews_count: number | null;
  sold_quantity: number | null;
  source: string;
}

interface Ranking {
  collected_on: string;
  position: number;
  category_id: string;
}

interface Link_ {
  id: string;
  affiliate_url: string;
  label: string | null;
  source: string;
  active: boolean;
  validated_at: string | null;
  validation: { tipo?: string | null; avisos?: unknown } | null;
  created_at: string;
  deactivated_at: string | null;
}

interface Criativo {
  id: string;
  headline: string | null;
  title: string | null;
  status: string;
  image_mode: string;
  current_asset_id: string | null;
  created_at: string;
}

interface Pin {
  id: string;
  title: string | null;
  status: string;
  board_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_url: string | null;
  environment: string | null;
  last_error: string | null;
  created_at: string;
}

interface Historico {
  id: number;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

interface Feedback {
  id: string;
  kind: string;
  reason: string | null;
  note: string | null;
  created_at: string;
}

interface Job {
  id: string;
  type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

const statusLabel = (s: string | null) => (s ? (PRODUCT_STATUS_LABEL as Record<string, string>)[s] ?? s : "—");
const FEEDBACK_LABEL: Record<string, string> = { reject: "Descarte", approve: "Aprovação", edit: "Edição" };
const INTENCAO_LABEL: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

export default async function ProdutoPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const id = params.id;
  const supabase = createClient();

  const [{ data: prodData }, role, geral] = await Promise.all([
    supabase.from("ml_products").select("*").eq("id", id).maybeSingle(),
    getMlRole(),
    lerConfig("geral"),
  ]);
  if (!prodData) notFound();
  const p = prodData as ProdutoRow;
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");
  const fmt = (d: string | null | undefined) => formatarNoFuso(d, tz, { dateStyle: "short", timeStyle: "short" });
  const fmtDia = (d: string | null | undefined) => formatarNoFuso(d, tz, { dateStyle: "short" });

  const [cat, snaps, ranks, scores, links, angulos, criativos, pins, hist, feedback, jobs, openai] = await Promise.all([
    p.category_id
      ? supabase.from("ml_categories").select("id, name, path").eq("id", p.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("ml_product_snapshots")
      .select("captured_at, price, rank_position, rank_category_id, rating, reviews_count, sold_quantity, source")
      .eq("product_id", id)
      .order("captured_at", { ascending: false })
      .limit(500),
    supabase
      .from("ml_product_rankings")
      .select("collected_on, position, category_id")
      .eq("product_id", id)
      .order("collected_on", { ascending: false })
      .limit(400),
    supabase
      .from("ml_product_scores")
      .select("id, score, confidence, eligible, components, positives, alerts, missing_data, hard_rule_failures, formula_version, model, prompt_version, reason, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("ml_affiliate_links")
      .select("id, affiliate_url, label, source, active, validated_at, validation, created_at, deactivated_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("ml_creative_angles")
      .select("id, type, hook, audience, keyword, rationale, score, status, source, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("ml_creatives")
      .select("id, headline, title, status, image_mode, current_asset_id, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("ml_pins")
      .select("id, title, status, board_id, scheduled_at, published_at, external_url, environment, last_error, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("ml_status_history")
      .select("id, from_status, to_status, reason, actor_type, created_at")
      .eq("entity_type", "product")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ml_feedback")
      .select("id, kind, reason, note, created_at")
      .eq("entity_type", "product")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("ml_jobs")
      .select("id, type, status, attempts, last_error, created_at, finished_at")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("ml_integrations").select("status").eq("provider", "openai").maybeSingle(),
  ]);

  const listaCriativos = (criativos.data ?? []) as Criativo[];
  const listaPins = (pins.data ?? []) as Pin[];
  const assetIds = listaCriativos.map((c) => c.current_asset_id).filter((x): x is string => !!x);
  const boardIds = Array.from(new Set(listaPins.map((x) => x.board_id).filter((x): x is string => !!x)));
  const listaRanks = (ranks.data ?? []) as Ranking[];
  const catsRanking = Array.from(new Set(listaRanks.map((r) => r.category_id)));
  const [assets, boards, catsRank] = await Promise.all([
    assetIds.length
      ? supabase.from("ml_creative_assets").select("id, public_url").in("id", assetIds)
      : Promise.resolve({ data: [] }),
    boardIds.length ? supabase.from("ml_pinterest_boards").select("id, name").in("id", boardIds) : Promise.resolve({ data: [] }),
    catsRanking.length ? supabase.from("ml_categories").select("id, name").in("id", catsRanking) : Promise.resolve({ data: [] }),
  ]);
  const urlAsset = new Map(((assets.data ?? []) as { id: string; public_url: string }[]).map((a) => [a.id, a.public_url]));
  const nomeBoard = new Map(((boards.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const nomeCatRank = new Map(((catsRank.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  // ---- dados derivados ----
  const categoria = cat.data as { id: string; name: string; path: unknown } | null;
  const caminho = categoria ? caminhoCategoria(categoria.path) : [];
  const imagens = lerImagens(p.pictures, p.thumbnail);
  const seller = p.seller && typeof p.seller === "object" && !Array.isArray(p.seller) ? (p.seller as { id?: unknown }) : null;
  const analise = p.ai_analysis && typeof p.ai_analysis === "object" && !Array.isArray(p.ai_analysis) ? (p.ai_analysis as unknown as AnaliseIA) : null;
  const openaiConectada = (openai.data as { status: string } | null)?.status === "connected";

  const snapshots = ((snaps.data ?? []) as Snapshot[]).slice().reverse(); // cronológico
  const serieP: PontoSerie[] = snapshots
    .filter((s) => n(s.price) != null)
    .map((s) => ({ t: Date.parse(s.captured_at), v: n(s.price) as number }));

  // Ranking: lista diária da categoria principal (ou a com mais coletas); senão, snapshots.
  const contagemCat = new Map<string, number>();
  for (const r of listaRanks) contagemCat.set(r.category_id, (contagemCat.get(r.category_id) ?? 0) + 1);
  const catRanking =
    p.category_id && contagemCat.has(p.category_id)
      ? p.category_id
      : Array.from(contagemCat.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let serieR: PontoSerie[] = listaRanks
    .filter((r) => r.category_id === catRanking)
    .map((r) => ({ t: Date.parse(`${r.collected_on}T12:00:00Z`), v: r.position }))
    .sort((a, b) => a.t - b.t);
  if (!serieR.length) {
    serieR = snapshots.filter((s) => s.rank_position != null).map((s) => ({ t: Date.parse(s.captured_at), v: s.rank_position as number }));
  }

  // Avaliações: só as coletas em que algo mudou
  const mudancas: Snapshot[] = [];
  for (const s of snapshots) {
    const ant = mudancas[mudancas.length - 1];
    if (s.rating == null && s.reviews_count == null && s.sold_quantity == null) continue;
    if (!ant || n(ant.rating) !== n(s.rating) || ant.reviews_count !== s.reviews_count || ant.sold_quantity !== s.sold_quantity) mudancas.push(s);
  }
  const avaliacoes = mudancas.slice(-10).reverse();

  const listaScores = (scores.data ?? []) as ScoreLinha[];
  const scoreAtual = listaScores.find((s) => s.id === p.score_id) ?? listaScores[0] ?? null;

  const listaLinks = (links.data ?? []) as Link_[];
  const la = listaLinks.find((l) => l.active);
  const linkAtivo: LinkAtivo | null = la
    ? {
        url: la.affiliate_url,
        label: la.label,
        validadoEm: la.validated_at ? fmt(la.validated_at) : null,
        criadoEm: fmt(la.created_at),
        tipo: typeof la.validation?.tipo === "string" ? la.validation.tipo : null,
        avisos: textos(la.validation?.avisos),
        fonte: la.source,
      }
    : null;
  const linksAntigos: LinkAntigo[] = listaLinks
    .filter((l) => !l.active)
    .map((l) => ({ id: l.id, url: l.affiliate_url, label: l.label, criadoEm: fmt(l.created_at), desativadoEm: l.deactivated_at ? fmt(l.deactivated_at) : null }));

  const listaAngulos: AnguloItem[] = ((angulos.data ?? []) as (AnguloItem & { score: number | string | null })[]).map((a) => ({
    ...a,
    score: n(a.score),
  }));

  const listaHist = (hist.data ?? []) as Historico[];
  const listaFeedback = (feedback.data ?? []) as Feedback[];
  const listaJobs = (jobs.data ?? []) as Job[];

  const temDesconto = n(p.discount_pct) != null && (n(p.discount_pct) ?? 0) > 0 && p.original_price != null;

  const secoes = [
    ["visao", "Visão geral"],
    ["score", "Score"],
    ["historico", "Histórico"],
    ["link", "Link"],
    ["conteudo", "Conteúdo"],
    ["pins", "Pins"],
    ["decisoes", "Decisões e jobs"],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href="/ml/produtos" className="inline-flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Produtos
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tipo="product" status={p.status} />
            {p.status_reason && <span className="text-caption text-muted-foreground">{p.status_reason}</span>}
            <span className="text-caption text-muted-foreground">· desde {fmt(p.status_changed_at)}</span>
          </div>
          <h1 className="text-h2 font-semibold leading-tight tracking-tight">{p.title}</h1>
          <p className="text-body-sm text-muted-foreground">
            {p.brand && <span className="font-medium text-foreground">{p.brand} · </span>}
            {caminho.length ? caminho.join(" › ") : (categoria?.name ?? p.category_id ?? "Sem categoria")}
          </p>
        </div>
        <AcoesProduto id={p.id} status={p.status} permalink={p.permalink} podeOperar={podeOperar} />
      </div>

      <nav aria-label="Seções do produto" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex w-max gap-1 text-body-sm">
          {secoes.map(([ancora, label]) => (
            <li key={ancora}>
              <a href={`#${ancora}`} className="block rounded-full px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------------- Visão geral ---------------- */}
      <section id="visao" className="grid scroll-mt-20 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Galeria imagens={imagens} titulo={p.title} />
        </div>
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-h2 font-semibold tabular">{brl(p.current_price)}</span>
              {temDesconto && (
                <>
                  <span className="text-body-sm text-muted-foreground line-through tabular">{brl(p.original_price)}</span>
                  <Badge variant="success">−{Math.round(n(p.discount_pct) ?? 0)}%</Badge>
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 fill-current text-warning" aria-hidden />
                <span className="font-medium tabular">{nota(p.rating)}</span>
                <span className="text-muted-foreground tabular">({numero(p.reviews_count)} avaliações)</span>
              </span>
              {p.sold_quantity != null && <span className="text-muted-foreground tabular">{numero(p.sold_quantity)} vendidos</span>}
              {p.free_shipping === true && (
                <span className="inline-flex items-center gap-1 text-success">
                  <Truck className="size-4" aria-hidden /> Frete grátis
                </span>
              )}
              {p.available === true && (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-4" aria-hidden /> Disponível
                </span>
              )}
              {p.available === false && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <XCircle className="size-4" aria-hidden /> Indisponível
                  {p.availability_reason ? ` — ${p.availability_reason}` : ""}
                </span>
              )}
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-card p-5 text-body-sm shadow-card sm:grid-cols-2">
            <Dado rotulo="Código">
              <span className="font-mono text-caption">{p.external_id}</span>{" "}
              <span className="text-caption text-muted-foreground">
                ({p.external_type === "product" ? "produto de catálogo" : p.external_type === "user_product" ? "user product" : "anúncio"})
              </span>
              {p.item_id && p.item_id !== p.external_id && <span className="block text-caption text-muted-foreground">Anúncio: {p.item_id}</span>}
            </Dado>
            <Dado rotulo="Condição">{p.condition ? (CONDICAO_LABEL[p.condition] ?? p.condition) : "—"}</Dado>
            <Dado rotulo="Frete grátis">{p.free_shipping == null ? "—" : p.free_shipping ? "Sim" : "Não"}</Dado>
            <Dado rotulo="Vendedor">{seller?.id != null ? String(seller.id) : "—"}</Dado>
            <Dado rotulo="Origem">
              <span className="flex flex-wrap gap-1">
                {p.sources.length
                  ? p.sources.map((s) => (
                      <Badge key={s} variant="outline" className="px-2 py-0">
                        {ORIGEM_LABEL[s] ?? s}
                      </Badge>
                    ))
                  : "—"}
              </span>
            </Dado>
            <Dado rotulo="Promoção">
              {p.times_promoted > 0 ? `${p.times_promoted}x · último em ${fmtDia(p.last_promoted_at)}` : "Nunca promovido"}
            </Dado>
            <Dado rotulo="Descoberto em">{fmt(p.first_seen_at)}</Dado>
            <Dado rotulo="Visto por último">
              {fmt(p.last_seen_at)} <span className="text-muted-foreground">· {p.times_seen}x no total</span>
            </Dado>
            <Dado rotulo="Última checagem">{fmt(p.last_checked_at)}</Dado>
            <Dado rotulo="Enriquecido em">{fmt(p.enriched_at)}</Dado>
            {p.status === "rejected" && (
              <Dado rotulo="Descarte" className="sm:col-span-2">
                {p.rejection_reason ? (MOTIVO_LABEL[p.rejection_reason] ?? p.rejection_reason) : "—"}
                {p.rejection_note ? ` — ${p.rejection_note}` : ""}
                {p.cooldown_until && <span className="block text-caption text-muted-foreground">Cooldown até {fmtDia(p.cooldown_until)}</span>}
              </Dado>
            )}
          </dl>

          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-body font-semibold">
              <TrendingUp className="size-4 text-tech" aria-hidden /> Ranking e tendência
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Metrica rotulo="Posição atual" valor={p.current_rank != null ? `#${p.current_rank}` : "—"} extra={<RankDelta delta={p.rank_delta} />} />
              <Metrica rotulo="Melhor posição" valor={p.best_rank != null ? `#${p.best_rank}` : "—"} />
              <Metrica rotulo="Anterior" valor={p.previous_rank != null ? `#${p.previous_rank}` : "—"} />
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-caption text-muted-foreground">Termos em tendência associados</p>
              {p.trend_keywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {p.trend_keywords.map((k) => (
                    <Badge key={k} variant="tech" className="px-2.5 py-0.5">
                      <TrendingUp className="size-3" aria-hidden /> {k}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-muted-foreground">Nenhuma tendência da semana casou com este produto.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Score + IA ---------------- */}
      <div id="score" className="scroll-mt-20">
        <Secao titulo="Score" descricao="Total, decomposição por fator, motivos e alertas.">
          <ScoreDetalhe atual={scoreAtual} historico={listaScores} formatar={(d) => fmt(d)} />
        </Secao>
      </div>

      <Secao titulo="Análise de IA" descricao="Leitura qualitativa usada como sinal no score.">
        {analise ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metrica rotulo="Pinterest fit" valor={`${Math.round(Number(analise.pinterest_fit) || 0)}`} sufixo="/100" />
              <Metrica rotulo="Apelo visual" valor={`${Math.round(Number(analise.apelo_visual) || 0)}`} sufixo="/100" />
              <Metrica rotulo="Qualidade da imagem" valor={`${Math.round(Number(analise.qualidade_imagem) || 0)}`} sufixo="/100" />
              <Metrica rotulo="Intenção de compra" valor={INTENCAO_LABEL[analise.intencao_compra] ?? analise.intencao_compra ?? "—"} />
            </div>
            {analise.publico && (
              <p className="text-body-sm">
                <span className="text-muted-foreground">Público: </span>
                {analise.publico}
              </p>
            )}
            {analise.resumo && <p className="text-body-sm">{analise.resumo}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <ListaSimples titulo="Pontos fortes" itens={textos(analise.pontos_fortes)} tom="success" />
              <ListaSimples titulo="Riscos" itens={textos(analise.riscos)} tom="warning" />
            </div>
            <p className="text-caption text-muted-foreground">
              Modelo {analise.modelo ?? "—"} · analisado {fmt(analise.analisado_em ?? p.ai_analyzed_at)}
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Bot className="size-4" aria-hidden />
            {openaiConectada ? "Sem análise de IA ainda — use Reanalisar para gerar." : "Sem análise de IA (OpenAI não configurada)."}
          </p>
        )}
      </Secao>

      {/* ---------------- Histórico ---------------- */}
      <div id="historico" className="scroll-mt-20">
        <Secao titulo="Histórico" descricao="Preço, posição no ranking e avaliações ao longo do tempo.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-body-sm font-semibold">Preço</h3>
              <GraficoPreco dados={serieP} tz={tz} />
            </div>
            <div>
              <h3 className="mb-2 text-body-sm font-semibold">
                Posição no ranking
                {catRanking && <span className="font-normal text-muted-foreground"> · {nomeCatRank.get(catRanking) ?? catRanking}</span>}
              </h3>
              <GraficoRanking dados={serieR} tz={tz} />
            </div>
          </div>
          <div className="mt-6">
            <h3 className="mb-2 text-body-sm font-semibold">Avaliações e vendas</h3>
            {avaliacoes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-body-sm">
                  <thead className="text-left text-caption text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Coleta</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Nota</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Avaliações</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Vendidos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {avaliacoes.map((s) => (
                      <tr key={s.captured_at}>
                        <td className="py-1.5 pr-3 tabular">{fmt(s.captured_at)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{nota(s.rating)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{numero(s.reviews_count)}</td>
                        <td className="py-1.5 text-right tabular">{numero(s.sold_quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">Sem coletas de avaliação ainda.</p>
            )}
          </div>
        </Secao>
      </div>

      {/* ---------------- Link ---------------- */}
      <div id="link" className="scroll-mt-20">
        <Secao titulo="Link de afiliado" descricao="Obrigatório para publicar. Validado antes de salvar.">
          <LinkAfiliado productId={p.id} ativo={linkAtivo} historico={linksAntigos} podeOperar={podeOperar} />
        </Secao>
      </div>

      {/* ---------------- Conteúdo ---------------- */}
      <div id="conteudo" className="scroll-mt-20">
        <Secao titulo="Ângulos de conteúdo" descricao="Escolha os ângulos e gere criativos 2:3 para o Pinterest.">
          <Angulos productId={p.id} angulos={listaAngulos} openaiConectada={openaiConectada} podeOperar={podeOperar} />
        </Secao>
      </div>

      <Secao
        titulo="Criativos"
        descricao={listaCriativos.length ? `${listaCriativos.length} mais recente(s)` : undefined}
        acoes={
          <Button asChild size="sm" variant="ghost">
            <Link href={`/ml/criativos?produto=${p.id}`}>
              Ver em Criativos <ArrowRight />
            </Link>
          </Button>
        }
      >
        {listaCriativos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listaCriativos.map((c) => {
              const img = c.current_asset_id ? urlAsset.get(c.current_asset_id) : undefined;
              return (
                <li key={c.id}>
                  <Link href={`/ml/criativos?produto=${p.id}`} className="group block space-y-2">
                    <div className="aspect-[2/3] overflow-hidden rounded-lg border border-border/70 bg-secondary">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element -- imagem remota do Storage
                        <img src={img} alt={c.headline ?? c.title ?? "Criativo"} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                      ) : (
                        <span className="flex size-full flex-col items-center justify-center gap-1 text-caption text-muted-foreground">
                          <ImageOff className="size-5" aria-hidden /> Sem imagem
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-caption font-medium">{c.headline ?? c.title ?? "Sem headline"}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge tipo="creative" status={c.status} className="px-2 py-0" />
                      <span className="text-caption text-muted-foreground">{MODO_IMAGEM_LABEL[c.image_mode] ?? c.image_mode}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">Nenhum criativo ainda. Selecione ângulos acima e gere.</p>
        )}
      </Secao>

      {/* ---------------- Pins ---------------- */}
      <div id="pins" className="scroll-mt-20">
        <Secao
          titulo="Pins"
       
          acoes={
            <Button asChild size="sm" variant="ghost">
              <Link href={`/ml/publicacoes?produto=${p.id}`}>
                Ver em Publicações <ArrowRight />
              </Link>
            </Button>
          }
        >
          {listaPins.length ? (
            <ul className="divide-y divide-border/70">
              {listaPins.map((pin) => (
                <li key={pin.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tipo="pin" status={pin.status} />
                      {pin.environment === "sandbox" && <Badge variant="outline">sandbox</Badge>}
                      <span className="truncate text-body-sm">{pin.title ?? "Sem título"}</span>
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {pin.board_id ? `Board: ${nomeBoard.get(pin.board_id) ?? "—"}` : "Sem board"}
                      {pin.published_at
                        ? ` · publicado ${fmt(pin.published_at)}`
                        : pin.scheduled_at
                          ? ` · agendado para ${fmt(pin.scheduled_at)}`
                          : ` · criado ${fmt(pin.created_at)}`}
                    </p>
                    {pin.last_error && ["failed", "blocked"].includes(pin.status) && (
                      <p className="text-caption text-destructive">{pin.last_error}</p>
                    )}
                  </div>
                  {pin.external_url && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={pin.external_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Ver no Pinterest
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-muted-foreground">Nenhum Pin com este produto ainda.</p>
          )}
        </Secao>
      </div>

      {/* ---------------- Decisões e jobs ---------------- */}
      <div id="decisoes" className="scroll-mt-20">
        <Secao titulo="Decisões e jobs">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-body-sm font-semibold">Mudanças de status</h3>
              {listaHist.length ? (
                <ol className="space-y-2.5">
                  {listaHist.map((h) => (
                    <li key={h.id} className="border-l-2 border-border pl-3">
                      <p className="text-body-sm">
                        <span className="text-muted-foreground">{statusLabel(h.from_status)}</span>
                        <ArrowRight className="mx-1 inline size-3.5 text-muted-foreground" aria-label="para" />
                        <span className="font-medium">{statusLabel(h.to_status)}</span>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {fmt(h.created_at)} · {ATOR_LABEL[h.actor_type] ?? h.actor_type}
                        {h.reason ? ` · ${h.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-body-sm text-muted-foreground">Sem mudanças registradas.</p>
              )}

              {listaFeedback.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-body-sm font-semibold">Feedback</h3>
                  <ul className="space-y-2">
                    {listaFeedback.map((f) => (
                      <li key={f.id} className="text-body-sm">
                        <span className="font-medium">{FEEDBACK_LABEL[f.kind] ?? f.kind}</span>
                        {f.reason && <span> · {MOTIVO_LABEL[f.reason] ?? f.reason}</span>}
                        {f.note && <span className="text-muted-foreground"> — {f.note}</span>}
                        <span className="block text-caption text-muted-foreground">{fmt(f.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-body-sm font-semibold">Jobs recentes</h3>
              {listaJobs.length ? (
                <ul className="divide-y divide-border/70">
                  {listaJobs.map((j) => (
                    <li key={j.id}>
                      <Link href={`/ml/logs?job=${j.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-secondary/30">
                        <span className="min-w-0">
                          <span className="block text-body-sm font-medium">{labelJob(j.type)}</span>
                          <span className="block text-caption text-muted-foreground">
                            {fmt(j.created_at)}
                            {j.attempts > 1 ? ` · ${j.attempts} tentativas` : ""}
                          </span>
                          {j.last_error && j.status !== "succeeded" && (
                            <span className="line-clamp-2 block text-caption text-destructive">{j.last_error}</span>
                          )}
                        </span>
                        <StatusBadge tipo="job" status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-muted-foreground">
                  {podeOperar ? "Nenhum job para este produto." : "Jobs visíveis a partir do papel operador."}
                </p>
              )}
            </div>
          </div>
        </Secao>
      </div>
    </div>
  );
}

function Dado({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-caption text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Metrica({ rotulo, valor, sufixo, extra }: { rotulo: string; valor: string; sufixo?: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-center">
      <p className="text-caption text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1.5 text-h4 font-semibold tabular">
        {valor}
        {sufixo && <span className="text-caption font-normal text-muted-foreground">{sufixo}</span>}
        {extra && <span className="text-caption">{extra}</span>}
      </p>
    </div>
  );
}

function ListaSimples({ titulo, itens, tom }: { titulo: string; itens: string[]; tom: "success" | "warning" }) {
  return (
    <div>
      <h3 className="mb-1.5 text-body-sm font-semibold">{titulo}</h3>
      {itens.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-body-sm marker:text-muted-foreground">
          {itens.map((x, i) => (
            <li key={i} className={tom === "warning" ? "text-warning" : undefined}>
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">Nenhum.</p>
      )}
    </div>
  );
}
