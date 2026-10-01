"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, Workflow } from "lucide-react";
import { toast } from "sonner";
import { executarDescobertaAgora, processarPendencias } from "@/app/ml/actions";
import { JobStatus } from "@/components/ml/job-status";
import { PausaGlobalBotao } from "@/components/ml/automacoes/pausa-global";
import { Button } from "@/components/ui/button";

type Acompanhado = { rotulo: string; jobId: string };

/**
 * Botões do Dashboard (spec §6). "Executar descoberta agora" só pede
 * confirmação quando já existe uma descoberta idêntica em execução.
 */
export function AcoesDashboard({
  podeOperar,
  podeAdministrar,
  pausado,
}: {
  podeOperar: boolean;
  podeAdministrar: boolean;
  pausado: boolean;
}) {
  const router = useRouter();
  const [acompanhando, setAcompanhando] = useState<Acompanhado | null>(null);
  const [descobrindo, iniciarDescoberta] = useTransition();
  const [processando, iniciarProcessamento] = useTransition();

  if (!podeOperar && !podeAdministrar) return null;

  const descobrir = () =>
    iniciarDescoberta(async () => {
      let r = await executarDescobertaAgora();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if ("jaAtiva" in r && r.jaAtiva) {
        const continuar = window.confirm(
          "Já existe uma descoberta em execução. Iniciar outra mesmo assim?\n\nCancelar = continuar acompanhando a atual.",
        );
        if (!continuar) {
          setAcompanhando({ rotulo: "Descoberta", jobId: r.jobId });
          return;
        }
        r = await executarDescobertaAgora(true);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      if (r.mensagem) toast.success(r.mensagem);
      setAcompanhando({ rotulo: "Descoberta", jobId: r.jobId });
      router.refresh();
    });

  const processar = () =>
    iniciarProcessamento(async () => {
      const r = await processarPendencias();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.mensagem) toast.success(r.mensagem);
      if (r.jobId) setAcompanhando({ rotulo: "Processamento", jobId: r.jobId });
      router.refresh();
    });

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {podeOperar && (
          <>
            <Button size="sm" variant="tech" onClick={descobrir} disabled={descobrindo} aria-busy={descobrindo}>
              {descobrindo ? <Loader2 className="animate-spin" /> : <Radar />}
              Executar descoberta agora
            </Button>
            <Button size="sm" variant="secondary" onClick={processar} disabled={processando} aria-busy={processando}>
              {processando ? <Loader2 className="animate-spin" /> : <Workflow />}
              Processar pendências
            </Button>
          </>
        )}
        {podeAdministrar && <PausaGlobalBotao pausado={pausado} />}
      </div>
      {acompanhando && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-caption">
          <span className="font-medium">{acompanhando.rotulo}:</span>
          <JobStatus key={acompanhando.jobId} jobId={acompanhando.jobId} compacto />
        </div>
      )}
    </div>
  );
}
