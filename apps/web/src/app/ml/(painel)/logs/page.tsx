import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, ChevronLeft, ChevronRight, Globe, History, Lock, ScrollText, ServerCog, X } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { FiltrosLogs, type FiltroDef } from "@/components/ml/logs/filtros";
import {
  ENTIDADE_LABEL,
  idCurto,
  PAGINA_TAMANHO,
  PROVIDER_LABEL,
  ATOR_LABEL,
} from "@/components/ml/logs/formatos";
import { DrawerUrl } from "@/components/ml/logs/interativos";
import {
  JobDetalhe,
  type ChamadaApiJob,
  type JobCompleto,
  type JobRelacionado,
  type LogJob,
} from "@/components/ml/logs/job-detalhe";
import {
  ListaAuditoria,
  TabelaApi,
  TabelaJobs,
  TabelaTransicoes,
  type LinhaApi,
  type LinhaAuditoria,
  type LinhaJob,
  type LinhaTransicao,
} from "@/components/ml/logs/tabelas";
import {
  ABAS_LOGS,
  hrefLogs,
  inicioPeriodo,
  lerParams,
  PERIODO_PADRAO,
  PERIODOS,
  UUID_RE,
  type AbaLogs,
  type ParamsLogs,
} from "@/components/ml/logs/url";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { JOB_STATUS_LABEL, JOB_TYPES, labelJob } from "@/lib/ml/jobs/tipos";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Logs & Erros" };

type Sb = ReturnType<typeof createClient>;

const ABA_INFO: Record<AbaLogs, { rotulo: string; icone: typeof ScrollText; tecnica: boolean }> = {
  jobs: { rotulo: "Jobs", icone: ServerCog, tecnica: true },
  api: { rotulo: "Chamadas de API", icone: Globe, tecnica: true },
  auditoria: { rotulo: "Auditoria", icone: History, tecnica: true },
  transicoes: { rotulo: "Transições", icone: ArrowRightLeft, tecnica: false },
};

const OPCAO_TODOS = { valor: "", rotulo: "Todos" };
const FILTRO_PERIODO: FiltroDef = {
  nome: "periodo",
  rotulo: "Período",
  padrao: PERIODO_PADRAO,
  opcoes: PERIODOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo })),
};

function pagina(params: ParamsLogs): number {
  const n = Number(params.pagina);
  return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1;
}

// ---------------------------------------------------------------------------
// Consultas (cliente do usuário ⇒ RLS; listas sempre paginadas)
// ---------------------------------------------------------------------------

async function buscarJobs(sb: Sb, p: ParamsLogs, offset: number) {
  let q = sb
    .from("ml_jobs")
    .select(
      "id, type, status, attempts, max_attempts, duration_ms, last_error, entity_type, entity_id, created_at, provider:error_detail->>provider",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGINA_TAMANHO);
  if (p.status && p.status in JOB_STATUS_LABEL) q = q.eq("status", p.status);
  if (p.tipo && (JOB_TYPES as readonly string[]).includes(p.tipo)) q = q.eq("type", p.tipo);
  if (p.entidade) q = q.eq("entity_id", p.entidade);
  const desde = inicioPeriodo(p.periodo);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q;
  return { linhas: (data ?? []) as LinhaJob[], erro: error?.message ?? null };
}

