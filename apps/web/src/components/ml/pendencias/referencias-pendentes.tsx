"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, ImagePlus, Package } from "lucide-react";
import { importarImagens } from "@/app/ml/(painel)/criativos/actions-v2";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import { StatusBadge } from "@/components/ml/status";
import { Button } from "@/components/ui/button";

export interface ProdutoSemReferencia {
  id: string;
  title: string;
  thumbnail: string | null;
  status: string;
  media_count: number;
}

/** "Selecionar referência do produto" (V2 §12): sem referência principal não há família de criativos. */
export function ReferenciasPendentes({ produtos, podeOperar }: { produtos: ProdutoSemReferencia[]; podeOperar: boolean }) {
  const [jobs, setJobs] = useState<Record<string, string>>({});
  return (
    <ul className="space-y-2">
      {produtos.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card">
            {p.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnail} alt={p.title} loading="lazy" className="absolute inset-0 size-full object-contain" />
            ) : (
              <Package className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/ml/produtos/${p.id}`} className="line-clamp-1 text-body-sm font-medium hover:underline">
              {p.title}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              <StatusBadge tipo="product" status={p.status} className="px-2 py-0" />
              <span className="tabular">{p.media_count ? `${p.media_count} imagem(ns) do anúncio importada(s)` : "Nenhuma imagem do anúncio importada"}</span>
            </div>
            {jobs[p.id] && (
              <div className="mt-1.5">
                <JobStatus jobId={jobs[p.id]!} compacto />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {podeOperar && p.media_count === 0 && (
              <AcaoBotao
                size="sm"
                variant="secondary"
                acao={() => importarImagens(p.id)}
                semRefresh
                aoConcluir={(r) => typeof r.jobId === "string" && setJobs((j) => ({ ...j, [p.id]: r.jobId as string }))}
              >
                <Download /> Importar imagens
              </AcaoBotao>
            )}
            <Button asChild size="sm" variant={p.media_count ? "tech" : "ghost"}>
              <Link href={`/ml/produtos/${p.id}#imagens`}>
                <ImagePlus /> Selecionar referência <ArrowRight />
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
