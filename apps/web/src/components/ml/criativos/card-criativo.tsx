"use client";

import { ImageOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ml/campos";
import { StatusBadge } from "@/components/ml/status";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { MenuCriativo, type HandlersCriativo } from "./menu-criativo";
import { labelModo, type CriativoView } from "./rotulos";

export function Qualidade({ score, notas }: { score: number | null; notas?: string[] }) {
  if (score == null) return null;
  const tom = score >= 80 ? "success" : score >= 60 ? "tech" : "warning";
  return (
    <Badge variant={tom} className="tabular" title={notas?.length ? notas.join(" · ") : "Score de qualidade"}>
      Q {Math.round(score)}
    </Badge>
  );
}

/** Miniatura do criativo (imagem final, ou placeholder com o status). */
export function MiniaturaCriativo({ c, className }: { c: CriativoView; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-secondary/50", className)}>
      {c.asset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.asset.public_url}
          alt={c.alt_text ?? c.headline ?? "Imagem do criativo"}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-caption text-muted-foreground">
          {c.status === "generating" ? <Loader2 className="size-5 animate-spin text-tech" aria-hidden /> : <ImageOff className="size-5" aria-hidden />}
          <span>{c.status === "generating" ? "Gerando…" : c.status === "waiting_manual_image" ? "Aguardando imagem" : "Sem imagem"}</span>
        </div>
      )}
    </div>
  );
}

/** Card do Kanban (spec §10): imagem, produto, ângulo, headline, formato, board, qualidade, status, data. */
export function CardCriativo({
  c,
  tz,
  selecionado,
  aoSelecionar,
  podeOperar,
  handlers,
}: {
  c: CriativoView;
  tz: string;
  selecionado: boolean;
  aoSelecionar: (id: string, v: boolean) => void;
  podeOperar: boolean;
  handlers: HandlersCriativo;
}) {
  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-card-hover",
        selecionado ? "border-tech ring-2 ring-tech/30" : "border-border/70",
      )}
    >
      <div className="relative">
        <button type="button" className="block w-full text-left" onClick={() => handlers.aoEditar(c.id)} aria-label={`Abrir criativo ${c.headline ?? ""}`}>
          <MiniaturaCriativo c={c} className="aspect-[2/3] w-full" />
        </button>
        {podeOperar && (
          <label className="absolute left-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-lg bg-card/90 shadow-card backdrop-blur">
            <Checkbox checked={selecionado} onChange={(e) => aoSelecionar(c.id, e.target.checked)} aria-label="Selecionar criativo" />
          </label>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          <Qualidade score={c.quality_score} notas={c.quality_notes} />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-caption text-muted-foreground" title={c.produto?.title}>
            {c.produto?.title ?? "Produto"}
          </p>
          <div className="-mr-1.5 -mt-1.5">
            <MenuCriativo c={c} podeOperar={podeOperar} handlers={handlers} />
          </div>
        </div>
        <button type="button" onClick={() => handlers.aoEditar(c.id)} className="block w-full text-left">
          <p className="line-clamp-2 text-body-sm font-semibold leading-snug">{c.headline || c.title || "Sem headline"}</p>
        </button>
        <div className="flex flex-wrap gap-1">
          <StatusBadge tipo="creative" status={c.status} className="px-2 py-0.5" />
          {c.angulo && (
            <Badge variant="outline" className="px-2 py-0.5">
              {labelAngulo(c.angulo)}
            </Badge>
          )}
        </div>
        <p className="text-caption text-muted-foreground">
          {labelModo(c.image_mode)} · {c.format}
          {c.board ? ` · ${c.board}` : ""}
        </p>
        {c.status === "rejected" && c.rejection_reason && <p className="line-clamp-2 text-caption text-destructive">{c.rejection_reason}</p>}
        {c.last_error && c.status !== "published" && <p className="line-clamp-2 text-caption text-warning">{c.last_error}</p>}
        <p className="text-overline text-muted-foreground tabular" title={`Atualizado ${formatarNoFuso(c.updated_at, tz)}`}>
          Criado {formatarNoFuso(c.created_at, tz)}
        </p>
      </div>
    </article>
  );
}