async function buscarApi(sb: Sb, p: ParamsLogs, offset: number) {
  let q = sb
    .from("ml_api_calls")
    .select("id, provider, operation, method, url, status, duration_ms, request_id, error, job_id, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGINA_TAMANHO);
  if (p.provider && p.provider in PROVIDER_LABEL) q = q.eq("provider", p.provider);
  if (p.resultado === "erro") q = q.or("status.gte.400,status.is.null,error.not.is.null");
  if (p.resultado === "ok") q = q.lt("status", 400).is("error", null);
  if (p.job && UUID_RE.test(p.job)) q = q.eq("job_id", p.job);
  const desde = inicioPeriodo(p.periodo);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q;
  return { linhas: (data ?? []) as LinhaApi[], erro: error?.message ?? null };
}

async function buscarAuditoria(sb: Sb, p: ParamsLogs, offset: number) {
  let q = sb
    .from("ml_audit_log")
    .select("id, actor_type, actor_id, action, entity_type, entity_id, before, after, metadata, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGINA_TAMANHO);
  if (p.ator && p.ator in ATOR_LABEL) q = q.eq("actor_type", p.ator);
  if (p.entidade_tipo) q = q.eq("entity_type", p.entidade_tipo);
  if (p.entidade) q = q.eq("entity_id", p.entidade);
  const desde = inicioPeriodo(p.periodo);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q;
  return { linhas: (data ?? []) as LinhaAuditoria[], erro: error?.message ?? null };
}

async function buscarTransicoes(sb: Sb, p: ParamsLogs, offset: number) {
  let q = sb
    .from("ml_status_history")
    .select("id, entity_type, entity_id, from_status, to_status, reason, actor_type, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGINA_TAMANHO);
  if (p.entidade_tipo && ["product", "creative", "pin"].includes(p.entidade_tipo)) q = q.eq("entity_type", p.entidade_tipo);
  if (p.ator && p.ator in ATOR_LABEL) q = q.eq("actor_type", p.ator);
  if (p.entidade && UUID_RE.test(p.entidade)) q = q.eq("entity_id", p.entidade);
  const desde = inicioPeriodo(p.periodo);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q;
  return { linhas: (data ?? []) as LinhaTransicao[], erro: error?.message ?? null };
}

async function buscarDetalheJob(sb: Sb, jobId: string) {
  const { data } = await sb
    .from("ml_jobs")
    .select(
      "id, type, status, payload, result, progress, error_detail, last_error, attempts, max_attempts, priority, run_at, started_at, finished_at, duration_ms, created_at, cancel_requested, idempotency_key, concurrency_key, schedule_id, parent_id, entity_type, entity_id, locked_by",
    )
    .eq("id", jobId)
    .maybeSingle();
  const job = data as JobCompleto | null;
  if (!job) return null;
  const [logsR, filhosR, paiR, chamadasR, agR] = await Promise.all([
    sb.from("ml_job_logs").select("id, level, message, data, created_at").eq("job_id", jobId).order("id", { ascending: true }).limit(300),
    sb.from("ml_jobs").select("id, type, status, created_at").eq("parent_id", jobId).order("created_at", { ascending: true }).limit(50),
    job.parent_id
      ? sb.from("ml_jobs").select("id, type, status, created_at").eq("id", job.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from("ml_api_calls")
      .select("id, provider, operation, method, url, status, duration_ms, request_id, error, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(50),
    job.schedule_id
      ? sb.from("ml_schedules").select("name").eq("id", job.schedule_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    job,
    logs: (logsR.data ?? []) as LogJob[],
    filhos: (filhosR.data ?? []) as JobRelacionado[],
    pai: (paiR.data ?? null) as JobRelacionado | null,
    chamadas: (chamadasR.data ?? []) as ChamadaApiJob[],
    agendamento: ((agR.data ?? null) as { name: string } | null)?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default async function LogsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = lerParams(searchParams);
  const [role, geral] = await Promise.all([getMlRole(), lerConfig("geral")]);
  const tz = geral.timezone;
  const podeVerTecnico = temPapel(role, "operator");
  const abaPedida = (ABAS_LOGS as readonly string[]).includes(params.aba ?? "") ? (params.aba as AbaLogs) : null;
  const aba: AbaLogs = abaPedida ?? (podeVerTecnico ? "jobs" : "transicoes");
  const pag = pagina(params);
  const offset = (pag - 1) * PAGINA_TAMANHO;
  const jobAberto = params.job && UUID_RE.test(params.job) && aba === "jobs" ? params.job : null;
  const bloqueada = ABA_INFO[aba].tecnica && !podeVerTecnico;

  const sb = createClient();
  const atual: ParamsLogs = { ...params, aba };

  let conteudo: React.ReactNode = null;
  let total = 0;
  let erro: string | null = null;
  let filtros: FiltroDef[] = [FILTRO_PERIODO];

  if (!bloqueada) {
    if (aba === "jobs") {
      filtros = [
        {
          nome: "status",
          rotulo: "Status",
          padrao: "",
          opcoes: [OPCAO_TODOS, ...Object.entries(JOB_STATUS_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))],
        },
        {
          nome: "tipo",
          rotulo: "Tipo",
          padrao: "",
          opcoes: [
            OPCAO_TODOS,
            ...[...JOB_TYPES]
              .map((t) => ({ valor: t, rotulo: labelJob(t) }))
              .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
          ],
        },
        FILTRO_PERIODO,
      ];
      const r = await buscarJobs(sb, params, offset);
      erro = r.erro;
      total = r.linhas.length;
      const hrefJob = (id: string) => hrefLogs(atual, { job: id });
      conteudo = r.linhas.length ? (
        <TabelaJobs linhas={r.linhas.slice(0, PAGINA_TAMANHO)} tz={tz} hrefJob={hrefJob} jobAtivo={jobAberto} />
      ) : null;
    } else if (aba === "api") {
      filtros = [
        {
          nome: "provider",
          rotulo: "Integração",
          padrao: "",
          opcoes: [OPCAO_TODOS, ...Object.entries(PROVIDER_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))],
        },
        {
          nome: "resultado",
          rotulo: "Resultado",
          padrao: "",
          opcoes: [OPCAO_TODOS, { valor: "erro", rotulo: "Com erro" }, { valor: "ok", rotulo: "Sucesso" }],
        },
        FILTRO_PERIODO,
      ];
      const r = await buscarApi(sb, params, offset);
      erro = r.erro;
      total = r.linhas.length;
      const hrefJob = (id: string) => hrefLogs({ aba: "jobs" }, { job: id, periodo: "tudo" });
      conteudo = r.linhas.length ? <TabelaApi linhas={r.linhas.slice(0, PAGINA_TAMANHO)} tz={tz} hrefJob={hrefJob} /> : null;
    } else if (aba === "auditoria") {
      filtros = [
        {
          nome: "ator",
          rotulo: "Ator",
          padrao: "",
          opcoes: [OPCAO_TODOS, ...Object.entries(ATOR_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))],
        },
        {
          nome: "entidade_tipo",
          rotulo: "Entidade",
          padrao: "",
          opcoes: [OPCAO_TODOS, ...Object.entries(ENTIDADE_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))],
        },
        FILTRO_PERIODO,
      ];
      const r = await buscarAuditoria(sb, params, offset);
      erro = r.erro;
      total = r.linhas.length;
      conteudo = r.linhas.length ? <ListaAuditoria linhas={r.linhas.slice(0, PAGINA_TAMANHO)} tz={tz} /> : null;
    } else {
      filtros = [
        {
          nome: "entidade_tipo",
          rotulo: "Entidade",
          padrao: "",
          opcoes: [OPCAO_TODOS, { valor: "product", rotulo: "Produto" }, { valor: "creative", rotulo: "Criativo" }, { valor: "pin", rotulo: "Pin" }],
        },
        {
          nome: "ator",
          rotulo: "Ator",
          padrao: "",
          opcoes: [OPCAO_TODOS, ...Object.entries(ATOR_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))],
        },
        FILTRO_PERIODO,
      ];
      const r = await buscarTransicoes(sb, params, offset);
      erro = r.erro;
      total = r.linhas.length;
      conteudo = r.linhas.length ? <TabelaTransicoes linhas={r.linhas.slice(0, PAGINA_TAMANHO)} tz={tz} /> : null;
    }
  }

  const temMais = total > PAGINA_TAMANHO;
  const detalhe = jobAberto && podeVerTecnico ? await buscarDetalheJob(sb, jobAberto) : null;
  const hrefFecharDetalhe = hrefLogs(atual, { job: undefined });
  const filtrosAtivos = ["status", "tipo", "provider", "resultado", "ator", "entidade_tipo", "entidade"].some((k) => params[k]);

  return (
    <div className="space-y-5">
      <PageHeader title="Logs & Erros" description="Diagnóstico sem abrir servidor ou banco. Dados sensíveis já chegam mascarados." />

      {/* Abas (estado na URL) */}
      <nav className="-mx-1 overflow-x-auto px-1" aria-label="Seções de logs">
        <div className="inline-flex h-11 items-center gap-1 rounded-full bg-secondary p-1 text-muted-foreground">
          {ABAS_LOGS.map((a) => {
            const info = ABA_INFO[a];
            const Icone = info.icone;
            const ativa = a === aba;
            return (
              <Link
                key={a}
                href={hrefLogs({ aba: a, periodo: params.periodo })}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-all",
                  ativa ? "bg-card text-foreground shadow-card" : "hover:text-foreground",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {info.rotulo}
                {info.tecnica && !podeVerTecnico && <Lock className="size-3" aria-label="restrito" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {bloqueada ? (
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Logs técnicos (jobs, chamadas de API e auditoria) são visíveis para operadores e administradores."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={hrefLogs({ aba: "transicoes" })}>Ver transições de status</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FiltrosLogs filtros={filtros} preservar={["aba"]} />
            {params.entidade && (
              <Link
                href={hrefLogs(atual, { entidade: undefined, pagina: undefined })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-caption hover:bg-secondary"
              >
                Entidade <span className="font-mono">{idCurto(params.entidade)}</span> <X className="size-3" aria-label="remover filtro" />
              </Link>
            )}
          </div>

          {erro && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">
              Não foi possível carregar: {erro}
            </p>
          )}

          {conteudo ??
            (!erro && (
              <EmptyState
                icon={ScrollText}
                title={pag > 1 ? "Nada nesta página" : "Nenhum registro encontrado"}
                description={
                  filtrosAtivos || params.periodo
                    ? "Tente ampliar o período ou remover filtros."
                    : aba === "jobs"
                      ? "Os jobs aparecem aqui assim que a primeira automação ou ação manual rodar."
                      : "Nada registrado no período."
                }
                action={
                  filtrosAtivos || pag > 1 || params.periodo !== "tudo" ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={hrefLogs({ aba, periodo: "tudo" })}>Ver todo o período sem filtros</Link>
                    </Button>
                  ) : aba === "jobs" ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/ml/automacoes">Abrir Automações</Link>
                    </Button>
                  ) : undefined
                }
              />
            ))}

          {(pag > 1 || temMais) && (
            <nav className="flex items-center justify-between gap-3" aria-label="Paginação">
              <p className="tabular text-caption text-muted-foreground">
                Página {pag} · {PAGINA_TAMANHO} por página
              </p>
              <div className="flex gap-2">
                {pag > 1 ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={hrefLogs(atual, { pagina: String(pag - 1), job: undefined })} scroll={false}>
                      <ChevronLeft /> Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled>
                    <ChevronLeft /> Anterior
                  </Button>
                )}
                {temMais ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={hrefLogs(atual, { pagina: String(pag + 1), job: undefined })} scroll={false}>
                      Próxima <ChevronRight />
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled>
                    Próxima <ChevronRight />
                  </Button>
                )}
              </div>
            </nav>
          )}
        </>
      )}

      {jobAberto && (
        <DrawerUrl
          key={jobAberto}
          hrefFechar={hrefFecharDetalhe}
          titulo={detalhe ? labelJob(detalhe.job.type) : "Job não encontrado"}
          descricao={
            detalhe ? (
              <span className="font-mono text-caption">{detalhe.job.id}</span>
            ) : (
              "O job não existe mais (pode ter sido removido pela limpeza) ou você não tem acesso."
            )
          }
        >
          {detalhe && (
            <JobDetalhe
              job={detalhe.job}
              logs={detalhe.logs}
              pai={detalhe.pai}
              filhos={detalhe.filhos}
              chamadas={detalhe.chamadas}
              agendamento={detalhe.agendamento}
              tz={tz}
              podeOperar={podeVerTecnico}
            />
          )}
        </DrawerUrl>
      )}
    </div>
  );
}
