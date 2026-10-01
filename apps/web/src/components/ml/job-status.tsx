"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { statusJob } from "@/app/ml/actions";
import { StatusBadge } from "./status";

type Estado = Awaited<ReturnType<typeof statusJob>>;
const FINAIS = ["succeeded", "dead", "canceled"];

/**
 * Acompanha um job assíncrono (spec §25: "progresso, nunca spinner infinito").
 * Mostra status, tentativas e erro; ao terminar atualiza a página.
 */
export function JobStatus({ jobId, compacto, aoTerminar }: { jobId: string; compacto?: boolean; aoTerminar?: (status: string) => void }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const avisado = useRef(false);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await statusJob(jobId);
      if (!vivo) return;
      setEstado(r);
      const st = r.ok ? r.job.status : null;
      if (st && FINAIS.includes(st)) {
        if (!avisado.current) {
          avisado.current = true;
          if (st === "succeeded") toast.success(`${r.ok ? r.job.label : "Tarefa"} concluída.`);
          else if (st === "dead") toast.error(`${r.ok ? r.job.label : "Tarefa"} falhou: ${r.ok ? r.job.last_error ?? "" : ""}`);
          aoTerminar?.(st);
          router.refresh();
        }
        return;
      }
      timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [jobId, router, aoTerminar]);

  if (!estado) return <span className="text-caption text-muted-foreground">Consultando…</span>;
  if (!estado.ok) return <span className="text-caption text-destructive">{estado.error}</span>;
  const { job, filhos } = estado;
  const totalFilhos = Object.values(filhos).reduce((a, b) => a + b, 0);
  const feitos = (filhos.succeeded ?? 0) + (filhos.dead ?? 0) + (filhos.canceled ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption" aria-live="polite">
      <StatusBadge tipo="job" status={job.status} />
      {!compacto && <span className="text-muted-foreground">{job.label}</span>}
      {totalFilhos > 0 && (
        <span className="text-muted-foreground">
          {feitos}/{totalFilhos} etapas
        </span>
      )}
      {job.status === "queued" && job.attempts > 0 && (
        <span className="text-muted-foreground">tentativa {job.attempts + 1} de {job.max_attempts}</span>
      )}
      {job.last_error && job.status !== "succeeded" && <span className="text-warning">{job.last_error}</span>}
    </div>
  );
}
