import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  Link2,
  Package,
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
import { Excecoes, type Excecao } from "@/components/ml/pendencias/excecoes";
import { FocoGrupo } from "@/components/ml/pendencias/foco-grupo";
import { GrupoPendencia, type TipoGrupo } from "@/components/ml/pendencias/grupo";
import { PinsAprovacao, type PinPendente } from "@/components/ml/pendencias/pins-aprovacao";
import { ProdutosAprovacao, type ProdutoPendente } from "@/components/ml/pendencias/produtos-aprovacao";
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

const TIPOS_VALIDOS: TipoGrupo[] = ["produtos", "links", "imagens", "criativos", "publicacoes", "excecoes", "configuracoes"];
const PROVEDORES: Record<string, string> = { mercadolivre: "Mercado Livre", pinterest: "Pinterest" };

/** Faixa de tempo estimado (segundos) por tipo de tarefa — spec §17. */
function estimativa(n: { produtos: number; links: number; imagens: number; criativos: number; pins: number }) {
  const min = n.produtos * 2 + n.links * 10 + n.imagens * 30 + n.criativos * 5 + n.pins * 3;
  const max = n.produtos * 5 + n.links * 30 + n.imagens * 90 + n.criativos * 15 + n.pins * 10;
  const fmt = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
  return min === 0 ? null : `${fmt(min)}–${fmt(max)}`;
}

export default async function PendenciasPage({ searchParams }: { searchParams: Params }) {
  const tipoParam = Array.isArray(searchParams.tipo) ? searchParams.tipo[0] : searchParams.tipo;
  const tipo = TIPOS_VALIDOS.includes(tipoParam as TipoGrupo) ? (tipoParam as TipoGrupo) : null;

  const supabase = createClient();
  const agora = new Date().toISOString();

  const [geral, role, prodRes, linkRes, imgRes, revisaoCount, criativosRevisao, pinRes, taskRes, intRes, catRes, boardRes] = await Promise.all([
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
      .select("id, headline, title, product_id, image_mode", { count: "exact" })
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
      .select("id, type, title, detail, entity_type, entity_id, payload, status, created_at")
      .or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lt."${agora}")`)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("ml_integrations").select("provider, status, last_error").in("provider", ["mercadolivre", "pinterest"]),
    supabase.from("ml_categories").select("id, name, commission_pct").eq("tracked", true).limit(500),
    supabase.from("ml_pinterest_boards").select("id, name, is_default, active, removed_at").limit(500),
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
  const imgLinhas = (imgRes.data ?? []) as { id: string; headline: string | null; title: string | null; product_id: string; image_mode: string }[];
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

  // (f) Exceções
  const excecoes: Excecao[] = ((taskRes.data ?? []) as {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: unknown;
    status: string;
    created_at: string;
  }[]).map((t) => {
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

  const resumo: { tipo: TipoGrupo; label: string; n: number; icon: typeof Package }[] = [
    { tipo: "produtos", label: "Aprovar produtos", n: totalProdutos, icon: Package },
    { tipo: "links", label: "Links de afiliado", n: totalLinks, icon: Link2 },
    { tipo: "imagens", label: "Imagens manuais", n: totalImagens, icon: ImagePlus },
    { tipo: "criativos", label: "Revisar criativos", n: totalRevisao, icon: Sparkles },
    { tipo: "publicacoes", label: "Aprovar Pins", n: totalPins, icon: CalendarClock },
    { tipo: "excecoes", label: "Exceções", n: excecoes.length, icon: ShieldAlert },
    { tipo: "configuracoes", label: "Configuração", n: configs.length, icon: Settings2 },
  ];
  const total = resumo.reduce((a, r) => a + r.n, 0);
  const tempo = estimativa({ produtos: totalProdutos, links: totalLinks, imagens: totalImagens, criativos: totalRevisao, pins: totalPins });
  const urgentes = excecoes.filter((e) => e.type === "integration_auth" || e.type === "publish_blocked").length;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Central de Pendências" description="Tudo o que precisa de você, num só lugar." />
        <EmptyState
          icon={PartyPopper}
          title="Tudo em dia"
          description="Nenhum produto, link, imagem, criativo ou publicação esperando por você. A automação segue trabalhando."
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

      {urgentes > 0 && (
        <Link
          href="?tipo=excecoes"
          scroll={false}
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-body-sm text-destructive hover:bg-destructive/10"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>{urgentes} exceção(ões) bloqueando publicações ou integrações.</strong> Resolva primeiro — elas travam o restante do fluxo.
          </span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}

      {/* Atalhos por tipo */}
      <nav aria-label="Tipos de pendência" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {resumo.map((r) => (
          <Link
            key={r.tipo}
            href={`?tipo=${r.tipo}`}
            scroll={false}
            className={cn(
              "flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors",
              r.n > 0 ? "border-border/70 bg-card shadow-card hover:border-tech/50" : "border-dashed border-border bg-transparent text-muted-foreground",
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

      {/* (f) Exceções urgentes vêm antes quando existem bloqueios */}
      {urgentes > 0 && excecoes.length > 0 && (
        <GrupoPendencia tipo="excecoes" icon={ShieldAlert} titulo="Exceções" contagem={excecoes.length} tom="destructive" descricao="O que a automação não conseguiu resolver sozinha.">
          <Excecoes itens={excecoes} tz={tz} podeOperar={podeOperar} />
        </GrupoPendencia>
      )}

      {/* (a) Produtos */}
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

      {/* (b) Links */}
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

      {/* (c) Imagens manuais */}
      {totalImagens > 0 && (
        <GrupoPendencia
          tipo="imagens"
          icon={ImagePlus}
          titulo="Imagens manuais"
          contagem={totalImagens}
          tempo="30–90 s por criativo"
          descricao="Prompt e imagem de referência prontos — gere no ChatGPT e envie."
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
                      <p className="text-overline text-muted-foreground">{labelModo(c.image_mode)}</p>
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

      {/* (d) Criativos em revisão */}
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

      {/* (e) Publicações */}
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

      {/* (f) Exceções (sem bloqueio urgente) */}
      {urgentes === 0 && excecoes.length > 0 && (
        <GrupoPendencia tipo="excecoes" icon={ShieldAlert} titulo="Exceções" contagem={excecoes.length} tom="warning" descricao="O que a automação não conseguiu resolver sozinha.">
          <Excecoes itens={excecoes} tz={tz} podeOperar={podeOperar} />
        </GrupoPendencia>
      )}

      {/* (g) Configurações incompletas */}
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
