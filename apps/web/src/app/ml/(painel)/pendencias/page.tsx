import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  Images,
  Link2,
  Package,
  PackageX,
  PartyPopper,
  Settings2,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ml/status";
import { carregarCriativos, fotoPrincipal } from "@/components/ml/criativos/carregar";
import { RevisaoRapida } from "@/components/ml/criativos/revisao-rapida";
import { labelModo } from "@/components/ml/criativos/rotulos";
import { TIPO_VISUAL_LABEL } from "@/lib/ml/familias/plano";
import { FidelidadePendente, PacotesPendentes } from "@/components/ml/pendencias/criativos-v2-pendentes";
import { Excecoes, type Excecao } from "@/components/ml/pendencias/excecoes";
import { FocoGrupo } from "@/components/ml/pendencias/foco-grupo";
import { GrupoPendencia, type TipoGrupo } from "@/components/ml/pendencias/grupo";
import { PinsAprovacao, type PinPendente } from "@/components/ml/pendencias/pins-aprovacao";
import { PinsBloqueados, type PinBloqueado } from "@/components/ml/pendencias/pins-bloqueados";
import { ProdutosAprovacao, type ProdutoPendente } from "@/components/ml/pendencias/produtos-aprovacao";
import { ReferenciasPendentes, type ProdutoSemReferencia } from "@/components/ml/pendencias/referencias-pendentes";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Central de Pendências" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

interface ConfigPendente {
  chave: string;
  titulo: string;
  detalhe: string;
  href: string;
  acao: string;
}

const TIPOS_VALIDOS: TipoGrupo[] = [
  "bloqueios",
  "links",
  "referencias",
  "imagens",
  "fidelidade",
  "criativos",
  "pacote",
  "publicacoes",
  "produtos",
  "excecoes",
  "configuracoes",
];
const PROVEDORES: Record<string, string> = { mercadolivre: "Mercado Livre", pinterest: "Pinterest" };

/** Produtos que já deveriam ter referência do anúncio para virar família de criativos (V2 §12). */
const STATUS_PEDEM_REFERENCIA = ["approved", "waiting_affiliate_link", "ready_for_creative", "creative_draft", "ready_to_schedule"];

/** Fidelidade que pede olho humano: alerta/reprovada, ou pendente com a variante já em revisão. */
const FILTRO_FIDELIDADE = "fidelity_status.in.(warning,failed),and(fidelity_status.eq.pending,status.eq.review)";

/** Faixa de tempo estimado (segundos) por tipo de tarefa — spec §17. */
function estimativa(n: { produtos: number; links: number; imagens: number; criativos: number; pins: number; referencias: number; fidelidade: number; pacote: number }) {
  const min = n.produtos * 2 + n.links * 10 + n.imagens * 30 + n.criativos * 5 + n.pins * 3 + n.referencias * 10 + n.fidelidade * 10 + n.pacote * 15;
  const max = n.produtos * 5 + n.links * 30 + n.imagens * 90 + n.criativos * 15 + n.pins * 10 + n.referencias * 30 + n.fidelidade * 30 + n.pacote * 60;
  const fmt = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
  return min === 0 ? null : `${fmt(min)}–${fmt(max)}`;
}

