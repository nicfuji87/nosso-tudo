"use client";

import { useCallback, useState } from "react";
import { Check, ExternalLink, PauseCircle, PlayCircle, RefreshCw, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import {
  forcarAtualizacao,
  pausarProduto,
  reanalisarProdutos,
  restaurarProduto,
  retomarProduto,
} from "@/app/ml/(painel)/produtos/actions";
import { AcaoBotao, type RespostaAcao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import { Button } from "@/components/ui/button";
import { aprovarUm } from "./acoes-cliente";
import { DescartarDialog } from "./descartar-dialog";

const APROVAVEIS = ["analyzed", "discovered", "paused"];

/** Barra de ações do produto — respeita status e papel (o servidor valida de novo). */
export function AcoesProduto({
  id,
  status,
  permalink,
  podeOperar,
}: {
  id: string;
  status: string;
  permalink: string | null;
  podeOperar: boolean;
}) {
  const [jobs, setJobs] = useState<string[]>([]);
  const [descartar, setDescartar] = useState(false);
  const comJob = useCallback((r: RespostaAcao) => {
    const jobId = typeof r.jobId === "string" ? r.jobId : null;
    if (jobId) setJobs((j) => (j.includes(jobId) ? j : [jobId, ...j].slice(0, 3)));
  }, []);

  const abrirMl = permalink ? (
    <Button asChild variant="secondary" size="sm">
      <a href={permalink} target="_blank" rel="noopener noreferrer">
        <ExternalLink /> Abrir no Mercado Livre
      </a>
    </Button>
  ) : null;

  if (!podeOperar) return <div className="flex flex-wrap gap-2">{abrirMl}</div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {APROVAVEIS.includes(status) && (
          <AcaoBotao size="sm" variant="tech" acao={() => aprovarUm(id)}>
            <Check /> Aprovar
          </AcaoBotao>
        )}
        {status === "rejected" ? (
          <AcaoBotao size="sm" variant="secondary" acao={() => restaurarProduto(id)}>
            <Undo2 /> Restaurar
          </AcaoBotao>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setDescartar(true)}>
            <X /> Descartar
          </Button>
        )}
        {status === "paused" ? (
          <AcaoBotao size="sm" variant="secondary" acao={() => retomarProduto(id)}>
            <PlayCircle /> Retomar
          </AcaoBotao>
        ) : (
          status !== "rejected" && (
            <AcaoBotao
              size="sm"
              variant="outline"
              acao={() => pausarProduto(id)}
              confirmar="Pausar este produto? Pins agendados dele também ficam pausados."
            >
              <PauseCircle /> Pausar
            </AcaoBotao>
          )
        )}
        <AcaoBotao size="sm" variant="outline" acao={() => forcarAtualizacao(id)} aoConcluir={comJob} semRefresh>
          <RefreshCw /> Forçar atualização
        </AcaoBotao>
        <AcaoBotao size="sm" variant="outline" acao={() => reanalisarProdutos([id])} aoConcluir={comJob} semRefresh>
          <Sparkles /> Reanalisar
        </AcaoBotao>
        {abrirMl}
      </div>
      {jobs.length > 0 && (
        <div className="space-y-1 rounded-xl border border-border/70 bg-card px-3 py-2">
          {jobs.map((j) => (
            <JobStatus key={j} jobId={j} />
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
            onClick={() => setJobs([])}
          >
            <RotateCcw className="size-3" aria-hidden /> Limpar acompanhamento
          </button>
        </div>
      )}
      <DescartarDialog ids={[id]} aberto={descartar} aoMudar={setDescartar} />
    </div>
  );
}
