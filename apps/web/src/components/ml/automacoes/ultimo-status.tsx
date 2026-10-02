import { AlertTriangle, CircleDashed, PauseCircle, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ml/status";
import { JOB_STATUS_LABEL } from "@/lib/ml/jobs/tipos";
import { OUTCOME_LABEL } from "@/components/ml/logs/formatos";

/**
 * Último status de uma automação: ou é o status do job (na fila, concluído,
 * falhou…) ou o resultado do disparo (pulado por sobreposição/pausa, erro).
 */
export function UltimoStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline">
        <CircleDashed className="size-3.5" aria-hidden /> Nunca executou
      </Badge>
    );
  }
  if (status in JOB_STATUS_LABEL) return <StatusBadge tipo="job" status={status} />;
  if (status === "skipped_paused") {
    return (
      <Badge variant="outline">
        <PauseCircle className="size-3.5" aria-hidden /> {OUTCOME_LABEL[status]}
      </Badge>
    );
  }
  if (status === "skipped_overlap") {
    return (
      <Badge variant="warning">
        <SkipForward className="size-3.5" aria-hidden /> {OUTCOME_LABEL[status]}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="size-3.5" aria-hidden /> {OUTCOME_LABEL[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="default">
      <CircleDashed className="size-3.5" aria-hidden /> {OUTCOME_LABEL[status] ?? status}
    </Badge>
  );
}