export default async function PendenciasPage({ searchParams }: { searchParams: Params }) {
  const tipoParam = Array.isArray(searchParams.tipo) ? searchParams.tipo[0] : searchParams.tipo;
  const tipo = TIPOS_VALIDOS.includes(tipoParam as TipoGrupo) ? (tipoParam as TipoGrupo) : null;

  const supabase = createClient();
  const agoraData = new Date();
  const agora = agoraData.toISOString();
  // "Publicações próximas": até 48 h à frente — e as que falharam nas últimas 24 h.
  const janelaInicio = new Date(agoraData.getTime() - 24 * 3600_000).toISOString();
  const janelaFim = new Date(agoraData.getTime() + 48 * 3600_000).toISOString();

  const [
    geral,
    role,
    prodRes,
    linkRes,
    imgRes,
    revisaoCount,
    criativosRevisao,
    pinRes,
    taskRes,
    intRes,
    catRes,
    boardRes,
    bloqueadosRes,
    refProdRes,
    fidRes,
    pacoteRes,
  ] = await Promise.all([
    lerConfig("geral"),
    getMlRole(),
    supabase
      .from("ml_products")
      .select("id, title, thumbnail, pictures, score, score_confidence, current_price, score_id", { count: "exact" })
      .eq("status", "analyzed")
      .or("eligible.is.null,eligible.eq.true")
      .order("score", { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from("ml_products")
      .select("id, title, thumbnail, score, score_confidence", { count: "exact" })
      .eq("status", "waiting_affiliate_link")
      .order("score", { ascending: false, nullsFirst: false })
      .order("approved_at", { ascending: true })
      .limit(3),
    supabase
      .from("ml_creatives")
      .select("id, headline, title, product_id, image_mode, family_id, visual_type", { count: "exact" })
      .eq("status", "waiting_manual_image")
      .order("created_at", { ascending: true })
      .limit(4),
    supabase.from("ml_creatives").select("id", { count: "exact", head: true }).eq("status", "review"),
    carregarCriativos({ status: "review", limite: 8, maisAntigosPrimeiro: true }),
    supabase
      .from("ml_pins")
      .select("id, title, media_url, board_id, scheduled_at, created_at", { count: "exact" })
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("ml_tasks")
      .select("id, type, title, detail, entity_type, entity_id, payload, status, created_at, dedupe_key")
      .or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lt."${agora}")`)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("ml_integrations").select("provider, status, last_error").in("provider", ["mercadolivre", "pinterest"]),
    supabase.from("ml_categories").select("id, name, commission_pct").eq("tracked", true).limit(500),
    supabase.from("ml_pinterest_boards").select("id, name, is_default, active, removed_at").limit(500),
    supabase
      .from("ml_pins")
      .select("id, title, media_url, status, scheduled_at, last_error, board_id", { count: "exact" })
      .in("status", ["blocked", "failed"])
      .gte("scheduled_at", janelaInicio)
      .lte("scheduled_at", janelaFim)
      .order("scheduled_at", { ascending: true })
      .limit(10),
    supabase
      .from("ml_products")
      .select("id, title, thumbnail, pictures, status, media_count")
      .in("status", STATUS_PEDEM_REFERENCIA)
      .order("approved_at", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("ml_creatives")
      .select("id", { count: "exact" })
      .not("family_id", "is", null)
      .or(FILTRO_FIDELIDADE)
      .not("status", "in", "(archived,rejected)")
      .order("created_at", { ascending: true })
      .limit(6),
    supabase
      .from("ml_creatives")
      .select("id", { count: "exact" })
      .not("family_id", "is", null)
      .eq("status", "approved")
      .in("package_status", ["missing", "incomplete", "invalid"])
      .order("approved_at", { ascending: true })
      .limit(6),
  ]);

  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");

  // (a) Produtos aguardando aprovação + 1º ponto positivo do score atual
  const prodLinhas = (prodRes.data ?? []) as {
    id: string;
    title: string;
    thumbnail: string | null;
    pictures: unknown;
    score: number | null;
    score_confidence: number | null;
    current_price: number | null;
    score_id: string | null;
  }[];
  const scoreIds = prodLinhas.map((p) => p.score_id).filter((v): v is string => Boolean(v));
  const { data: scores } = scoreIds.length
    ? await supabase.from("ml_product_scores").select("id, positives").in("id", scoreIds)
    : { data: [] as { id: string; positives: unknown }[] };
  const positivoPorScore = new Map(
    ((scores ?? []) as { id: string; positives: unknown }[]).map((s) => {
      const lista = Array.isArray(s.positives) ? s.positives : [];
      const primeiro = lista.find((x): x is string => typeof x === "string") ?? null;
      return [s.id, primeiro];
    }),
  );
  const produtos: ProdutoPendente[] = prodLinhas.map((p) => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail ?? fotoPrincipal(p),
    score: p.score != null ? Number(p.score) : null,
    confianca: p.score_confidence != null ? Number(p.score_confidence) : null,
    preco: p.current_price != null ? Number(p.current_price) : null,
    positivo: p.score_id ? positivoPorScore.get(p.score_id) ?? null : null,
  }));
  const totalProdutos = prodRes.count ?? produtos.length;

  // (b) Links
  const proximosLinks = (linkRes.data ?? []) as { id: string; title: string; thumbnail: string | null; score: number | null; score_confidence: number | null }[];
  const totalLinks = linkRes.count ?? proximosLinks.length;

  // (c) Imagens manuais
  const imgLinhas = (imgRes.data ?? []) as {
    id: string;
    headline: string | null;
    title: string | null;
    product_id: string;
    image_mode: string;
    family_id: string | null;
    visual_type: string;
  }[];
  const totalImagens = imgRes.count ?? imgLinhas.length;
  const { data: imgProdutos } = imgLinhas.length
    ? await supabase.from("ml_products").select("id, title, thumbnail").in("id", [...new Set(imgLinhas.map((c) => c.product_id))])
    : { data: [] };
  const prodImg = new Map(((imgProdutos ?? []) as { id: string; title: string; thumbnail: string | null }[]).map((p) => [p.id, p]));

  // (d) Criativos em revisão
  const totalRevisao = revisaoCount.count ?? criativosRevisao.length;

  // (e) Publicações aguardando aprovação
  const boardsTodos = (boardRes.data ?? []) as { id: string; name: string; is_default: boolean; active: boolean; removed_at: string | null }[];
  const nomeBoard = new Map(boardsTodos.map((b) => [b.id, b.name]));
  const pins: PinPendente[] = ((pinRes.data ?? []) as { id: string; title: string | null; media_url: string | null; board_id: string | null; scheduled_at: string | null; created_at: string }[]).map(
    (p) => ({ ...p, board: p.board_id ? nomeBoard.get(p.board_id) ?? null : null }),
  );
  const totalPins = pinRes.count ?? pins.length;

  // (f) Exceções — "publicação bloqueada" vai para o grupo de bloqueios; "sem referência" é calculado ao vivo.
  const todasExcecoes: Excecao[] = ((taskRes.data ?? []) as {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: unknown;
    status: string;
    created_at: string;
    dedupe_key: string | null;
  }[])
    .filter((t) => !t.dedupe_key?.startsWith("sem_referencia:"))
    .map((t) => {
      const jobId = (t.payload as { job_id?: unknown } | null)?.job_id;
      return {
        id: t.id,
        type: t.type,
        title: t.title,
        detail: t.detail,
        entity_type: t.entity_type,
        entity_id: t.entity_id,
        job_id: typeof jobId === "string" ? jobId : null,
        status: t.status,
        created_at: t.created_at,
      };
    });
  const tarefasBloqueio = todasExcecoes.filter((e) => e.type === "publish_blocked");
  const excecoes = todasExcecoes.filter((e) => e.type !== "publish_blocked");

  // (1) Bloqueios que impedem publicações próximas
  const pinsBloqueados: PinBloqueado[] = ((bloqueadosRes.data ?? []) as {
    id: string;
    title: string | null;
    media_url: string | null;
    status: string;
    scheduled_at: string | null;
    last_error: string | null;
    board_id: string | null;
  }[]).map((p) => ({ ...p, board: p.board_id ? nomeBoard.get(p.board_id) ?? null : null }));
  // Pin com tarefa aberta aparece só uma vez (na tarefa, que tem o motivo completo).
  const pinsComTarefa = new Set(tarefasBloqueio.filter((t) => t.entity_type === "pin" && t.entity_id).map((t) => t.entity_id!));
  const pinsSoltos = pinsBloqueados.filter((p) => !pinsComTarefa.has(p.id));
  const totalPinsSoltos = Math.max(pinsSoltos.length, (bloqueadosRes.count ?? 0) - (pinsBloqueados.length - pinsSoltos.length));
  const totalBloqueios = tarefasBloqueio.length + totalPinsSoltos;

  // (3) Produtos sem referência principal do anúncio
  const refCandidatos = (refProdRes.data ?? []) as { id: string; title: string; thumbnail: string | null; pictures: unknown; status: string; media_count: number }[];
  const { data: comReferencia } = refCandidatos.length
    ? await supabase
        .from("ml_product_media")
        .select("product_id")
        .in("product_id", refCandidatos.map((p) => p.id))
        .eq("media_role", "primary_reference")
        .limit(1000)
    : { data: [] as { product_id: string }[] };
  const temReferencia = new Set(((comReferencia ?? []) as { product_id: string }[]).map((m) => m.product_id));
  const semReferencia = refCandidatos.filter((p) => !temReferencia.has(p.id));
  const totalReferencias = semReferencia.length;
  const produtosSemReferencia: ProdutoSemReferencia[] = semReferencia.slice(0, 6).map((p) => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail ?? fotoPrincipal(p),
    status: p.status,
    media_count: p.media_count ?? 0,
  }));

  // (5) Fidelidade e (7) pacote Pinterest — mesmos dados dos cards de Criativos.
  const fidIds = ((fidRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const pacoteIds = ((pacoteRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const [criativosFidelidade, criativosPacote] = await Promise.all([
    fidIds.length ? carregarCriativos({ ids: fidIds, limite: fidIds.length, maisAntigosPrimeiro: true }) : Promise.resolve([]),
    pacoteIds.length ? carregarCriativos({ ids: pacoteIds, limite: pacoteIds.length, maisAntigosPrimeiro: true }) : Promise.resolve([]),
  ]);
  const totalFidelidade = fidRes.count ?? criativosFidelidade.length;
  const totalPacote = pacoteRes.count ?? criativosPacote.length;

  // (g) Configurações incompletas (calculadas ao vivo)
  const configs: ConfigPendente[] = [];
  const integracoes = new Map(((intRes.data ?? []) as { provider: string; status: string; last_error: string | null }[]).map((i) => [i.provider, i]));
  for (const prov of ["mercadolivre", "pinterest"]) {
    const i = integracoes.get(prov);
    if (i && (i.status === "connected" || i.status === "expiring")) continue;
    const nome = PROVEDORES[prov] ?? prov;
    configs.push({
      chave: `int-${prov}`,
      titulo: !i || i.status === "disconnected" ? `${nome} não conectado` : `${nome} com problema na conexão`,
      detalhe:
        i?.last_error ??
        (prov === "mercadolivre" ? "Sem a conexão, a descoberta e a validação de produtos não rodam." : "Sem a conexão, nenhum Pin é publicado."),
      href: "/ml/integracoes",
      acao: "Conectar",
    });
  }
  const categorias = (catRes.data ?? []) as { id: string; name: string; commission_pct: number | null }[];
  if (!categorias.length) {
    configs.push({
      chave: "categorias",
      titulo: "Nenhuma categoria acompanhada",
      detalhe: "A descoberta só busca produtos nas categorias marcadas para acompanhar.",
      href: "/ml/configuracoes?secao=categorias",
      acao: "Escolher categorias",
    });
  } else {
    const semComissao = categorias.filter((c) => c.commission_pct == null);
    if (semComissao.length) {
      const nomes = semComissao.slice(0, 4).map((c) => c.name).join(", ");
      configs.push({
        chave: "comissao",
        titulo: `${semComissao.length} categoria(s) sem % de comissão`,
        detalhe: `A comissão entra no score — sem ela o fator fica neutro. ${nomes}${semComissao.length > 4 ? "…" : ""}`,
        href: "/ml/configuracoes?secao=categorias",
        acao: "Informar comissão",
      });
    }
  }
  const boardsAtivos = boardsTodos.filter((b) => b.active && !b.removed_at);
  if (!boardsAtivos.length) {
    configs.push({
      chave: "boards",
      titulo: "Nenhum board ativo no Pinterest",
      detalhe: "Os Pins precisam de um board de destino. Sincronize e ative pelo menos um.",
      href: "/ml/configuracoes?secao=publicacao",
      acao: "Configurar boards",
    });
  } else if (!boardsAtivos.some((b) => b.is_default)) {
    configs.push({
      chave: "board-padrao",
      titulo: "Sem board padrão",
      detalhe: "Criativos sem board mapeado pela categoria precisam de um board padrão.",
      href: "/ml/configuracoes?secao=publicacao",
      acao: "Definir padrão",
    });
  }

  // Ordem da spec V2 §12: bloqueios → links → referências → fidelidade → aprovação → exceções.
  const resumo: { tipo: TipoGrupo; label: string; n: number; icon: typeof Package }[] = [
    { tipo: "bloqueios", label: "Publicação bloqueada", n: totalBloqueios, icon: Ban },
    { tipo: "links", label: "Links de afiliado", n: totalLinks, icon: Link2 },
    { tipo: "referencias", label: "Referências", n: totalReferencias, icon: Images },
    { tipo: "imagens", label: "Imagens manuais", n: totalImagens, icon: ImagePlus },
    { tipo: "fidelidade", label: "Fidelidade", n: totalFidelidade, icon: ShieldAlert },
    { tipo: "criativos", label: "Revisar criativos", n: totalRevisao, icon: Sparkles },
    { tipo: "pacote", label: "Pacote Pinterest", n: totalPacote, icon: PackageX },
    { tipo: "publicacoes", label: "Aprovar Pins", n: totalPins, icon: CalendarClock },
    { tipo: "produtos", label: "Aprovar produtos", n: totalProdutos, icon: Package },
    { tipo: "excecoes", label: "Exceções", n: excecoes.length, icon: TriangleAlert },
    { tipo: "configuracoes", label: "Configuração", n: configs.length, icon: Settings2 },
  ];
  const total = resumo.reduce((a, r) => a + r.n, 0);
  const tempo = estimativa({
    produtos: totalProdutos,
    links: totalLinks,
    imagens: totalImagens,
    criativos: totalRevisao,
    pins: totalPins,
    referencias: totalReferencias,
    fidelidade: totalFidelidade,
    pacote: totalPacote,
  });
  const reconectar = excecoes.filter((e) => e.type === "integration_auth").length;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Central de Pendências" description="Tudo o que precisa de você, num só lugar." />
        <EmptyState
          icon={PartyPopper}
          title="Tudo em dia"
          description="Nenhum produto, link, referência, imagem, criativo ou publicação esperando por você. A automação segue trabalhando."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="tech">
                <Link href="/ml/descobertas">Ver descobertas</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/ml">Ir ao Dashboard</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FocoGrupo tipo={tipo} />
      <PageHeader
        title="Central de Pendências"
        description={`${total} item(ns) aguardando você${tempo ? ` · tempo estimado ${tempo}` : ""}. Comece pelo que destrava mais coisa.`}
      />

      {reconectar > 0 && (
        <Link
          href="?tipo=excecoes"
          scroll={false}
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-body-sm text-destructive hover:bg-destructive/10"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>{reconectar} integração(ões) precisam ser reconectadas.</strong> Sem elas a descoberta ou a publicação param.
          </span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}

      {/* Atalhos por tipo */}
      <nav aria-label="Tipos de pendência" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {resumo.map((r) => (
          <Link
            key={r.tipo}
            href={`?tipo=${r.tipo}`}
            scroll={false}
            className={cn(
              "flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors",
              r.n > 0 ? "border-border/70 bg-card shadow-card hover:border-tech/50" : "border-dashed border-border bg-transparent text-muted-foreground",
              r.n > 0 && r.tipo === "bloqueios" && "border-destructive/40",
              tipo === r.tipo && "border-tech",
            )}
          >
            <span className="flex items-center gap-1.5 text-caption">
              <r.icon className="size-3.5" aria-hidden /> {r.label}
            </span>
            <span className="flex items-center gap-1.5 text-h4 font-semibold tabular">
              {r.n > 0 ? r.n : <CheckCircle2 className="size-5 text-success" aria-label="Nada pendente" />}
            </span>
          </Link>
        ))}
      </nav>

      {/* (1) Bloqueios que impedem publicações próximas */}
      {totalBloqueios > 0 && (
        <GrupoPendencia
          tipo="bloqueios"
          icon={Ban}
          titulo="Publicações bloqueadas"
          contagem={totalBloqueios}
          tom="destructive"
          descricao="Pins das próximas 48 h que não vão sair sem você. Resolva primeiro."
          acoes={
            <Button asChild variant="ghost" size="sm">
              <Link href="/ml/publicacoes">
                Abrir Publicações <ArrowRight />
              </Link>
            </Button>
          }
        >
          <div className="space-y-3">
            {tarefasBloqueio.length > 0 && <Excecoes itens={tarefasBloqueio} tz={tz} podeOperar={podeOperar} />}
            {pinsSoltos.length > 0 && <PinsBloqueados pins={pinsSoltos} tz={tz} />}
          </div>
        </GrupoPendencia>
      )}

      {/* (2) Links */}
      {totalLinks > 0 && (
        <GrupoPendencia
          tipo="links"
          icon={Link2}
          titulo="Links de afiliado ausentes"
          contagem={totalLinks}
          tempo="10–30 s por produto"
          descricao="Produtos aprovados esperando o link oficial do programa de afiliados."
          tom="warning"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <ul className="flex-1 space-y-2">
              {proximosLinks.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-center text-caption text-muted-foreground tabular">{i + 1}</span>
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card">
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt={p.title} loading="lazy" className="absolute inset-0 size-full object-contain" />
                    ) : (
                      <Package className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <Link href={`/ml/pendencias/links?id=${p.id}`} className="line-clamp-1 flex-1 text-body-sm hover:underline">
                    {p.title}
                  </Link>
                  <ScoreBadge score={p.score != null ? Number(p.score) : null} confianca={p.score_confidence != null ? Number(p.score_confidence) : null} className="px-2 py-0" />
                </li>
              ))}
              {totalLinks > proximosLinks.length && <li className="pl-8 text-caption text-muted-foreground">+ {totalLinks - proximosLinks.length} na fila</li>}
            </ul>
            {podeOperar && (
              <Button asChild variant="tech" size="lg" className="w-full lg:w-auto">
                <Link href="/ml/pendencias/links">
                  Começar (Salvar e próximo) <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </GrupoPendencia>
      )}

      {/* (3) Referências do produto */}
      {totalReferencias > 0 && (
        <GrupoPendencia
          tipo="referencias"
          icon={Images}
          titulo="Selecionar referência do produto"
          contagem={totalReferencias}
          tempo="10–30 s por produto"
          descricao="Sem a foto de referência principal do anúncio, a família de criativos não é gerada."
          tom="warning"
        >
          <ReferenciasPendentes produtos={produtosSemReferencia} podeOperar={podeOperar} />
          {totalReferencias > produtosSemReferencia.length && (
            <p className="mt-3 text-caption text-muted-foreground">
              Mostrando {produtosSemReferencia.length} de {totalReferencias}{refCandidatos.length >= 200 ? "+" : ""}.{" "}
              <Link href="/ml/produtos" className="font-medium text-tech hover:underline">
                Ver produtos
              </Link>
            </p>
          )}
        </GrupoPendencia>
      )}

      {/* (4) Imagens manuais (ChatGPT) */}
      {totalImagens > 0 && (
        <GrupoPendencia
          tipo="imagens"
          icon={ImagePlus}
          titulo="Criativo manual aguardando ChatGPT"
          contagem={totalImagens}
          tempo="30–90 s por criativo"
          descricao="Prompt e referências prontos — gere no ChatGPT e envie."
          tom="warning"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <ul className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              {imgLinhas.map((c) => {
                const p = prodImg.get(c.product_id);
                return (
                  <li key={c.id}>
                    <Link href={`/ml/pendencias/imagens?id=${c.id}`} className="group block space-y-1.5">
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-card">
                        {p?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnail} alt={p.title} loading="lazy" className="absolute inset-0 size-full object-contain transition-transform group-hover:scale-105" />
                        ) : (
                          <ImagePlus className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                        )}
                      </div>
                      <p className="line-clamp-2 text-caption font-medium group-hover:underline">{c.headline ?? c.title ?? p?.title ?? "Criativo"}</p>
                      <p className="text-overline text-muted-foreground">
                        {c.family_id ? `${(TIPO_VISUAL_LABEL as Record<string, string>)[c.visual_type] ?? c.visual_type} · ` : ""}
                        {labelModo(c.image_mode)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Button asChild variant="tech" size="lg" className="w-full lg:w-auto">
              <Link href="/ml/pendencias/imagens">
                Abrir fila de imagens <ArrowRight />
              </Link>
            </Button>
          </div>
        </GrupoPendencia>
      )}

      {/* (5) Fidelidade */}
      {totalFidelidade > 0 && (
        <GrupoPendencia
          tipo="fidelidade"
          icon={ShieldAlert}
          titulo="Criativo com baixa fidelidade"
          contagem={totalFidelidade}
          tempo="10–30 s por criativo"
          descricao="Compare com a foto do anúncio: produto diferente do real não pode ser publicado."
          tom="warning"
        >
          <FidelidadePendente criativos={criativosFidelidade} podeOperar={podeOperar} />
          {totalFidelidade > criativosFidelidade.length && (
            <p className="mt-3 text-caption text-muted-foreground">
              Mostrando {criativosFidelidade.length} de {totalFidelidade}.{" "}
              <Link href="/ml/criativos?status=review" className="font-medium text-tech hover:underline">
                Ver em Criativos
              </Link>
            </p>
          )}
        </GrupoPendencia>
      )}

      {/* (6) Criativos em revisão */}
      {totalRevisao > 0 && (
        <GrupoPendencia
          tipo="criativos"
          icon={Sparkles}
          titulo="Criativos aguardando aprovação"
          contagem={totalRevisao}
          tempo="5–15 s por criativo"
          descricao="Compare lado a lado e aprove em lote."
          acoes={
            <Button asChild variant="ghost" size="sm">
              <Link href="/ml/criativos?status=review">
                Ver todos <ArrowRight />
              </Link>
            </Button>
          }
        >
          <RevisaoRapida criativos={criativosRevisao} podeOperar={podeOperar} colunas={4} />
          {totalRevisao > criativosRevisao.length && (
            <p className="mt-3 text-caption text-muted-foreground">
              Mostrando {criativosRevisao.length} de {totalRevisao}.{" "}
              <Link href="/ml/criativos?vista=revisao" className="font-medium text-tech hover:underline">
                Continuar na revisão rápida
              </Link>
            </p>
          )}
        </GrupoPendencia>
      )}

      {/* (7) Pacote Pinterest */}
      {totalPacote > 0 && (
        <GrupoPendencia
          tipo="pacote"
          icon={PackageX}
          titulo="Pacote Pinterest incompleto"
          contagem={totalPacote}
          tempo="15–60 s por criativo"
          descricao="Aprovados, mas faltando algo que o Pinterest exige (título, descrição, alt text, board ou link)."
          tom="warning"
        >
          <PacotesPendentes criativos={criativosPacote} podeOperar={podeOperar} />
          {totalPacote > criativosPacote.length && (
            <p className="mt-3 text-caption text-muted-foreground">
              Mostrando {criativosPacote.length} de {totalPacote}.{" "}
              <Link href="/ml/criativos?status=approved" className="font-medium text-tech hover:underline">
                Ver aprovados
              </Link>
            </p>
          )}
        </GrupoPendencia>
      )}

      {/* Publicações aguardando aprovação */}
      {totalPins > 0 && (
        <GrupoPendencia
          tipo="publicacoes"
          icon={CalendarClock}
          titulo="Publicações aguardando aprovação"
          contagem={totalPins}
          descricao="Pins prontos que só entram na fila depois do seu OK."
          acoes={
            <Button asChild variant="ghost" size="sm">
              <Link href="/ml/publicacoes">
                Abrir Publicações <ArrowRight />
              </Link>
            </Button>
          }
        >
          <PinsAprovacao pins={pins} tz={tz} podeOperar={podeOperar} />
        </GrupoPendencia>
      )}

      {/* Produtos */}
      {totalProdutos > 0 && (
        <GrupoPendencia
          tipo="produtos"
          icon={Package}
          titulo="Produtos aguardando aprovação"
          contagem={totalProdutos}
          tempo="2–5 s por produto"
          descricao="Maior score primeiro."
          acoes={
            <Button asChild variant="ghost" size="sm">
              <Link href="/ml/descobertas">
                Ver todos <ArrowRight />
              </Link>
            </Button>
          }
        >
          <ProdutosAprovacao produtos={produtos} podeOperar={podeOperar} />
          {totalProdutos > produtos.length && (
            <p className="mt-3 text-caption text-muted-foreground">
              Mostrando {produtos.length} de {totalProdutos}.{" "}
              <Link href="/ml/descobertas" className="font-medium text-tech hover:underline">
                Ver todos em Descobertas
              </Link>
            </p>
          )}
        </GrupoPendencia>
      )}

      {/* (8) Exceções e reconexão de integrações */}
      {excecoes.length > 0 && (
        <GrupoPendencia
          tipo="excecoes"
          icon={ShieldAlert}
          titulo="Exceções"
          contagem={excecoes.length}
          tom={reconectar > 0 ? "destructive" : "warning"}
          descricao="O que a automação não conseguiu resolver sozinha (inclui reconectar integração)."
        >
          <Excecoes itens={excecoes} tz={tz} podeOperar={podeOperar} />
        </GrupoPendencia>
      )}

      {/* Configurações incompletas */}
      {configs.length > 0 && (
        <GrupoPendencia
          tipo="configuracoes"
          icon={Settings2}
          titulo="Configurações incompletas"
          contagem={configs.length}
          tom="warning"
          descricao="Calculado agora — some sozinho quando você corrigir."
        >
          <ul className="space-y-2">
            {configs.map((c) => (
              <li key={c.chave} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3">
                <Wrench className="size-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-medium">{c.titulo}</p>
                  <p className="text-caption text-muted-foreground">{c.detalhe}</p>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={c.href}>
                    {c.acao} <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </GrupoPendencia>
      )}
    </div>
  );
}
