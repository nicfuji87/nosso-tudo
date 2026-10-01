"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { coletarMetricasAgora } from "@/app/ml/(painel)/analytics/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";

/** "Coletar métricas agora" → job FETCH_PIN_ANALYTICS acompanhado por polling. */
export function ColetarMetricas() {
  const [jobId, setJobId] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {jobId && <JobStatus jobId={jobId} compacto />}
      <AcaoBotao
        variant="outline"
        size="sm"
        acao={coletarMetricasAgora}
        semRefresh
        aoConcluir={(r) => {
          if (typeof r.jobId === "string") setJobId(r.jobId);
        }}
      >
        <RefreshCw />
        Coletar métricas agora
      </AcaoBotao>
    </div>
  );
}
