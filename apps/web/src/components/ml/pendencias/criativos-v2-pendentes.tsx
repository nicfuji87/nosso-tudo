"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Columns2, Pencil, RefreshCw, Type } from "lucide-react";
import { regerarCena, regerarPacote } from "@/app/ml/(painel)/criativos/actions-v2";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import { StatusBadge } from "@/components/ml/status";
import { Button } from "@/components/ui/button";
import { MiniaturaCriativo } from "@/components/ml/criativos/card-criativo";
import { FidelidadeBadge, PacoteBadge, labelTipoVisual } from "@/components/ml/criativos/detalhes-v2";
import { DialogosV2 } from "@/components/ml/criativos/dialogos-v2";
import { editavel, type CriativoView, type DialogoV2 } from "@/components/ml/criativos/rotulos";

function Cabecalho({ c }: { c: CriativoView }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="line-clamp-1 text-caption text-muted-foreground">{c.produto?.title ?? "Produto"}</p>
      <Link href={`/ml/criativos?criativo=${c.id}`} className="line-clamp-1 text-body-sm font-medium hover:underline">
        {c.headline || c.title || labelTipoVisual(c.visual_type)}
      </Link>
      <p className="text-caption text-muted-foreground">
        {labelTipoVisual(c.visual_type)}
        {c.cena ? ` · ${c.cena}` : ""}
      </p>
    </div>
  );
}

/** "Criativo com baixa fidelidade" (V2 §12): lado a lado, checklist e regerar cena sem sair da Central. */
export function FidelidadePendente({ criativos, podeOperar }: { criativos: CriativoView[]; podeOperar: boolean }) {
  const [dialogo, setDialogo] = useState<{ id: string; d: DialogoV2 } | null>(null);
  const atual = dialogo ? criativos.find((c) => c.id === dialogo.id) ?? null : null;
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {criativos.map((c) => {
          const manual = c.image_mode === "manual_chatgpt" || c.image_mode === "upload";
          const pode = podeOperar && editavel(c.status);
          return (
            <li key={c.id} className="flex gap-3 rounded-xl border border-border/70 p-3">
              <button type="button" onClick={() => setDialogo({ id: c.id, d: "lado" })} className="shrink-0" aria-label="Ver referência lado a lado">
                <MiniaturaCriativo c={c} className="aspect-[2/3] w-20 rounded-lg border border-border/70" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Cabecalho c={c} />
                <div className="flex flex-wrap gap-1.5">
                  <FidelidadeBadge status={c.fidelity_status} score={c.fidelity_score} className="px-2 py-0.5" />
                  <StatusBadge tipo="creative" status={c.status} className="px-2 py-0.5" />
                </div>
                {(c.fidelity_ia?.problemas.length || c.fidelity_ia?.resumo) && (
                  <p className="flex gap-1 text-caption text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{c.fidelity_ia.problemas[0] ?? c.fidelity_ia.resumo}</span>
                  </p>
                )}
                {c.fidelity_humano?.nota && <p className="line-clamp-2 text-caption text-muted-foreground">Nota: “{c.fidelity_humano.nota}”</p>}
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setDialogo({ id: c.id, d: "lado" })}>
                    <Columns2 /> Lado a lado
                  </Button>
                  {pode && c.asset && (
                    <Button size="sm" variant="tech" onClick={() => setDialogo({ id: c.id, d: "fidelidade" })}>
                      <BadgeCheck /> Revisar fidelidade
                    </Button>
                  )}
                  {pode && !manual && (
                    <AcaoBotao size="sm" variant="ghost" acao={() => regerarCena(c.id)}>
                      <RefreshCw /> Regerar cena
                    </AcaoBotao>
                  )}
                  {pode && manual && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/ml/criativos?criativo=${c.id}`}>
                        <Pencil /> Enviar nova imagem
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {atual && dialogo && (
        <DialogosV2
          key={`${atual.id}-${dialogo.d}`}
          c={atual}
          dialogo={dialogo.d}
          aoFechar={() => setDialogo(null)}
          aoTrocar={(d) => setDialogo({ id: atual.id, d })}
          podeOperar={podeOperar}
        />
      )}
    </>
  );
}

/** "Pacote Pinterest incompleto" (V2 §12): aprovado, mas sem tudo que a API precisa. */
export function PacotesPendentes({ criativos, podeOperar }: { criativos: CriativoView[]; podeOperar: boolean }) {
  const [jobs, setJobs] = useState<Record<string, string>>({});
  return (
    <ul className="space-y-2.5">
      {criativos.map((c) => (
        <li key={c.id} className="flex flex-wrap gap-3 rounded-xl border border-border/70 p-3">
          <MiniaturaCriativo c={c} className="aspect-[2/3] w-12 shrink-0 rounded-md border border-border/70" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Cabecalho c={c} />
            <PacoteBadge status={c.package_status} erros={c.package_errors} className="px-2 py-0.5" />
            {c.package_errors.length > 0 && (
              <ul className="space-y-0.5 text-caption text-muted-foreground">
                {c.package_errors.slice(0, 4).map((e, i) => (
                  <li key={`${e.campo}-${i}`}>• {e.mensagem}</li>
                ))}
                {c.package_errors.length > 4 && <li>+ {c.package_errors.length - 4}</li>}
              </ul>
            )}
            {jobs[c.id] && <JobStatus jobId={jobs[c.id]!} compacto />}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-center">
            <Button asChild size="sm" variant="tech">
              <Link href={`/ml/criativos?criativo=${c.id}`}>
                <Pencil /> Editar pacote
              </Link>
            </Button>
            {podeOperar && (
              <AcaoBotao
                size="sm"
                variant="secondary"
                acao={() => regerarPacote(c.id)}
                aoConcluir={(r) => typeof r.jobId === "string" && setJobs((j) => ({ ...j, [c.id]: r.jobId as string }))}
              >
                <Type /> Regerar copy
              </AcaoBotao>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
