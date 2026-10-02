import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import {
  ATOR_LABEL,
  formatarDuracao,
  idCurto,
  linkEntidade,
  rotuloAcao,
  rotuloEntidade,
  rotuloProvider,
  rotuloStatusEntidade,
  truncarTexto,
} from "./formatos";
import { LinhaClicavel } from "./interativos";
import { JsonBloco } from "./json-bloco";

const FMT_HORA: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" };

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2.5 font-medium ${className ?? ""}`}>{children}</th>;
}

function Td({ children, className, title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-3 py-2.5 ${className ?? ""}`} title={title}>
      {children}
    </td>
  );
}

function Tabela({ minW, cabecalho, children }: { minW: string; cabecalho: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-card">
      <table className={`w-full text-left text-body-sm ${minW}`}>
        <thead className="border-b border-border/70 bg-secondary/40 text-overline uppercase tracking-wide text-muted-foreground">
          <tr>{cabecalho}</tr>
        </thead>
        <tbody className="divide-y divide-border/50">{children}</tbody>
      </table>
    </div>
  );
}

function EntidadeLink({ tipo, id }: { tipo: string | null; id: string | null }) {
  if (!tipo || !id) return <span className="text-muted-foreground">—</span>;
  const href = linkEntidade(tipo, id);
  const conteudo = (
    <>
      <span>{rotuloEntidade(tipo)}</span> <span className="font-mono text-caption">{idCurto(id)}</span>
    </>
  );
  return href ? (
    <Link href={href} className="whitespace-nowrap text-tech hover:underline">
      {conteudo}
    </Link>
  ) : (
    <span className="whitespace-nowrap">{conteudo}</span>
  );
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface LinhaJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  duration_ms: number | null;
  last_error: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  provider: string | null;
}

export function TabelaJobs({
  linhas,
  tz,
  hrefJob,
  jobAtivo,
}: {
  linhas: LinhaJob[];
  tz: string;
  hrefJob: (id: string) => string;
  jobAtivo: string | null;
}) {
  return (
    <Tabela
      minW="min-w-[920px]"
      cabecalho={
        <>
          <Th>Quando</Th>
          <Th>Job</Th>
          <Th>Tipo</Th>
          <Th>Entidade</Th>
          <Th>Integração</Th>
          <Th>Status</Th>
          <Th className="text-right">Tent.</Th>
          <Th className="text-right">Duração</Th>
          <Th>Mensagem</Th>
        </>
      }
    >
      {linhas.map((j) => (
        <LinhaClicavel key={j.id} href={hrefJob(j.id)} ativa={j.id === jobAtivo}>
          <Td className="tabular whitespace-nowrap text-caption">{formatarNoFuso(j.created_at, tz, FMT_HORA)}</Td>
          <Td>
            <Link href={hrefJob(j.id)} scroll={false} className="font-mono text-caption hover:underline">
              {idCurto(j.id)}
            </Link>
          </Td>
          <Td className="whitespace-nowrap">{labelJob(j.type)}</Td>
          <Td>
            <EntidadeLink tipo={j.entity_type} id={j.entity_id} />
          </Td>
          <Td className="whitespace-nowrap text-caption">{j.provider ? rotuloProvider(j.provider) : <span className="text-muted-foreground">—</span>}</Td>
          <Td>
            <StatusBadge tipo="job" status={j.status} />
          </Td>
          <Td className="tabular text-right text-caption">
            {j.attempts}/{j.max_attempts}
          </Td>
          <Td className="tabular whitespace-nowrap text-right text-caption">{formatarDuracao(j.duration_ms)}</Td>
          <Td className="max-w-[280px] text-caption text-muted-foreground" title={j.last_error ?? undefined}>
            {j.last_error ? truncarTexto(j.last_error, 90) : "—"}
          </Td>
        </LinhaClicavel>
      ))}
    </Tabela>
  );
}

// ---------------------------------------------------------------------------
// Chamadas de API
// ---------------------------------------------------------------------------

export interface LinhaApi {
  id: number;
  provider: string;
  operation: string;
  method: string;
  url: string;
  status: number | null;
  duration_ms: number | null;
  request_id: string | null;
  error: string | null;
  job_id: string | null;
  created_at: string;
}

