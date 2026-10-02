"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, ArrowRight, CalendarPlus, Copy, ImageOff, Layers, Play } from "lucide-react";
import {
  agendarAprovadosFamilia,
  arquivarFamilia,
  duplicarHipotese,
  gerarLoteFamilia,
} from "@/app/ml/(painel)/criativos/actions-v2";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import { StatusBadge } from "@/components/ml/status";
import { Button } from "@/components/ui/button";
import { TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { FamiliaStatusBadge, FidelidadeBadge, IaBadge, PacoteBadge } from "./badges";
import { labelModoFidelidade, labelTipoVisual, METODO_LABEL, usd, type FamiliaView, type VarianteView } from "./rotulos";
import { WizardLote, type WizardLoteProps } from "./wizard-lote";

const SELO = "px-1.5 py-0 text-[0.7rem] [&_svg]:size-3";

/** Famílias de criativos do produto (V2 §3, §11.3) com variantes e ações de família. */
export function FamiliasProduto({
  familias,
  tz,
  podeOperar,
  wizard,
}: {
  familias: FamiliaView[];
  tz: string;
  podeOperar: boolean;
  wizard: Omit<WizardLoteProps, "aberto" | "aoMudar" | "semGatilho" | "abrirInicial">;
}) {
  const ativas = familias.filter((f) => f.status !== "archived");
  const arquivadas = familias.filter((f) => f.status === "archived");

  if (!familias.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
        <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Layers className="size-5" aria-hidden />
        </div>
        <h3 className="text-body font-semibold">Nenhuma família de criativos ainda</h3>
        <p className="max-w-md text-body-sm text-muted-foreground">
          Uma família reúne várias variantes (lifestyle, com texto, editorial) para a mesma hipótese de marketing, usando as fotos reais do
          anúncio como referência.
        </p>
        {podeOperar && (
          <div className="mt-3">
            <WizardLote {...wizard} rotuloGatilho="Criar família de criativos" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ativas.length === 0 && <p className="text-body-sm text-muted-foreground">Todas as famílias deste produto estão arquivadas.</p>}
      {ativas.map((f) => (
        <CartaoFamilia key={f.id} familia={f} tz={tz} podeOperar={podeOperar} />
      ))}
      {arquivadas.length > 0 && (
        <details className="group rounded-xl border border-border/70">
          <summary className="cursor-pointer list-none px-4 py-3 text-body-sm text-muted-foreground hover:text-foreground">
            <span className="inline-flex items-center gap-2">
              <Archive className="size-4" aria-hidden /> {arquivadas.length} família{arquivadas.length === 1 ? "" : "s"} arquivada
              {arquivadas.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="space-y-3 border-t border-border/70 p-3">
            {arquivadas.map((f) => (
              <CartaoFamilia key={f.id} familia={f} tz={tz} podeOperar={podeOperar} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CartaoFamilia({ familia: f, tz, podeOperar }: { familia: FamiliaView; tz: string; podeOperar: boolean }) {
  const [jobLote, setJobLote] = useState<string | null>(null);
  const aprovadas = f.variantes.filter((v) => v.status === "approved").length;
  const publicadas = f.variantes.filter((v) => v.status === "published").length;
  const emAndamento = f.status === "planning" || f.status === "generating";
  const podeGerarLote = f.status === "planning" && f.variantes.length === 0;
  const arquivada = f.status === "archived";
  const mixTexto = f.mix
    ? TIPOS_VISUAIS.filter((t) => (f.mix?.[t] ?? 0) > 0)
        .map((t) => `${f.mix?.[t] ?? 0} ${labelTipoVisual(t).toLowerCase()}`)
        .join(" · ")
    : null;

  return (
    <article className={cn("rounded-xl border border-border/70 bg-card p-4", arquivada && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold">{f.name}</h3>
            <FamiliaStatusBadge status={f.status} />
          </div>
          {f.hypothesis && <p className="line-clamp-2 text-body-sm">{f.hypothesis}</p>}
          {f.objective && (
            <p className="text-caption text-muted-foreground">
              <span className="font-medium text-foreground">Benefício:</span> {f.objective}
            </p>
          )}
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
            <span>Criada em {formatarNoFuso(f.created_at, tz, { dateStyle: "short", timeStyle: "short" })}</span>
            {mixTexto && <span>· {mixTexto}</span>}
            {f.modo && <span>· {labelModoFidelidade(f.modo)}</span>}
            {f.metodo && <span>· {METODO_LABEL[f.metodo] ?? f.metodo}</span>}
            {f.cost_estimated_usd != null && f.cost_estimated_usd > 0 && <span>· custo est. {usd(f.cost_estimated_usd)}</span>}
            {f.board && <span>· board {f.board}</span>}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-center">
          <Contagem rotulo="Variantes" valor={f.variantes.length} />
          <Contagem rotulo="Aprovadas" valor={aprovadas} />
          <Contagem rotulo="Publicadas" valor={publicadas} />
        </div>
      </div>

      {(emAndamento && f.batch_job_id) || jobLote ? (
        <div className="mt-3 space-y-1 rounded-lg bg-secondary/40 px-3 py-2">
          {emAndamento && f.batch_job_id && <JobStatus jobId={f.batch_job_id} />}
          {jobLote && jobLote !== f.batch_job_id && <JobStatus jobId={jobLote} />}
        </div>
      ) : null}

      {f.variantes.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {f.variantes.map((v) => (
            <li key={v.id}>
              <Variante v={v} familiaId={f.id} />
            </li>
          ))}
        </ul>
      ) : (
        !emAndamento && (
          <p className="mt-3 text-body-sm text-muted-foreground">
            {podeGerarLote ? "Família sem variantes ainda — gere o lote." : "Nenhuma variante nesta família."}
          </p>
        )
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/ml/criativos?familia=${f.id}`}>
            Ver no Criativos <ArrowRight />
          </Link>
        </Button>
        {podeOperar && !arquivada && (
          <>
            {podeGerarLote && (
              <AcaoBotao
                size="sm"
                variant="tech"
                acao={() => gerarLoteFamilia(f.id)}
                aoConcluir={(r) => typeof r.jobId === "string" && setJobLote(r.jobId)}
                semRefresh
              >
                <Play /> Gerar lote
              </AcaoBotao>
            )}
            <AcaoBotao
              size="sm"
              variant="outline"
              acao={() => agendarAprovadosFamilia(f.id)}
              disabled={aprovadas === 0}
              title={aprovadas === 0 ? "Nenhuma variante aprovada ainda" : "Agenda as aprovadas respeitando cooldown e repetição"}
            >
              <CalendarPlus /> Agendar aprovados
            </AcaoBotao>
            <AcaoBotao size="sm" variant="outline" acao={() => duplicarHipotese(f.id)}>
              <Copy /> Duplicar hipótese
            </AcaoBotao>
            <AcaoBotao
              size="sm"
              variant="ghost"
              className="text-destructive"
              acao={() => arquivarFamilia(f.id)}
              confirmar={`Arquivar a família “${f.name}”? Pins ainda não publicados dela serão cancelados.`}
            >
              <Archive /> Arquivar família
            </AcaoBotao>
          </>
        )}
      </div>
    </article>
  );
}

function Variante({ v, familiaId }: { v: VarianteView; familiaId: string }) {
  return (
    <Link href={`/ml/criativos?familia=${familiaId}`} className="group block space-y-1.5" title={v.headline ?? undefined}>
      <div className="aspect-[2/3] overflow-hidden rounded-lg border border-border/70 bg-secondary">
        {v.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem remota do Storage
          <img
            src={v.img}
            alt={`${labelTipoVisual(v.visual_type)}${v.cena ? ` — ${v.cena}` : ""}`}
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-caption text-muted-foreground">
            <ImageOff className="size-5" aria-hidden /> Sem imagem
          </span>
        )}
      </div>
      <p className="truncate text-caption font-medium">{labelTipoVisual(v.visual_type)}</p>
      {v.cena && <p className="-mt-1 truncate text-[0.7rem] text-muted-foreground">{v.cena}</p>}
      <div className="flex flex-wrap gap-1">
        <StatusBadge tipo="creative" status={v.status} className={SELO} />
        <FidelidadeBadge status={v.fidelity_status} className={SELO} />
        <PacoteBadge status={v.package_status} className={SELO} />
        {v.ai_modified && <IaBadge className={SELO} />}
      </div>
    </Link>
  );
}

function Contagem({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="min-w-[3.5rem] rounded-lg bg-secondary/50 px-2 py-1.5">
      <p className="text-h4 font-semibold leading-none tabular">{valor}</p>
      <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{rotulo}</p>
    </div>
  );
}
