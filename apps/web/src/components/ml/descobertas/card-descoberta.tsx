"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  ImageIcon,
  ImageOff,
  Images,
  Layers,
  Loader2,
  Minus,
  MoreHorizontal,
  RefreshCw,
  Star,
  ThumbsUp,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { reanalisarProdutos } from "@/app/ml/(painel)/produtos/actions";
import { aprovarUm } from "@/components/ml/produtos/acoes-cliente";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Checkbox } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { ScoreBadge, StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { brl, nota, numero, ORIGEM_LABEL } from "@/components/ml/produtos/formato";
import type { ItemDescoberta, QualidadeImagem } from "./tipos";

const APROVAVEIS = ["discovered", "analyzed", "paused"];

export function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground" title="Sem variação no ranking">
        <Minus className="size-3" aria-hidden />
        <span className="sr-only">estável</span>
      </span>
    );
  const subiu = delta > 0;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 font-medium tabular", subiu ? "text-success" : "text-destructive")}
      title={subiu ? `Subiu ${delta} posições` : `Caiu ${Math.abs(delta)} posições`}
    >
      {subiu ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {Math.abs(delta)}
      <span className="sr-only">{subiu ? "posições acima" : "posições abaixo"}</span>
    </span>
  );
}

export function CardDescoberta({
  item,
  selecionado,
  aoSelecionar,
  aoDescartar,
  podeOperar,
}: {
  item: ItemDescoberta;
  selecionado: boolean;
  aoSelecionar: (v: boolean) => void;
  aoDescartar: () => void;
  podeOperar: boolean;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [reanalisando, iniciar] = useTransition();
  const href = `/ml/produtos/${item.id}`;
  const temDesconto = item.desconto != null && item.desconto > 0 && item.precoOriginal != null;

  function reanalisar() {
    iniciar(async () => {
      const r = await reanalisarProdutos([item.id]);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      if (r.jobId) setJobId(r.jobId);
    });
  }

  return (
    <article
      className={cn(
        "flex w-full gap-3 rounded-xl border bg-card p-3 shadow-card transition-colors sm:flex-col sm:gap-0 sm:overflow-hidden sm:p-0",
        selecionado ? "border-tech ring-1 ring-tech/40" : "border-border/70",
      )}
    >
      <Link
        href={href}
        className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-white sm:aspect-square sm:size-auto sm:w-full sm:rounded-none sm:border-b sm:border-border/70"
        aria-label={`Ver detalhes de ${item.titulo}`}
      >
        {item.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagens remotas do Mercado Livre
          <img src={item.thumb} alt={item.titulo} loading="lazy" className="size-full object-contain p-1 sm:p-4" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="sr-only">Sem imagem</span>
          </span>
        )}
        {item.rank != null && (
          <span className="absolute left-1.5 top-1.5 hidden rounded-full bg-card/90 px-2 py-0.5 text-caption font-semibold shadow-sm tabular sm:inline-flex sm:items-center sm:gap-1">
            #{item.rank} <RankDelta delta={item.rankDelta} />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <label className="flex min-w-0 items-center gap-2">
            {podeOperar && (
              <Checkbox
                checked={selecionado}
                onChange={(e) => aoSelecionar(e.target.checked)}
                aria-label={`Selecionar ${item.titulo}`}
              />
            )}
            <span className="truncate text-caption text-muted-foreground">{item.categoria ?? "Sem categoria"}</span>
          </label>
          <ScoreBadge score={item.score} confianca={item.confianca} className="shrink-0" />
        </div>

        <Link href={href} className="line-clamp-2 text-body-sm font-medium leading-snug hover:underline">
          {item.titulo}
        </Link>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-body font-semibold tabular">{brl(item.preco)}</span>
          {temDesconto && (
            <>
              <span className="text-caption text-muted-foreground line-through tabular">{brl(item.precoOriginal)}</span>
              <span className="text-caption font-semibold text-success tabular">−{Math.round(item.desconto ?? 0)}%</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {item.rank != null && (
            <span className="inline-flex items-center gap-1 sm:hidden">
              <span className="font-medium text-foreground tabular">#{item.rank}</span>
              <RankDelta delta={item.rankDelta} />
            </span>
          )}
          {item.rating != null ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-current text-warning" aria-hidden />
              <span className="font-medium text-foreground tabular">{nota(item.rating)}</span>
              <span className="tabular">({numero(item.reviews)})</span>
            </span>
          ) : (
            <span>Sem avaliações</span>
          )}
          {item.disponivel === false && <span className="font-medium text-destructive">Indisponível</span>}
          {item.status !== "analyzed" && <StatusBadge tipo="product" status={item.status} className="px-2 py-0" />}
        </div>

        {(item.origens.length > 0 || item.tendencias.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {item.origens.map((o) => (
              <Badge key={o} variant="outline" className="px-2 py-0 text-caption">
                {ORIGEM_LABEL[o] ?? o}
              </Badge>
            ))}
            {item.tendencias.slice(0, 3).map((t) => (
              <Badge key={t} variant="tech" className="max-w-[12rem] px-2 py-0 text-caption">
                <TrendingUp className="size-3" aria-hidden />
                <span className="truncate">{t}</span>
              </Badge>
            ))}
            {item.tendencias.length > 3 && (
              <span className="text-caption text-muted-foreground">+{item.tendencias.length - 3}</span>
            )}
          </div>
        )}

        <IndicadoresVisuais item={item} />

        {(item.porque.length > 0 || item.alertas.length > 0 || item.regrasDuras.length > 0) && (
          <div className="space-y-1 rounded-lg bg-secondary/50 p-2.5">
            {item.porque.length > 0 && (
              <>
                <p className="text-overline uppercase tracking-wide text-muted-foreground">Por que recomendamos</p>
                <ul className="space-y-0.5">
                  {item.porque.map((p, i) => (
                    <li key={i} className={cn("flex gap-1.5 text-caption", i > 0 && "hidden sm:flex")}>
                      <ThumbsUp className="mt-0.5 size-3 shrink-0 text-success" aria-hidden />
                      <span className="line-clamp-2">{p}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {[...item.regrasDuras, ...item.alertas].slice(0, 2).map((a, i) => (
              <p key={`a${i}`} className="flex gap-1.5 text-caption text-warning">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span className="line-clamp-2">{a}</span>
              </p>
            ))}
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          Descoberto {item.descobertoEm} · {item.repeticao}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {podeOperar && (
            <>
              <AcaoBotao
                size="sm"
                variant="tech"
                acao={() => aprovarUm(item.id)}
                disabled={!APROVAVEIS.includes(item.status)}
                title={APROVAVEIS.includes(item.status) ? undefined : "Aguarde a análise terminar"}
              >
                <Check /> Aprovar
              </AcaoBotao>
              <Button size="sm" variant="outline" onClick={aoDescartar}>
                <X /> Descartar
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Mais ações" disabled={reanalisando}>
                {reanalisando ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={href}>
                  <Eye className="size-4" /> Ver detalhes
                </Link>
              </DropdownMenuItem>
              {podeOperar && (
                <DropdownMenuItem onSelect={reanalisar}>
                  <RefreshCw className="size-4" /> Reanalisar
                </DropdownMenuItem>
              )}
              {item.permalink && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" /> Abrir no Mercado Livre
                    </a>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {jobId && <JobStatus jobId={jobId} compacto />}
      </div>
    </article>
  );
}

const NIVEL_LABEL: Record<QualidadeImagem["nivel"], string> = { alta: "alta", media: "média", baixa: "baixa" };

/** Indicadores da V2 (§11.2): imagens disponíveis, qualidade da principal, potencial lifestyle e família ativa. */
function IndicadoresVisuais({ item }: { item: ItemDescoberta }) {
  const q = item.qualidadeImagem;
  const fit = item.potencialLifestyle != null ? Math.max(0, Math.min(100, Math.round(item.potencialLifestyle))) : null;
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 px-2.5 py-2 text-caption" aria-label="Indicadores visuais">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1" title="Imagens disponíveis no anúncio">
          <Images className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-medium tabular">{item.imagens}</span>
          <span className="text-muted-foreground">imagem{item.imagens === 1 ? "" : "ns"}</span>
        </span>
        <span
          className="inline-flex items-center gap-1"
          title={q ? `Qualidade da imagem principal — ${q.detalhe}${q.fonte === "resolucao" ? " (pela resolução)" : ""}` : "Sem dados de qualidade"}
        >
          <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Qualidade</span>
          <span
            className={cn(
              "font-medium",
              q?.nivel === "alta" ? "text-success" : q?.nivel === "media" ? "text-foreground" : q?.nivel === "baixa" ? "text-warning" : "text-muted-foreground",
            )}
          >
            {q ? NIVEL_LABEL[q.nivel] : "—"}
          </span>
        </span>
        {item.familiaAtiva && (
          <Badge variant="tech" className="px-2 py-0 text-caption">
            <Layers className="size-3" aria-hidden /> Família ativa
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2" title="Potencial de uso em cenas lifestyle (Pinterest fit)">
        <span className="shrink-0 text-muted-foreground">Lifestyle</span>
        <span
          className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
          role="meter"
          aria-label="Potencial lifestyle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fit ?? undefined}
          aria-valuetext={fit != null ? `${fit} de 100` : "sem dados"}
        >
          {fit != null && (
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", fit >= 70 ? "bg-success" : fit >= 45 ? "bg-tech" : "bg-warning")}
              style={{ width: `${fit}%` }}
            />
          )}
        </span>
        <span className="w-9 shrink-0 text-right font-medium tabular">{fit != null ? fit : "—"}</span>
      </div>
    </div>
  );
}