export function TabelaApi({ linhas, tz, hrefJob }: { linhas: LinhaApi[]; tz: string; hrefJob: (id: string) => string }) {
  return (
    <Tabela
      minW="min-w-[980px]"
      cabecalho={
        <>
          <Th>Quando</Th>
          <Th>Integração</Th>
          <Th>Operação</Th>
          <Th>Requisição</Th>
          <Th>Status</Th>
          <Th className="text-right">Duração</Th>
          <Th>Request ID</Th>
          <Th>Erro</Th>
          <Th>Job</Th>
        </>
      }
    >
      {linhas.map((c) => {
        const falhou = c.status == null || c.status >= 400 || !!c.error;
        return (
          <tr key={c.id} className="align-top">
            <Td className="tabular whitespace-nowrap text-caption">{formatarNoFuso(c.created_at, tz, FMT_HORA)}</Td>
            <Td className="whitespace-nowrap">{rotuloProvider(c.provider)}</Td>
            <Td className="text-caption">{c.operation}</Td>
            <Td className="max-w-[260px] text-caption">
              <span className="font-mono">
                <span className="font-semibold">{c.method}</span> <span className="break-all text-muted-foreground">{c.url}</span>
              </span>
            </Td>
            <Td>
              <Badge variant={falhou ? "destructive" : "success"} size="sm" className="tabular">
                {c.status ?? "sem resposta"}
              </Badge>
            </Td>
            <Td className="tabular whitespace-nowrap text-right text-caption">{formatarDuracao(c.duration_ms)}</Td>
            <Td className="max-w-[140px] truncate font-mono text-caption text-muted-foreground" title={c.request_id ?? undefined}>
              {c.request_id ?? "—"}
            </Td>
            <Td className="max-w-[240px] text-caption text-destructive" title={c.error ?? undefined}>
              {c.error ? truncarTexto(c.error, 90) : <span className="text-muted-foreground">—</span>}
            </Td>
            <Td>
              {c.job_id ? (
                <Link href={hrefJob(c.job_id)} scroll={false} className="font-mono text-caption text-tech hover:underline">
                  {idCurto(c.job_id)}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Td>
          </tr>
        );
      })}
    </Tabela>
  );
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export interface LinhaAuditoria {
  id: number;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  created_at: string;
}

const temConteudo = (v: unknown) =>
  v != null && !(typeof v === "object" && Object.keys(v as object).length === 0);

export function ListaAuditoria({ linhas, tz }: { linhas: LinhaAuditoria[]; tz: string }) {
  return (
    <ol className="divide-y divide-border/50 rounded-xl border border-border/70 bg-card shadow-card">
      {linhas.map((a) => {
        const temDados = temConteudo(a.before) || temConteudo(a.after) || temConteudo(a.metadata);
        return (
          <li key={a.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-body-sm font-medium">{rotuloAcao(a.action)}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                  <code className="font-mono">{a.action}</code>
                  {a.entity_type && (
                    <>
                      <span aria-hidden>·</span>
                      <EntidadeLink tipo={a.entity_type} id={a.entity_id} />
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-caption">
                <Badge variant={a.actor_type === "user" ? "default" : "tech"} size="sm">
                  {ATOR_LABEL[a.actor_type] ?? a.actor_type}
                </Badge>
                {a.actor_id && <span className="font-mono text-muted-foreground" title={a.actor_id}>{idCurto(a.actor_id)}</span>}
                <time className="tabular text-muted-foreground" dateTime={a.created_at}>
                  {formatarNoFuso(a.created_at, tz, FMT_HORA)}
                </time>
              </div>
            </div>
            {temDados && (
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {temConteudo(a.before) && <JsonBloco titulo="Antes" valor={a.before} />}
                {temConteudo(a.after) && <JsonBloco titulo="Depois" valor={a.after} />}
                {temConteudo(a.metadata) && <JsonBloco titulo="Metadados" valor={a.metadata} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Transições de status
// ---------------------------------------------------------------------------

export interface LinhaTransicao {
  id: number;
  entity_type: string;
  entity_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

const TIPOS_BADGE = ["product", "creative", "pin"] as const;
type TipoBadge = (typeof TIPOS_BADGE)[number];
const ehTipoBadge = (t: string): t is TipoBadge => (TIPOS_BADGE as readonly string[]).includes(t);

function StatusEntidade({ tipo, status }: { tipo: string; status: string | null }) {
  if (!status) return <span className="text-caption text-muted-foreground">início</span>;
  if (ehTipoBadge(tipo)) return <StatusBadge tipo={tipo} status={status} />;
  return <Badge variant="outline">{rotuloStatusEntidade(tipo, status)}</Badge>;
}

export function TabelaTransicoes({ linhas, tz }: { linhas: LinhaTransicao[]; tz: string }) {
  return (
    <Tabela
      minW="min-w-[860px]"
      cabecalho={
        <>
          <Th>Quando</Th>
          <Th>Entidade</Th>
          <Th>Transição</Th>
          <Th>Motivo</Th>
          <Th>Ator</Th>
        </>
      }
    >
      {linhas.map((t) => (
        <tr key={t.id} className="align-top">
          <Td className="tabular whitespace-nowrap text-caption">{formatarNoFuso(t.created_at, tz, FMT_HORA)}</Td>
          <Td>
            <EntidadeLink tipo={t.entity_type} id={t.entity_id} />
          </Td>
          <Td>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusEntidade tipo={t.entity_type} status={t.from_status} />
              <ArrowRight className="size-3.5 text-muted-foreground" aria-label="para" />
              <StatusEntidade tipo={t.entity_type} status={t.to_status} />
            </span>
          </Td>
          <Td className="max-w-[320px] text-caption text-muted-foreground" title={t.reason ?? undefined}>
            {t.reason ? truncarTexto(t.reason, 140) : "—"}
          </Td>
          <Td className="whitespace-nowrap text-caption">{ATOR_LABEL[t.actor_type] ?? t.actor_type}</Td>
        </tr>
      ))}
    </Tabela>
  );
}
