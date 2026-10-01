import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CalendarClock,
  Compass,
  ExternalLink,
  History,
  ImageOff,
  PlugZap,
  ShieldAlert,
} from "lucide-react";
import { Secao } from "@/components/ml/campos";
import { ScoreBadge, StatusBadge } from "@/components/ml/status";
import { UltimoStatusBadge } from "@/components/ml/automacoes/ultimo-status";
import {
  formatarNumero,
  formatarPercentual,
  linkEntidade,
  rotuloProvider,
  tempoRelativo,
  truncarTexto,
} from "@/components/ml/logs/formatos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { descreverCron } from "@/lib/ml/cron";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { Metrica } from "./contador";
import type {
  AgendamentoResumo,
  Atividade,
  ContadoresDashboard,
  IntegracaoResumo,
  PendenciaResumo,
  PinTop,
  ProdutoRecente,
} from "./tipos";

function LinkSecao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant="ghost">
      <Link href={href}>
        {children} <ArrowRight />
      </Link>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

const STATUS_INTEGRACAO: Record<string, string> = {
  disconnected: "Não conectado",
  expiring: "Token expirando",
  error: "Erro na integração",
  invalid: "Credencial inválida",
  insufficient_scope: "Escopo insuficiente",
};

const TIPO_PENDENCIA: Record<string, string> = {
  integration_auth: "Autenticação",
  publish_blocked: "Publicação bloqueada",
  product_changed: "Produto alterado",
  job_failed: "Falha de job",
  config_incomplete: "Configuração incompleta",
};

function linkPendencia(p: PendenciaResumo): string {
  switch (p.type) {
    case "integration_auth":
      return "/ml/integracoes";
    case "config_incomplete":
      return "/ml/configuracoes";
    case "job_failed": {
      const jobId = typeof p.payload?.job_id === "string" ? p.payload.job_id : null;
      if (jobId) return `/ml/logs?job=${encodeURIComponent(jobId)}`;
      return linkEntidade(p.entity_type, p.entity_id) ?? "/ml/pendencias";
    }
    default:
      return linkEntidade(p.entity_type, p.entity_id) ?? "/ml/pendencias";
  }
}

