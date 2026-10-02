import Link from "next/link";
import { Ban, RotateCcw } from "lucide-react";
import { reprocessar, cancelar } from "@/app/ml/(painel)/automacoes/actions";
import { StatusBadge } from "@/components/ml/status";
import { AcaoComJob } from "./acao-com-job";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Badge } from "@/components/ui/badge";
import { formatarDuracao, idCurto, OUTCOME_LABEL, TRIGGER_LABEL, truncarTexto } from "@/components/ml/logs/formatos";
import { formatarNoFuso } from "@/lib/ml/tempo";

export interface ExecucaoHistorico {
  id: string;
  trigger: string;
  outcome: string;
  note: string | null;
  created_at: string;
  job: {
    id: string;
    status: string;
    attempts: number;
    max_attempts: number;
    duration_ms: number | null;
    last_error: string | null;
  } | null;
  job_id: string | null;
}

const TOM_OUTCOME: Record<string, "default" | "warning" | "destructive" | "outline" | "tech"> = {
  enqueued: "tech",
  queued_behind: "tech",
  canceled_previous: "warning",
  skipped_overlap: "warning",
  skipped_paused: "outline",
  error: "destructive",
};

/** Últimas execuções de uma automação (disparos + job resultante). */
export function HistoricoExecucoes({
  execucoes,
  tz,
  podeOperar,
}: {
  execucoes: ExecucaoHistorico[];
  tz: string;
  podeOperar: boolean;
}) {
  if (execucoes.length === 0) {
    return <p className="py-4 text-center text-caption text-muted-foreground">Nenhuma execução registrada ainda.</p>;
  }
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-caption">
        <thead className="text-overline uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border/70">
            <th className="px-2 py-2 font-medium">Quando</th>
            <th className="px-2 py-2 font-medium">Gatilho</th>
            <th className="px-2 py-2 font-medium">Disparo</th>
            <th className="px-2 py-2 font-medium">Job</th>
            <th className="px-2 py-2 font-medium">Tent.</th>
            <th className="px-2 py-2 font-medium">Duração</th>
            <th className="px-2 py-2 font-medium">Observação</th>
            <th className="px-2 py-2 font-medium sr-only">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {execucoes.map((e) => {
            const j = e.job;
            const podeReprocessar = j && ["failed", "dead", "canceled"].includes(j.status);
            const podeCancelar = j && ["queued", "running"].includes(j.status);
            const obs = j?.last_error && j.status !== "succeeded" ? j.last_error : e.note;
            return (
              <tr key={e.id} className="align-top">
                <td className="tabular whitespace-nowrap px-2 py-2">{formatarNoFuso(e.created_at, tz)}</td>
                <td className="px-2 py-2">
                  <Badge variant={e.trigger === "manual" ? "accent" : "default"} size="sm">
                    {TRIGGER_LABEL[e.trigger] ?? e.trigger}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  <Badge variant={TOM_OUTCOME[e.outcome] ?? "default"} size="sm" className="normal-case">
                    {OUTCOME_LABEL[e.outcome] ?? e.outcome}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  {j ? (
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tipo="job" status={j.status} />
                      <Link href={`/ml/logs?job=${j.id}`} className="font-mono text-muted-foreground hover:text-foreground hover:underline">
                        {idCurto(j.id)}
                      </Link>
                    </div>
                  ) : e.job_id ? (
                    <span className="font-mono text-muted-foreground">{idCurto(e.job_id)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="tabular px-2 py-2">{j ? `${j.attempts}/${j.max_attempts}` : "—"}</td>
                <td className="tabular whitespace-nowrap px-2 py-2">{formatarDuracao(j?.duration_ms)}</td>
                <td className="max-w-[260px] px-2 py-2 text-muted-foreground" title={obs ?? undefined}>
                  {obs ? truncarTexto(obs, 140) : "—"}
                </td>
                <td className="px-2 py-2">
                  {podeOperar && j && (podeReprocessar || podeCancelar) && (
                    <div className="flex justify-end">
                      {podeReprocessar && (
                        <AcaoComJob size="sm" variant="ghost" acao={reprocessar.bind(null, j.id)} className="items-end">
                          <RotateCcw /> Executar novamente
                        </AcaoComJob>
                      )}
                      {podeCancelar && (
                        <AcaoBotao size="sm" variant="ghost" acao={cancelar.bind(null, j.id)} confirmar="Cancelar este job?">
                          <Ban /> Cancelar
                        </AcaoBotao>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
