"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Layers, Loader2, Radar, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { executarDescobertaAgora, processarPendencias } from "@/app/ml/actions";
import { gerarLotesElegiveis } from "@/app/ml/(painel)/criativos/actions-v2";
import { JobStatus } from "@/components/ml/job-status";
import { PausaGlobalBotao } from "@/components/ml/automacoes/pausa-global";
import { Button } from "@/components/ui/button";

/** Quantos produtos elegíveis entram por clique em "Gerar lote" (o servidor aceita 1–20). */
const LIMITE_LOTE = 5;

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
  const [gerando, iniciarGeracao] = useTransition();
  const [resultadoLote, setResultadoLote] = useState<{ ok: boolean; texto: string } | null>(null);

  const gerarLote = () => {
    if (
      !window.confirm(
        `Gerar lotes de criativos para até ${LIMITE_LOTE} produtos elegíveis?

` +
          "Só entram produtos prontos para criativo, com imagem de referência aprovada e sem família em teste. " +
          "Cada lote respeita o limite de custo por lote configurado em Criativos V2.",
      )
    )
      return;
    iniciarGeracao(async () => {
      const r = await gerarLotesElegiveis(LIMITE_LOTE);
      if (!r.ok) {
        toast.error(r.error);
        setResultadoLote({ ok: false, texto: r.error });
        return;
      }
      const texto = typeof r.mensagem === "string" ? r.mensagem : "Lotes enfileirados.";
      toast.success(texto);
      setResultadoLote({ ok: true, texto });
      router.refresh();
    });
  };

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
            <Button
              size="sm"
              variant="secondary"
              onClick={gerarLote}
              disabled={gerando}
              aria-busy={gerando}
              title="Cria famílias de criativos só para produtos com imagem de referência aprovada, dentro do limite de custo por lote."
            >
              {gerando ? <Loader2 className="animate-spin" /> : <Layers />}
              Gerar lote dos produtos elegíveis
            </Button>
          </>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href="/ml/pendencias">
            <Inbox />
            Abrir pendências
          </Link>
        </Button>
        {podeAdministrar && <PausaGlobalBotao pausado={pausado} />}
      </div>
      {resultadoLote && (
        <div
          className={
            resultadoLote.ok
              ? "flex max-w-md items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-1.5 text-caption"
              : "flex max-w-md items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-caption text-destructive"
          }
          role="status"
        >
          <span className="min-w-0 flex-1">
            <span className="font-medium">Gerar lote:</span> {resultadoLote.texto}
            {resultadoLote.ok && (
              <span className="block text-muted-foreground">
                Só produtos com referência aprovada e dentro do limite de custo do lote.{" "}
                <Link href="/ml/criativos" className="text-tech underline-offset-2 hover:underline">
                  Ver criativos
                </Link>
              </span>
            )}
          </span>
          <button type="button" onClick={() => setResultadoLote(null)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {acompanhando && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-caption">
          <span className="font-medium">{acompanhando.rotulo}:</span>
          <JobStatus key={acompanhando.jobId} jobId={acompanhando.jobId} compacto />
        </div>
      )}
    </div>
  );
}