export function AlertasBloco({
  integracoes,
  pendencias,
  totalPendencias,
  tz,
}: {
  integracoes: IntegracaoResumo[];
  pendencias: PendenciaResumo[];
  totalPendencias: number;
  tz: string;
}) {
  if (integracoes.length === 0 && pendencias.length === 0) return null;
  return (
    <section
      className="rounded-xl border border-destructive/30 bg-card p-5 shadow-card"
      aria-labelledby="ml-alertas-titulo"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ml-alertas-titulo" className="flex items-center gap-2 text-h4 font-semibold tracking-tight">
          <ShieldAlert className="size-5 text-destructive" aria-hidden /> Alertas
        </h2>
        {totalPendencias > pendencias.length && (
          <LinkSecao href="/ml/pendencias">Ver todas ({formatarNumero(totalPendencias)})</LinkSecao>
        )}
      </div>
      <ul className="divide-y divide-border/60">
        {integracoes.map((i) => (
          <li key={`int-${i.provider}`}>
            <Link href="/ml/integracoes" className="flex items-start gap-3 py-2.5 hover:opacity-80">
              <PlugZap className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium">
                  {rotuloProvider(i.provider)}: {STATUS_INTEGRACAO[i.status] ?? i.status}
                </span>
                <span className="block text-caption text-muted-foreground">
                  {i.status === "expiring" && i.access_expires_at
                    ? `Expira ${tempoRelativo(i.access_expires_at)} (${formatarNoFuso(i.access_expires_at, tz)}).`
                    : i.last_error
                      ? truncarTexto(i.last_error, 140)
                      : "Conecte para que descoberta e publicação funcionem."}
                </span>
              </span>
              <span className="shrink-0 text-caption font-medium text-tech">Abrir integrações</span>
            </Link>
          </li>
        ))}
        {pendencias.map((p) => (
          <li key={p.id}>
            <Link href={linkPendencia(p)} className="flex items-start gap-3 py-2.5 hover:opacity-80">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-body-sm font-medium">
                  {p.title}
                  <Badge variant="outline" size="sm">
                    {TIPO_PENDENCIA[p.type] ?? p.type}
                  </Badge>
                </span>
                {p.detail && <span className="block text-caption text-muted-foreground">{truncarTexto(p.detail, 160)}</span>}
              </span>
              <time
                className="shrink-0 text-caption text-muted-foreground"
                dateTime={p.created_at}
                title={formatarNoFuso(p.created_at, tz)}
              >
                {tempoRelativo(p.created_at)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export function PerformanceBloco({ c, top }: { c: ContadoresDashboard; top: PinTop[] }) {
  const m = c.metricas_7d;
  const ctr = m.impressions > 0 ? m.outbound_clicks / m.impressions : null;
  const semDados = m.impressions === 0 && m.outbound_clicks === 0 && m.saves === 0 && m.pin_clicks === 0;
  return (
    <Secao
      titulo="Performance · 7 dias"
      descricao="Métricas do Pinterest dos Pins publicados."
      acoes={<LinkSecao href="/ml/analytics">Abrir Analytics</LinkSecao>}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metrica rotulo="Impressões" valor={formatarNumero(m.impressions, true)} />
        <Metrica rotulo="Cliques de saída" valor={formatarNumero(m.outbound_clicks, true)} />
        <Metrica rotulo="CTR de saída" valor={formatarPercentual(ctr)} />
        <Metrica rotulo="Salvamentos" valor={formatarNumero(m.saves, true)} />
        <Metrica rotulo="Cliques no Pin" valor={formatarNumero(m.pin_clicks, true)} />
        <Metrica rotulo="Publicados" valor={formatarNumero(c.pins_publicados_7d)} dica={`${formatarNumero(c.pins_publicados_total)} no total`} />
      </div>

      <h3 className="mb-2 mt-5 text-body-sm font-semibold">Melhores Pins · 30 dias</h3>
      {top.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-caption text-muted-foreground">
          {semDados && c.pins_publicados_total === 0
            ? "Nenhum Pin publicado ainda — as métricas aparecem aqui depois da primeira coleta."
            : "Ainda sem cliques de saída registrados nos últimos 30 dias."}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((p, idx) => (
            <li key={p.chave} className="flex items-center gap-3 rounded-lg px-1 py-1">
              <span className="tabular w-4 text-caption font-semibold text-muted-foreground">{idx + 1}</span>
              <Miniatura src={p.thumbnail} alt="" className="size-10" />
              <Link href={p.href} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-body-sm font-medium">{p.titulo}</span>
                <span className="tabular block text-caption text-muted-foreground">
                  {formatarNumero(p.impressions, true)} impressões · CTR {formatarPercentual(p.ctr)} · {formatarNumero(p.saves)} salvos
                </span>
              </Link>
              <span className="tabular shrink-0 text-right">
                <span className="block text-body-sm font-semibold">{formatarNumero(p.outbound_clicks)}</span>
                <span className="block text-caption text-muted-foreground">cliques</span>
              </span>
              {p.externo && (
                <a
                  href={p.externo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Abrir Pin no Pinterest"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// Próximos jobs
// ---------------------------------------------------------------------------

export function ProximosJobsBloco({
  agendamentos,
  desativados,
  pausado,
  jobsAtivos,
  tz,
}: {
  agendamentos: AgendamentoResumo[];
  desativados: number;
  pausado: boolean;
  jobsAtivos: number;
  tz: string;
}) {
  return (
    <Secao
      titulo="Próximos jobs"
      descricao={
        pausado
          ? "Automações pausadas — nada roda sozinho até retomar."
          : `${formatarNumero(jobsAtivos)} job(s) na fila ou em execução agora.`
      }
      acoes={<LinkSecao href="/ml/automacoes">Abrir Automações</LinkSecao>}
    >
      {agendamentos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-caption text-muted-foreground">
          Nenhuma automação ativa. <Link href="/ml/automacoes" className="font-medium text-tech hover:underline">Configurar horários</Link>
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {agendamentos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <CalendarClock className={cn("size-4 shrink-0", pausado ? "text-muted-foreground" : "text-tech")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium">{a.name}</span>
                <span className="block text-caption text-muted-foreground">
                  {descreverCron(a.cron_expression)}
                  {a.timezone !== tz && ` · ${a.timezone}`}
                  {a.last_run_at && ` · última ${tempoRelativo(a.last_run_at)}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <UltimoStatusBadge status={a.last_status} />
                <span className="tabular min-w-[92px] text-right text-caption" title={formatarNoFuso(a.next_run_at, tz)}>
                  <span className="block font-medium">{a.next_run_at ? tempoRelativo(a.next_run_at) : "—"}</span>
                  <span className="block text-muted-foreground">
                    {formatarNoFuso(a.next_run_at, tz, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {desativados > 0 && (
        <p className="mt-2 text-caption text-muted-foreground">{desativados} automação(ões) desativada(s).</p>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// Produtos recentes
// ---------------------------------------------------------------------------

export function Miniatura({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground", className)}>
        <ImageOff className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    // Imagens de terceiros (CDN do ML/Pinterest): sem otimização do Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={cn("shrink-0 rounded-lg bg-secondary object-cover", className)} />
  );
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ProdutosRecentesBloco({ produtos, tz }: { produtos: ProdutoRecente[]; tz: string }) {
  return (
    <Secao
      titulo="Descobertos recentemente"
      acoes={<LinkSecao href="/ml/descobertas">Ver descobertas</LinkSecao>}
    >
      {produtos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-center">
          <Compass className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-caption text-muted-foreground">
            Nenhum produto descoberto ainda. Escolha categorias e execute a descoberta.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/ml/configuracoes">Escolher categorias</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {produtos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/ml/produtos/${p.id}`}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-2.5 transition-colors hover:bg-secondary/60"
              >
                <Miniatura src={p.thumbnail} alt="" className="size-14" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="line-clamp-2 text-body-sm font-medium leading-snug">{p.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ScoreBadge score={p.score} confianca={p.score_confidence} />
                    <StatusBadge tipo="product" status={p.status} />
                  </span>
                  <span className="block text-caption text-muted-foreground">
                    {p.current_price != null && `${BRL.format(p.current_price)} · `}
                    <time dateTime={p.first_seen_at} title={formatarNoFuso(p.first_seen_at, tz)}>
                      {tempoRelativo(p.first_seen_at)}
                    </time>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// Atividades recentes
// ---------------------------------------------------------------------------

export function AtividadesBloco({ atividades, tz, podeVerLogs }: { atividades: Atividade[]; tz: string; podeVerLogs: boolean }) {
  return (
    <Secao
      titulo="Atividades recentes"
      acoes={podeVerLogs ? <LinkSecao href="/ml/logs?aba=auditoria">Ver auditoria</LinkSecao> : undefined}
    >
      {atividades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-caption text-muted-foreground">
          Nada registrado ainda.
        </p>
      ) : (
        <ol className="divide-y divide-border/60">
          {atividades.map((a) => {
            const Icone = a.tipo === "transicao" ? ArrowRightLeft : a.ator === "Automação" ? Activity : History;
            const conteudo = (
              <>
                <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm">{a.titulo}</span>
                  {a.detalhe && <span className="block truncate text-caption text-muted-foreground">{a.detalhe}</span>}
                </span>
                <span className="shrink-0 text-right text-caption text-muted-foreground">
                  <span className="block">{a.ator}</span>
                  <time dateTime={a.quando} title={formatarNoFuso(a.quando, tz)}>
                    {tempoRelativo(a.quando)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {a.href ? (
                  <Link href={a.href} className="flex items-start gap-3 py-2 hover:opacity-80">
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 py-2">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Secao>
  );
}
