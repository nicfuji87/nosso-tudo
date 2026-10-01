import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, Play, Trash2 } from "lucide-react";
import {
  duplicarAgendamento,
  excluirAgendamento,
  executarAgora,
} from "@/app/ml/(painel)/automacoes/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarDuracao, tempoRelativo } from "@/components/ml/logs/formatos";
import { descreverCron } from "@/lib/ml/cron";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { AcaoComJob } from "./acao-com-job";
import { AlternarAgendamento } from "./alternar";
import { EditorAgendamento, type AgendamentoEditavel } from "./editor";
import { HistoricoExecucoes, type ExecucaoHistorico } from "./historico";
import { formatarValorConfig, OVERLAP_LABEL, rotuloConfig } from "./rotulos";
import { UltimoStatusBadge } from "./ultimo-status";

export interface AgendamentoCompleto extends AgendamentoEditavel {
  key: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-overline uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-body-sm">{children}</dd>
    </div>
  );
}

export function CardAgendamento({
  a,
  tz,
  pausado,
  podeOperar,
  podeEditar,
  historico,
  hrefHistorico,
}: {
  a: AgendamentoCompleto;
  tz: string;
  pausado: boolean;
  podeOperar: boolean;
  podeEditar: boolean;
  /** Execuções carregadas quando o histórico está aberto; null = fechado. */
  historico: ExecucaoHistorico[] | null;
  hrefHistorico: string;
}) {
  const copia = a.key.includes("_copia_");
  const config = Object.entries(a.config ?? {});
  const aberto = historico !== null;

  return (
    <article
      id={`agendamento-${a.id}`}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card p-4 shadow-card sm:p-5",
        a.enabled ? "border-border/70" : "border-dashed border-border bg-card/60",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-h4 font-semibold tracking-tight">
            {a.name}
            {copia && (
              <Badge variant="outline" size="sm">
                cópia
              </Badge>
            )}
          </h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">{a.description ?? labelJob(a.job_type)}</p>
        </div>
        <AlternarAgendamento id={a.id} nome={a.name} enabled={a.enabled} podeEditar={podeEditar} />
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        <Info rotulo="Agenda">
          <span className="block">{descreverCron(a.cron_expression)}</span>
          <span className="block text-caption text-muted-foreground">
            <code className="font-mono">{a.cron_expression}</code> · {a.timezone}
          </span>
        </Info>
        <Info rotulo="Próxima execução">
          {!a.enabled ? (
            <span className="text-muted-foreground">Desativada</span>
          ) : (
            <>
              <span className="tabular block">{formatarNoFuso(a.next_run_at, tz)}</span>
              <span className="block text-caption text-muted-foreground">
                {pausado ? "pausada globalmente" : a.next_run_at ? tempoRelativo(a.next_run_at) : "calculando…"}
              </span>
            </>
          )}
        </Info>
        <Info rotulo="Última execução">
          <span className="tabular block">{formatarNoFuso(a.last_run_at, tz)}</span>
          <span className="block text-caption text-muted-foreground">
            {a.last_duration_ms != null ? `duração ${formatarDuracao(a.last_duration_ms)}` : a.last_run_at ? tempoRelativo(a.last_run_at) : "nunca"}
          </span>
        </Info>
        <Info rotulo="Último resultado">
          <UltimoStatusBadge status={a.last_status} />
        </Info>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
        <Badge variant="default" size="sm" className="normal-case" title="Política de sobreposição">
          Sobreposição: {OVERLAP_LABEL[a.overlap_policy] ?? a.overlap_policy}
        </Badge>
        {config.map(([k, v]) => (
          <Badge key={k} variant="outline" size="sm" className="normal-case">
            {rotuloConfig(k)}: {formatarValorConfig(v)}
          </Badge>
        ))}
      </div>

      <footer className="mt-4 flex flex-wrap items-start gap-2 border-t border-border/60 pt-3">
        {podeOperar && (
          <AcaoComJob size="sm" variant="tech" acao={executarAgora.bind(null, a.id)}>
            <Play /> Executar agora
          </AcaoComJob>
        )}
        {podeEditar && (
          <>
            <EditorAgendamento
              agendamento={{
                id: a.id,
                name: a.name,
                description: a.description,
                job_type: a.job_type,
                cron_expression: a.cron_expression,
                timezone: a.timezone,
                enabled: a.enabled,
                overlap_policy: a.overlap_policy,
                config: a.config,
              }}
            />
            <AcaoBotao size="sm" variant="ghost" acao={duplicarAgendamento.bind(null, a.id)}>
              <Copy /> Duplicar configuração
            </AcaoBotao>
            {copia && (
              <AcaoBotao
                size="sm"
                variant="ghost"
                className="text-destructive"
                acao={excluirAgendamento.bind(null, a.id)}
                confirmar={`Excluir "${a.name}"? Esta cópia some da lista (o histórico de jobs é mantido).`}
              >
                <Trash2 /> Excluir
              </AcaoBotao>
            )}
          </>
        )}
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href={hrefHistorico} scroll={false} aria-expanded={aberto}>
            {aberto ? <ChevronUp /> : <ChevronDown />} Histórico
          </Link>
        </Button>
      </footer>

      {aberto && (
        <div className="mt-3 rounded-lg border border-border/60 p-2">
          <HistoricoExecucoes execucoes={historico} tz={tz} podeOperar={podeOperar} />
        </div>
      )}
    </article>
  );
}
