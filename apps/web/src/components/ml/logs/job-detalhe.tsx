import Link from "next/link";
import { Ban, CalendarClock, RotateCcw } from "lucide-react";
import { cancelar, reprocessar } from "@/app/ml/(painel)/automacoes/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { AcaoComJob } from "@/components/ml/automacoes/acao-com-job";
import { StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import {
  formatarDuracao,
  idCurto,
  linkEntidade,
  rotuloEntidade,
  rotuloProvider,
  tempoRelativo,
} from "./formatos";
import { JsonBloco } from "./json-bloco";

export interface JobCompleto {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  progress: Record<string, unknown> | null;
  error_detail: Record<string, unknown> | null;
  last_error: string | null;
  attempts: number;
  max_attempts: number;
  priority: number;
  run_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
  cancel_requested: boolean;
  idempotency_key: string | null;
  concurrency_key: string | null;
  schedule_id: string | null;
  parent_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  locked_by: string | null;
}

export interface JobRelacionado {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

export interface LogJob {
  id: number;
  level: string;
  message: string;
  data: unknown;
  created_at: string;
}

export interface ChamadaApiJob {
  id: number;
  provider: string;
  operation: string;
  method: string;
  url: string;
  status: number | null;
  duration_ms: number | null;
  request_id: string | null;
  error: string | null;
  created_at: string;
}

const NIVEL: Record<string, { rotulo: string; classe: string }> = {
  debug: { rotulo: "debug", classe: "bg-secondary text-muted-foreground" },
  info: { rotulo: "info", classe: "bg-tech/15 text-tech" },
  warn: { rotulo: "aviso", classe: "bg-warning/15 text-warning" },
  error: { rotulo: "erro", classe: "bg-destructive/15 text-destructive" },
};

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-caption text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-right text-body-sm">{children}</dd>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-overline uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

export function JobDetalhe({
  job,
  logs,
  pai,
  filhos,
  chamadas,
  agendamento,
  tz,
  podeOperar,
}: {
  job: JobCompleto;
  logs: LogJob[];
  pai: JobRelacionado | null;
  filhos: JobRelacionado[];
  chamadas: ChamadaApiJob[];
  agendamento: string | null;
  tz: string;
  podeOperar: boolean;
}) {
  const podeReprocessar = ["failed", "dead", "canceled"].includes(job.status);
  const podeCancelar = ["queued", "running"].includes(job.status);
  const proximaTentativa = job.status === "queued" && job.attempts > 0 ? job.run_at : null;
  const det = job.error_detail ?? {};
  const detTexto = (k: string) => {
    const v = det[k];
    return v == null || v === "" ? null : String(v);
  };
  const hrefEntidade = linkEntidade(job.entity_type, job.entity_id);
  const resposta = det.resposta;
  const stack = detTexto("stack");
  const outrosDetalhes = Object.fromEntries(
    Object.entries(det).filter(([k]) => !["provider", "operation", "status", "tipo", "request_id", "resposta", "stack"].includes(k)),
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tipo="job" status={job.status} />
        <Badge variant="outline" className="tabular">
          tentativa {job.attempts}/{job.max_attempts}
        </Badge>
        {job.cancel_requested && job.status === "running" && <Badge variant="warning">cancelamento solicitado</Badge>}
      </div>

      {podeOperar && (podeReprocessar || podeCancelar) && (
        <div className="flex flex-wrap items-start gap-2">
          {podeReprocessar && (
            <AcaoComJob size="sm" variant="tech" acao={reprocessar.bind(null, job.id)}>
              <RotateCcw /> Executar novamente
            </AcaoComJob>
          )}
          {podeCancelar && (
            <AcaoBotao size="sm" variant="secondary" acao={cancelar.bind(null, job.id)} confirmar="Cancelar este job?">
              <Ban /> Cancelar
            </AcaoBotao>
          )}
        </div>
      )}

      {proximaTentativa && (
        <p className="flex items-center gap-2 rounded-lg bg-tech/10 px-3 py-2 text-body-sm">
          <CalendarClock className="size-4 text-tech" aria-hidden />
          Próxima tentativa {tempoRelativo(proximaTentativa)} ({formatarNoFuso(proximaTentativa, tz)})
        </p>
      )}

      {job.last_error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-caption font-medium text-destructive">Último erro</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body-sm">{job.last_error}</p>
        </div>
      )}

      <section>
        <Titulo>Execução</Titulo>
        <dl className="divide-y divide-border/50">
          <Linha rotulo="ID">
            <code className="font-mono text-caption">{job.id}</code>
          </Linha>
          <Linha rotulo="Tipo">
            {labelJob(job.type)} <span className="font-mono text-caption text-muted-foreground">({job.type})</span>
          </Linha>
          {job.entity_type && (
            <Linha rotulo="Entidade">
              {rotuloEntidade(job.entity_type)}{" "}
              {hrefEntidade ? (
                <Link href={hrefEntidade} className="font-mono text-caption text-tech hover:underline">
                  {idCurto(job.entity_id)}
                </Link>
              ) : (
                <span className="font-mono text-caption">{idCurto(job.entity_id)}</span>
              )}
            </Linha>
          )}
          {agendamento && (
            <Linha rotulo="Automação">
              <Link href="/ml/automacoes" className="text-tech hover:underline">
                {agendamento}
              </Link>
            </Linha>
          )}
          <Linha rotulo="Criado">{formatarNoFuso(job.created_at, tz, { dateStyle: "short", timeStyle: "medium" })}</Linha>
          <Linha rotulo="Agendado para">{formatarNoFuso(job.run_at, tz, { dateStyle: "short", timeStyle: "medium" })}</Linha>
          <Linha rotulo="Início">{formatarNoFuso(job.started_at, tz, { dateStyle: "short", timeStyle: "medium" })}</Linha>
          <Linha rotulo="Fim">{formatarNoFuso(job.finished_at, tz, { dateStyle: "short", timeStyle: "medium" })}</Linha>
          <Linha rotulo="Duração">{formatarDuracao(job.duration_ms)}</Linha>
          <Linha rotulo="Prioridade">{job.priority}</Linha>
          {job.locked_by && <Linha rotulo="Worker">{job.locked_by}</Linha>}
          {job.idempotency_key && (
            <Linha rotulo="Idempotência">
              <code className="font-mono text-caption">{job.idempotency_key}</code>
            </Linha>
          )}
          {job.concurrency_key && (
            <Linha rotulo="Concorrência">
              <code className="font-mono text-caption">{job.concurrency_key}</code>
            </Linha>
          )}
        </dl>
      </section>

      {(job.error_detail && Object.keys(job.error_detail).length > 0) && (
        <section>
          <Titulo>Detalhe do erro</Titulo>
          <dl className="divide-y divide-border/50">
            {detTexto("provider") && <Linha rotulo="Integração">{rotuloProvider(detTexto("provider"))}</Linha>}
            {detTexto("operation") && <Linha rotulo="Operação">{detTexto("operation")}</Linha>}
            {detTexto("status") && <Linha rotulo="HTTP">{detTexto("status")}</Linha>}
            {detTexto("tipo") && <Linha rotulo="Classificação">{detTexto("tipo")}</Linha>}
            {detTexto("request_id") && (
              <Linha rotulo="Request ID externo">
                <code className="font-mono text-caption">{detTexto("request_id")}</code>
              </Linha>
            )}
          </dl>
          <div className="mt-2 space-y-2">
            {resposta != null && <JsonBloco titulo="Resposta (sanitizada)" valor={resposta} aberto />}
            {stack && <JsonBloco titulo="Stack (resumida)" valor={stack} />}
            {Object.keys(outrosDetalhes).length > 0 && <JsonBloco titulo="Outros detalhes" valor={outrosDetalhes} />}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <Titulo>Dados</Titulo>
        <JsonBloco titulo="Payload (sanitizado)" valor={job.payload} />
        <JsonBloco titulo="Resultado" valor={job.result} />
        {job.progress && <JsonBloco titulo="Progresso" valor={job.progress} />}
      </section>

      {(pai || filhos.length > 0) && (
        <section>
          <Titulo>Jobs relacionados</Titulo>
          <ul className="space-y-1">
            {pai && (
              <li className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className="text-caption text-muted-foreground">Pai:</span>
                <Link href={`/ml/logs?job=${pai.id}`} className="hover:underline">
                  {labelJob(pai.type)}
                </Link>
                <StatusBadge tipo="job" status={pai.status} />
              </li>
            )}
            {filhos.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className="text-caption text-muted-foreground">Filho:</span>
                <Link href={`/ml/logs?job=${f.id}`} className="hover:underline">
                  {labelJob(f.type)}
                </Link>
                <span className="font-mono text-caption text-muted-foreground">{idCurto(f.id)}</span>
                <StatusBadge tipo="job" status={f.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <Titulo>Logs do job ({logs.length})</Titulo>
        {logs.length === 0 ? (
          <p className="text-caption text-muted-foreground">Sem logs registrados.</p>
        ) : (
          <ol className="space-y-1.5">
            {logs.map((l) => {
              const n = NIVEL[l.level] ?? { rotulo: l.level, classe: "bg-secondary" };
              return (
                <li key={l.id} className="rounded-lg border border-border/50 px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-caption">
                    <span className={cn("rounded px-1.5 py-0.5 text-overline font-semibold uppercase", n.classe)}>{n.rotulo}</span>
                    <time className="tabular text-muted-foreground" dateTime={l.created_at}>
                      {formatarNoFuso(l.created_at, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-body-sm">{l.message}</p>
                  {l.data != null && <JsonBloco titulo="Dados" valor={l.data} className="mt-1.5" />}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {chamadas.length > 0 && (
        <section>
          <Titulo>Chamadas de API ({chamadas.length})</Titulo>
          <ul className="space-y-1">
            {chamadas.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/50 px-2.5 py-1.5 text-caption">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{rotuloProvider(c.provider)}</span>
                  <span className="text-muted-foreground">{c.operation}</span>
                  <Badge variant={c.status == null || c.status >= 400 || c.error ? "destructive" : "success"} size="sm">
                    {c.status ?? "sem resposta"}
                  </Badge>
                  <span className="tabular text-muted-foreground">{formatarDuracao(c.duration_ms)}</span>
                </div>
                <p className="mt-0.5 break-all font-mono text-muted-foreground">
                  {c.method} {c.url}
                </p>
                {c.request_id && <p className="font-mono text-muted-foreground">request_id: {c.request_id}</p>}
                {c.error && <p className="text-destructive">{c.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
