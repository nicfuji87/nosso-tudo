"use client";

import { useState } from "react";
import { AcaoBotao, type RespostaAcao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import type { ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botão de Server Action que, quando a ação devolve `jobId`, passa a
 * acompanhar o job (spec §25: toda ação longa vira job com progresso).
 * `acao` deve ser uma Server Action (pode vir com `.bind(null, id)` do servidor).
 */
export function AcaoComJob({
  acao,
  children,
  confirmar,
  className,
  classeStatus,
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  acao: () => Promise<RespostaAcao>;
  children: React.ReactNode;
  confirmar?: string;
  classeStatus?: string;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <AcaoBotao
        {...props}
        acao={acao}
        confirmar={confirmar}
        aoConcluir={(r) => {
          if (typeof r.jobId === "string") setJobId(r.jobId);
        }}
      >
        {children}
      </AcaoBotao>
      {jobId && (
        <div className={classeStatus}>
          <JobStatus key={jobId} jobId={jobId} compacto />
        </div>
      )}
    </div>
  );
}
