import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FlaskConical, Info, LineChart } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { Secao } from "@/components/ml/campos";
import { CohortCriativos, type GrupoCohort, type VariacaoCohort } from "@/components/ml/analytics/cohort";
import { ColetarMetricas } from "@/components/ml/analytics/coletar";
import { Coortes, type LinhaCoorte } from "@/components/ml/analytics/coortes";
import { Comissoes, type ComissaoView, type PinOpcao, type ProdutoOpcao } from "@/components/ml/analytics/comissoes";
import { FiltrosAnalytics } from "@/components/ml/analytics/filtros";
import {
  DIMENSOES_COORTE,
  FAIXAS_PRECO,
  FILTRO_DA_DIMENSAO,
  FILTROS_URL,
  JANELAS_COORTE,
  fmtData,
  normalizarBreakdown,
  normalizarResumo,
  rotuloAngulo,
  rotuloLinha,
  somarDias,
  valorFiltroDaLinha,
  type Dimensao,
  type DimensaoCoorte,
  type FiltroUrl,
  type LinhaBreakdown,
  type PontoSerie,
} from "@/components/ml/analytics/formato";
import { GraficoSerie } from "@/components/ml/analytics/grafico";
import { Kpis } from "@/components/ml/analytics/kpis";
import { TabelaRelatorio, type LinhaRelatorio } from "@/components/ml/analytics/relatorio";
import { hrefCom, type ParamsUrl } from "@/components/ml/publicacoes/tipos";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { TIPOS_ANGULO } from "@/lib/ml/conteudo/angulos";
import { MODOS_FIDELIDADE, TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { diaNoFuso } from "@/lib/ml/tempo";
import { createClient } from "@/lib/supabase/server";
import { porIds } from "./dados";

export const metadata: Metadata = { title: "Analytics" };

const BASE = "/ml/analytics";
const MIN_IMPRESSOES_HEADLINE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const diaValido = (d: string | undefined): d is string => Boolean(d && DIA.test(d) && !Number.isNaN(Date.parse(d)));

const VALIDADORES: Record<FiltroUrl, (v: string) => boolean> = {
  categoria: (v) => /^[A-Z]{3}\d+$/.test(v),
  produto: (v) => UUID.test(v),
  board: (v) => UUID.test(v),
  criativo: (v) => UUID.test(v),
  angulo: (v) => v === "sem_angulo" || TIPOS_ANGULO.some((a) => a.tipo === v),
  faixa: (v) => (FAIXAS_PRECO as readonly string[]).includes(v),
  ambiente: (v) => v === "production" || v === "sandbox",
  headline: (v) => v.length > 0 && v.length <= 120,
  familia: (v) => UUID.test(v),
  tipo: (v) => (TIPOS_VISUAIS as readonly string[]).includes(v),
  cena: (v) => /^[a-z0-9_-]{1,64}$/i.test(v),
  texto: (v) => v === "true" || v === "false",
  modo: (v) => (MODOS_FIDELIDADE as readonly string[]).includes(v),
};

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient();
  const [geral, role] = await Promise.all([lerConfig("geral"), getMlRole()]);
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");
  const podeRemover = temPapel(role, "admin");
  const hoje = diaNoFuso(new Date(), tz);

  // ---------------------------------------------------------------------------
  // Período (URL): ?periodo=7|30|90 ou ?de=&ate=
  // ---------------------------------------------------------------------------
  const deP = um(searchParams.de);
  const ateP = um(searchParams.ate);
  const periodoP = um(searchParams.periodo);
  const periodo = periodoP === "7" || periodoP === "90" ? periodoP : "30";
  const personalizado = diaValido(deP) && diaValido(ateP) && deP <= ateP;
  let de: string;
  let ate: string;
  if (personalizado) {
    ate = ateP;
    de = diasEntre(deP, ateP) > 366 ? somarDias(ateP, -366) : deP;
  } else {
    ate = hoje;
    de = somarDias(hoje, -(Number(periodo) - 1));
  }

  // ---------------------------------------------------------------------------
  // Filtros (URL) → p_filters
  // ---------------------------------------------------------------------------
  const filtrosUrl: Partial<Record<FiltroUrl, string>> = {};
  for (const k of Object.keys(FILTROS_URL) as FiltroUrl[]) {
    const v = um(searchParams[k]);
    if (v && VALIDADORES[k](v)) filtrosUrl[k] = v;
  }
  const pFilters: Record<string, string> = {};
  for (const [k, v] of Object.entries(filtrosUrl)) pFilters[FILTROS_URL[k as FiltroUrl]] = v;

  // Coortes (§11.9): janela e dimensão na URL
  const coorteP = um(searchParams.coorte);
  const coorteDias: string = coorteP && (JANELAS_COORTE as readonly string[]).includes(coorteP) ? coorteP : "7";
  const coortePorP = um(searchParams.coorte_por);
  const coortePor: DimensaoCoorte = DIMENSOES_COORTE.find((d) => d.value === coortePorP)?.value ?? "family";

  const params: ParamsUrl = {
    periodo: personalizado || periodo === "30" ? undefined : periodo,
    de: personalizado ? de : undefined,
    ate: personalizado ? ate : undefined,
    ...filtrosUrl,
    coorte: coorteDias === "7" ? undefined : coorteDias,
    coorte_por: coortePor === "family" ? undefined : coortePor,
  };

  // ---------------------------------------------------------------------------
  // Dados (agregações no banco)
  // ---------------------------------------------------------------------------
  let qComissoes = supabase
    .from("ml_commissions")
    .select("id, period_start, period_end, product_id, pin_id, external_ref, clicks, orders, gmv, commission, source, note")
    .lte("period_start", ate)
    .gte("period_end", de);
  if (filtrosUrl.produto) qComissoes = qComissoes.eq("product_id", filtrosUrl.produto);

  const [
    resumoRes,
    breakdownRes,
    integRes,
    publicadosRes,
    categoriasRes,
    boardsRes,
    produtoRes,
    criativoRes,
    comissoesRes,
    produtosFormRes,
    pinsFormRes,
    coorteRes,
    cenasRes,
    pinsFamiliaRes,
  ] = await Promise.all([
      supabase.rpc("ml_analytics_summary", { p_from: de, p_to: ate, p_filters: pFilters }),
      supabase.rpc("ml_analytics_breakdown", { p_from: de, p_to: ate, p_dimension: "all", p_filters: pFilters }),
      supabase.from("ml_integrations").select("status, config").eq("provider", "pinterest").maybeSingle(),
      supabase.from("ml_pins").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("ml_categories").select("id, name").eq("tracked", true).order("name").limit(300),
      supabase.from("ml_pinterest_boards").select("id, name").is("removed_at", null).order("name").limit(200),
      filtrosUrl.produto ? supabase.from("ml_products").select("id, title").eq("id", filtrosUrl.produto).maybeSingle() : Promise.resolve({ data: null }),
      filtrosUrl.criativo
        ? supabase.from("ml_creatives").select("id, headline").eq("id", filtrosUrl.criativo).maybeSingle()
        : Promise.resolve({ data: null }),
      qComissoes.order("period_end", { ascending: false }).limit(200),
      supabase.from("ml_products").select("id, title").in("status", ["published", "scheduled"]).order("title").limit(200),
      supabase.from("ml_pins").select("id, title, product_id, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(300),
      supabase.rpc("ml_analytics_cohort", { p_dias: Number(coorteDias), p_dimension: coortePor, p_filters: pFilters }),
      supabase.from("ml_scene_presets").select("key, name, active, sort").order("sort").order("name").limit(200),
      supabase.from("ml_pins").select("family_id, creative_id").eq("status", "published").order("published_at", { ascending: false }).limit(1000),
    ]);

  const resumo = normalizarResumo(resumoRes.data);
  const linhas = normalizarBreakdown(breakdownRes.data);
  const erroRpc = resumoRes.error?.message ?? breakdownRes.error?.message ?? null;
  const integ = integRes.data as { status: string; config: Record<string, unknown> | null } | null;
  const sandbox = integ?.config?.environment === "sandbox";
  const totalPublicados = publicadosRes.count ?? 0;

  const por = (d: Dimensao) => linhas.filter((l) => l.dimension === d);

  // Opções de filtro
  const categoriasMapa = new Map<string, string>();
  for (const c of (categoriasRes.data ?? []) as { id: string; name: string }[]) categoriasMapa.set(c.id, c.name);
  for (const l of por("category")) if (l.key !== "—") categoriasMapa.set(l.key, l.label);
  if (filtrosUrl.categoria && !categoriasMapa.has(filtrosUrl.categoria)) categoriasMapa.set(filtrosUrl.categoria, filtrosUrl.categoria);
  const categorias = Array.from(categoriasMapa, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const boards = ((boardsRes.data ?? []) as { id: string; name: string }[]).map((b) => ({ value: b.id, label: b.name }));
  const produtoSel = produtoRes.data as { id: string; title: string } | null;

  // V2: famílias com Pins publicados (pin.family_id ou creative.family_id) e presets de cena
  const pinsFamilia = (pinsFamiliaRes.data ?? []) as { family_id: string | null; creative_id: string }[];
  const criativosSemFamilia = await porIds<{ id: string; family_id: string | null }>(
    supabase,
    "ml_creatives",
    "id, family_id",
    pinsFamilia.filter((p) => !p.family_id).map((p) => p.creative_id),
  );
  const idsFamilia = new Set<string>();
  for (const p of pinsFamilia) {
    const f = p.family_id ?? criativosSemFamilia.get(p.creative_id)?.family_id;
    if (f) idsFamilia.add(f);
  }
  for (const l of por("family")) if (l.key !== "—") idsFamilia.add(l.key);
  if (filtrosUrl.familia) idsFamilia.add(filtrosUrl.familia);
  const familiasMapa = await porIds<{ id: string; name: string }>(supabase, "ml_creative_families", "id, name", Array.from(idsFamilia));
  const familias = Array.from(idsFamilia, (id) => ({ value: id, label: familiasMapa.get(id)?.name ?? "Família" })).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
  const cenasLista = (cenasRes.data ?? []) as { key: string; name: string; active: boolean }[];
  const cenas = cenasLista
    .filter((c) => c.active || c.key === filtrosUrl.cena)
    .map((c) => ({ value: c.key, label: c.active ? c.name : `${c.name} (inativa)` }));
  if (filtrosUrl.cena && !cenas.some((c) => c.value === filtrosUrl.cena)) cenas.push({ value: filtrosUrl.cena, label: filtrosUrl.cena });
  const criativoSel = criativoRes.data as { id: string; headline: string | null } | null;

  // Série diária completa (dias sem métrica = 0)
  const porData = new Map(resumo.serie.map((p) => [p.date.slice(0, 10), p]));
  const serie: PontoSerie[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) serie.push(porData.get(d) ?? { date: d, impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0 });
  const temMetricas = resumo.impressions + resumo.outbound_clicks + resumo.saves + resumo.pin_clicks > 0;

  // Linhas de relatório com link de filtro
  const paraRelatorio = (l: LinhaBreakdown, extra?: Partial<LinhaRelatorio>): LinhaRelatorio => {
    const p = FILTRO_DA_DIMENSAO[l.dimension];
    const valor = valorFiltroDaLinha(l.dimension, l.key);
    return {
      ...l,
      label: rotuloLinha(l.dimension, l.key, l.label),
      hrefFiltro: p && valor ? hrefCom(BASE, params, { [p]: valor }) : undefined,
      ativo: Boolean(p && valor && params[p] === valor),
      ...extra,
    };
  };
  const topProdutos = por("product").map((l) =>
    paraRelatorio(l, {
      extra: (
        <Link href={`/ml/produtos/${l.key}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir produto">
          <ExternalLink className="size-3.5" />
        </Link>
      ),
    }),
  );
  const topCategorias = por("category").map((l) => paraRelatorio(l));
  const topAngulos = por("angle").map((l) => paraRelatorio(l, { rotulo: rotuloAngulo(l.key) }));
  const porBoard = por("board").map((l) => paraRelatorio(l));
  const porFaixa = por("price_band").map((l) => paraRelatorio(l));
  const headlines = por("headline").filter((l) => l.key !== "—");
  const headlinesRanking = headlines
    .filter((l) => l.impressions >= MIN_IMPRESSOES_HEADLINE)
    .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0) || b.outbound_clicks - a.outbound_clicks)
    .map((l) => paraRelatorio(l));
  const headlinesFora = headlines.length - headlinesRanking.length;

  // V2 (§11.9): família, tipo visual, cena, texto, modo de criação, IA e Pins
  const porFamilia = por("family").map((l) =>
    paraRelatorio(l, {
      extra:
        l.key !== "—" ? (
          <Link href={`/ml/criativos?familia=${l.key}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir família">
            <ExternalLink className="size-3.5" />
          </Link>
        ) : undefined,
    }),
  );
  const porTipoVisual = por("visual_type").map((l) => paraRelatorio(l));
  const porCena = por("scene").map((l) => paraRelatorio(l));
  const porTexto = por("text").map((l) => paraRelatorio(l));
  const porModo = por("method").map((l) => paraRelatorio(l));
  const porIa = por("ai").map((l) => paraRelatorio(l));
  const topPins = por("pin")
    .slice(0, 50)
    .map((l) =>
      paraRelatorio(l, {
        extra: (
          <Link href={`/ml/publicacoes?pin=${l.key}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir Pin">
            <ExternalLink className="size-3.5" />
          </Link>
        ),
      }),
    );

  // Coortes
  const coorteLinhas: LinhaCoorte[] = normalizarBreakdown(coorteRes.data).map((l) => {
    const dim = l.dimension;
    const p = dim === "creative" ? "criativo" : FILTRO_DA_DIMENSAO[dim];
    const valor = valorFiltroDaLinha(dim, l.key);
    return {
      key: l.key,
      label: rotuloLinha(dim, l.key, l.label),
      pins: l.pins,
      impressions: l.impressions,
      saves: l.saves,
      pin_clicks: l.pin_clicks,
      outbound_clicks: l.outbound_clicks,
      ctr: l.ctr,
      hrefFiltro: p && valor ? hrefCom(BASE, params, { [p]: valor }) : undefined,
      ativo: Boolean(p && valor && params[p] === valor),
    };
  });

  // Cohort de criativos: variações agrupadas por produto
  const linhasCriativo = por("creative").slice(0, 120);
  const criativos = await porIds<{ id: string; product_id: string; headline: string | null; angle_id: string | null; current_asset_id: string | null }>(
    supabase,
    "ml_creatives",
    "id, product_id, headline, angle_id, current_asset_id",
    linhasCriativo.map((l) => l.key),
  );
  const listaCriativos = Array.from(criativos.values());
  const comissoesBrutas = (comissoesRes.data ?? []) as {
    id: string;
    period_start: string;
    period_end: string;
    product_id: string | null;
    pin_id: string | null;
    external_ref: string | null;
    clicks: number | null;
    orders: number | null;
    gmv: number | string | null;
    commission: number | string;
    source: string;
    note: string | null;
  }[];
  const [angulos, assets, produtosCohort, pinsComissao] = await Promise.all([
    porIds<{ id: string; type: string }>(supabase, "ml_creative_angles", "id, type", listaCriativos.map((c) => c.angle_id)),
    porIds<{ id: string; public_url: string }>(supabase, "ml_creative_assets", "id, public_url", listaCriativos.map((c) => c.current_asset_id)),
    porIds<{ id: string; title: string }>(supabase, "ml_products", "id, title", [
      ...listaCriativos.map((c) => c.product_id),
      ...comissoesBrutas.map((c) => c.product_id),
    ]),
    porIds<{ id: string; title: string | null }>(supabase, "ml_pins", "id, title", comissoesBrutas.map((c) => c.pin_id)),
  ]);

  const gruposMapa = new Map<string, GrupoCohort & { out: number }>();
  for (const l of linhasCriativo) {
    const c = criativos.get(l.key);
    if (!c) continue;
    const prod = produtosCohort.get(c.product_id);
    const g = gruposMapa.get(c.product_id) ?? {
      produto: { id: c.product_id, title: prod?.title ?? "Produto" },
      hrefFiltroProduto: hrefCom(BASE, params, { produto: c.product_id }),
      variacoes: [] as VariacaoCohort[],
      out: 0,
    };
    g.variacoes.push({
      ...l,
      headline: c.headline,
      angulo: c.angle_id ? (angulos.get(c.angle_id)?.type ?? null) : null,
      thumb: c.current_asset_id ? (assets.get(c.current_asset_id)?.public_url ?? null) : null,
      hrefFiltro: hrefCom(BASE, params, { criativo: l.key }),
    });
    g.out += l.outbound_clicks;
    gruposMapa.set(c.product_id, g);
  }
  const grupos: GrupoCohort[] = Array.from(gruposMapa.values())
    .sort((a, b) => Number(b.variacoes.length > 1) - Number(a.variacoes.length > 1) || b.out - a.out)
    .slice(0, 12)
    .map((g) => ({ produto: g.produto, hrefFiltroProduto: g.hrefFiltroProduto, variacoes: g.variacoes }));

  // Comissões
  const comissoes: ComissaoView[] = comissoesBrutas.map((c) => ({
    id: c.id,
    period_start: c.period_start,
    period_end: c.period_end,
    product: c.product_id ? { id: c.product_id, title: produtosCohort.get(c.product_id)?.title ?? "Produto" } : null,
    pin: c.pin_id ? { id: c.pin_id, title: pinsComissao.get(c.pin_id)?.title ?? null } : null,
    external_ref: c.external_ref,
    clicks: c.clicks,
    orders: c.orders,
    gmv: c.gmv == null ? null : Number(c.gmv),
    commission: Number(c.commission) || 0,
    source: c.source,
    note: c.note,
  }));
  const produtosForm = (produtosFormRes.data ?? []) as ProdutoOpcao[];
  const pinsForm = (pinsFormRes.data ?? []) as PinOpcao[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`O que gera clique e comissão? ${fmtData(de)} – ${fmtData(ate)} · fuso ${tz}.`}
        actions={podeOperar ? <ColetarMetricas /> : undefined}
      />

      {erroRpc && (
        <Aviso tom="erro" icon={Info} titulo="Não foi possível carregar as métricas">
          {erroRpc}
        </Aviso>
      )}
      {sandbox && (
        <Aviso tom="aviso" icon={FlaskConical} titulo="Pinterest em modo sandbox">
          A API do Pinterest não fornece analytics no sandbox (apps em Trial). Os Pins criados lá não terão métricas; a coleta roda só para Pins de
          produção. Troque o ambiente em{" "}
          <Link href="/ml/integracoes" className="underline">
            Integrações
          </Link>{" "}
          quando o acesso Standard for liberado.
        </Aviso>
      )}
      {totalPublicados === 0 ? (
        <Aviso tom="info" icon={LineChart} titulo="Ainda não há Pins publicados">
          As métricas aparecem depois das primeiras publicações e da coleta no Pinterest. Comissões podem ser lançadas abaixo a qualquer momento.{" "}
          <Link href="/ml/publicacoes" className="underline">
            Ver publicações
          </Link>
        </Aviso>
      ) : (
        !temMetricas &&
        !erroRpc && (
          <Aviso tom="info" icon={LineChart} titulo="Sem métricas neste período">
            {resumo.pins_publicados > 0 || Object.keys(pFilters).length === 0
              ? "O Pinterest leva até 48 h para consolidar números. Use “Coletar métricas agora” para buscar os dados mais recentes."
              : "Nenhum Pin publicado atende aos filtros neste período."}
          </Aviso>
        )
      )}

      <FiltrosAnalytics
        params={params}
        de={de}
        ate={ate}
        personalizado={personalizado}
        categorias={categorias}
        boards={boards}
        familias={familias}
        cenas={cenas}
        rotulos={{ produto: produtoSel?.title, criativo: criativoSel?.headline ?? undefined }}
      />

      <Kpis r={resumo} />

      <Secao titulo="Evolução diária" descricao="Impressões (área, eixo esquerdo) e outbound clicks (linha, eixo direito).">
        {temMetricas ? (
          <GraficoSerie serie={serie} />
        ) : (
          <p className="py-10 text-center text-body-sm text-muted-foreground">Sem métricas no período para desenhar o gráfico.</p>
        )}
      </Secao>

      <div className="grid gap-4 xl:grid-cols-2">
        <TabelaRelatorio
          titulo="Top produtos"
          descricao="Produtos que mais geraram outbound clicks e comissão."
          linhas={topProdutos}
          vazio="Nenhum produto com Pin publicado nos filtros."
        />
        <TabelaRelatorio titulo="Top categorias" descricao="Categoria do produto no Mercado Livre." linhas={topCategorias} />
        <TabelaRelatorio
          titulo="Top ângulos"
          descricao="Problema → solução, lista, inspiração, antes/depois…"
          linhas={topAngulos}
        />
        <TabelaRelatorio
          titulo="Top headlines"
          descricao={`Ranking por CTR de outbound — só headlines com ${MIN_IMPRESSOES_HEADLINE}+ impressões.`}
          linhas={headlinesRanking}
          vazio={
            headlines.length
              ? `Amostra pequena: nenhuma headline chegou a ${MIN_IMPRESSOES_HEADLINE} impressões no período.`
              : "Sem headlines com métricas no período."
          }
          nota={
            headlinesFora > 0 && headlinesRanking.length > 0
              ? `${headlinesFora} headline(s) com menos de ${MIN_IMPRESSOES_HEADLINE} impressões ficaram fora do ranking (amostra pequena).`
              : undefined
          }
        />
        <TabelaRelatorio titulo="Por board" descricao="Compare temas e intenção de cada board." linhas={porBoard} />
        <TabelaRelatorio titulo="Por faixa de preço" descricao="Qual ticket traz melhor retorno." linhas={porFaixa} />
      </div>

      <div className="space-y-1 pt-2">
        <h2 className="text-h4 font-semibold tracking-tight">Famílias e criativos</h2>
        <p className="text-body-sm text-muted-foreground">
          O que funciona dentro de cada família: tipo visual, cena, texto na imagem e modo de criação. Clique numa linha para filtrar a página.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TabelaRelatorio
          titulo="Por família"
          descricao="Cada família testa uma hipótese do mesmo produto."
          linhas={porFamilia}
          vazio="Sem Pins de famílias de criativos no período."
        />
        <TabelaRelatorio titulo="Por tipo visual" descricao="Lifestyle sem texto, com texto, editorial ou foto + layout." linhas={porTipoVisual} />
        <TabelaRelatorio titulo="Por cena" descricao="Preset de ambiente usado na variante." linhas={porCena} />
        <TabelaRelatorio titulo="Com × sem texto" descricao="Texto sobreposto na imagem versus imagem limpa." linhas={porTexto} />
        <TabelaRelatorio titulo="Por modo de criação" descricao="Composição exata, geração por referência ou foto original + layout." linhas={porModo} />
        <TabelaRelatorio titulo="IA × sem IA" descricao="Imagens geradas/modificadas por IA versus sem IA." linhas={porIa} />
        <TabelaRelatorio
          titulo="Top Pins"
          descricao="Pins individuais que mais geraram outbound clicks no período."
          linhas={topPins}
          vazio="Nenhum Pin com métricas no período."
          className="xl:col-span-2"
        />
      </div>

      <Secao
        titulo="Coortes"
        descricao="Compare grupos pelo desempenho nos primeiros 7, 14 ou 30 dias de vida de cada Pin — justo entre Pins publicados em datas diferentes."
      >
        <Coortes
          dias={coorteDias}
          dimensao={coortePor}
          linhas={coorteLinhas}
          erro={coorteRes.error?.message ?? null}
          hrefJanela={(d) => hrefCom(BASE, params, { coorte: d === "7" ? null : d })}
          hrefDimensao={(d) => hrefCom(BASE, params, { coorte_por: d === "family" ? null : d })}
        />
      </Secao>

      <Secao
        titulo="Cohort de criativos"
        descricao={`Variações do mesmo produto lado a lado. "Melhor" só aparece quando há ${MIN_IMPRESSOES_HEADLINE}+ impressões em ao menos duas variações.`}
      >
        <CohortCriativos grupos={grupos} />
      </Secao>

      <Secao
        titulo="Comissões"
        descricao="Lançamentos cujo período cruza o selecionado. O Mercado Livre não tem API de relatórios de afiliado — lance à mão ou importe o CSV."
      >
        <Comissoes linhas={comissoes} produtos={produtosForm} pins={pinsForm} podeOperar={podeOperar} podeRemover={podeRemover} de={de} ate={ate} />
      </Secao>

    </div>
  );
}

const TONS = {
  info: "border-tech/30 bg-tech/5 [&_svg]:text-tech",
  aviso: "border-warning/40 bg-warning/10 [&_svg]:text-warning",
  erro: "border-destructive/40 bg-destructive/10 [&_svg]:text-destructive",
} as const;

function Aviso({
  tom,
  icon: Icon,
  titulo,
  children,
}: {
  tom: keyof typeof TONS;
  icon: typeof Info;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${TONS[tom]}`} role={tom === "erro" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        <p className="text-body-sm font-semibold">{titulo}</p>
        <p className="text-body-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
