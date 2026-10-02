import type { Metadata } from "next";
import { Activity, Info, PauseCircle } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { CardAgendamento, type AgendamentoCompleto } from "@/components/ml/automacoes/card-agendamento";
import type { ExecucaoHistorico } from "@/components/ml/automacoes/historico";
import { PausaGlobalBotao } from "@/components/ml/automacoes/pausa-global";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Automações" };

interface RunRow {
  id: string;
  schedule_id: string;
  trigger: string;
  outcome: string;
  job_id: string | null;
  note: string | null;
  created_at: string;
}

type JobResumo = NonNullable<ExecucaoHistorico["job"]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const historicoParam = typeof searchParams.historico === "string" && UUID.test(searchParams.historico) ? searchParams.historico : null;
  const supabase = createClient();
  const [role, geral, automacao, agendamentosR] = await Promise.all([
    getMlRole(),
    lerConfig("geral"),
    lerConfig("automacao"),
    supabase
      .from("ml_schedules")
      .select(
        "id, key, name, description, job_type, cron_expression, timezone, enabled, overlap_policy, config, next_run_at, last_run_at, last_status, last_duration_ms",
      )
      .order("key", { ascending: true })
      .limit(200),
  ]);
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");
  const podeEditar = temPapel(role, "admin");
  const agendamentos = ((agendamentosR.data ?? []) as AgendamentoCompleto[]).map((a) => ({
    ...a,
    config: a.config && typeof a.config === "object" && !Array.isArray(a.config) ? a.config : {},
  }));

  // Histórico só do agendamento expandido (últimas 20 execuções + jobs).
  let historico: ExecucaoHistorico[] | null = null;
  if (historicoParam && agendamentos.some((a) => a.id === historicoParam)) {
    const { data: runs } = await supabase
      .from("ml_schedule_runs")
      .select("id, schedule_id, trigger, outcome, job_id, note, created_at")
      .eq("schedule_id", historicoParam)
      .order("created_at", { ascending: false })
      .limit(20);
    const linhas = (runs ?? []) as RunRow[];
    const jobIds = [...new Set(linhas.map((r) => r.job_id).filter((x): x is string => !!x))];
    const jobs = new Map<string, JobResumo>();
    if (jobIds.length && podeOperar) {
      const { data } = await supabase
        .from("ml_jobs")
        .select("id, status, attempts, max_attempts, duration_ms, last_error")
        .in("id", jobIds);
      for (const j of (data ?? []) as JobResumo[]) jobs.set(j.id, j);
    }
    historico = linhas.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      outcome: r.outcome,
      note: r.note,
      created_at: r.created_at,
      job_id: r.job_id,
      job: r.job_id ? jobs.get(r.job_id) ?? null : null,
    }));
  }

  const ativas = agendamentos.filter((a) => a.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description={`${ativas} de ${agendamentos.length} automações ativas · horários em ${tz}.`}
        actions={podeEditar ? <PausaGlobalBotao pausado={automacao.pausado} /> : undefined}
      />

      {automacao.pausado && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-body-sm">
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-medium">Automações pausadas.</span>{" "}
            <span className="text-muted-foreground">
              Nenhum agendamento dispara até você retomar. “Executar agora” continua funcionando e a configuração é mantida.
            </span>
          </p>
        </div>
      )}

      {!podeEditar && (
        <p className="flex items-center gap-2 text-caption text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          {podeOperar
            ? "Seu papel permite executar automações, mas não alterar horários e parâmetros."
            : "Seu papel permite apenas visualizar as automações."}
        </p>
      )}

      {agendamentos.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhuma automação cadastrada"
          description="As automações padrão são criadas pela migration do módulo. Verifique se o banco está atualizado."
        />
      ) : (
        <div className="space-y-4">
          {agendamentos.map((a) => (
            <CardAgendamento
              key={a.id}
              a={a}
              tz={tz}
              pausado={automacao.pausado}
              podeOperar={podeOperar}
              podeEditar={podeEditar}
              historico={a.id === historicoParam ? historico ?? [] : null}
              hrefHistorico={
                a.id === historicoParam ? `/ml/automacoes#agendamento-${a.id}` : `/ml/automacoes?historico=${a.id}#agendamento-${a.id}`
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
