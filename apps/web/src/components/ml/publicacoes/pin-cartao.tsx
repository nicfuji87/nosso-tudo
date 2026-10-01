"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, FlaskConical, LayoutGrid, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ml/status";
import { Checkbox } from "@/components/ml/campos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { PinAcoes } from "./pin-acoes";
import { PinThumb } from "./thumb";
import { encurtarUrl, type BoardOpcao, type PinView } from "./tipos";
import { ValidacaoBadges } from "./validacao";

/** Rótulo de horário: publicado em / agendado para. */
export function HorarioPin({ pin, tz }: { pin: PinView; tz: string }) {
  if (pin.published_at)
    return (
      <span className="tabular">
        Publicado {formatarNoFuso(pin.published_at, tz, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  if (pin.scheduled_at)
    return (
      <span className="tabular">
        {pin.status === "scheduled" || pin.status === "publishing" ? "Agendado" : "Horário"}{" "}
        {formatarNoFuso(pin.scheduled_at, tz, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  return <span className="text-muted-foreground">Sem horário</span>;
}

export function PinCartao({
  pin,
  boards,
  tz,
  podeOperar,
  hrefDetalhe,
  selecionado,
  onSelecionar,
}: {
  pin: PinView;
  boards: BoardOpcao[];
  tz: string;
  podeOperar: boolean;
  hrefDetalhe: string;
  selecionado?: boolean;
  onSelecionar?: (v: boolean) => void;
}) {
  const titulo = pin.title || pin.creative?.headline || "Pin sem título";
  return (
    <article
      className={cn(
        "flex gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card transition-colors sm:gap-4 sm:p-4",
        selecionado && "border-tech/60 bg-tech/5",
      )}
    >
      {onSelecionar && (
        <div className="pt-1">
          <Checkbox checked={Boolean(selecionado)} onChange={(e) => onSelecionar(e.target.checked)} aria-label={`Selecionar ${titulo}`} />
        </div>
      )}
      <Link href={hrefDetalhe} scroll={false} className="shrink-0" aria-label={`Abrir detalhes de ${titulo}`}>
        <PinThumb pin={pin} className="w-16 sm:w-20" />
      </Link>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
          <StatusBadge tipo="pin" status={pin.status} />
          {pin.environment === "sandbox" && (
            <Badge variant="warning" title="Criado no sandbox do Pinterest — não aparece no perfil público.">
              <FlaskConical className="size-3.5" aria-hidden />
              Sandbox
            </Badge>
          )}
          <span className="text-muted-foreground">
            <HorarioPin pin={pin} tz={tz} />
          </span>
        </div>

        <div className="min-w-0">
          <Link href={hrefDetalhe} scroll={false} className="line-clamp-1 text-body-sm font-semibold hover:underline">
            {titulo}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
            {pin.product && (
              <Link href={`/ml/produtos/${pin.product.id}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground">
                <Package className="size-3.5 shrink-0" aria-hidden />
                <span className="line-clamp-1 max-w-[18rem]">{pin.product.title}</span>
              </Link>
            )}
            <span className="inline-flex items-center gap-1">
              <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
              {pin.board?.name ?? <span className="text-warning">sem board</span>}
            </span>
            {pin.link_url ? (
              <a
                href={pin.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
                title={pin.link_url}
              >
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{encurtarUrl(pin.link_url, 40)}</span>
              </a>
            ) : (
              <span className="text-warning">sem link de afiliado</span>
            )}
          </div>
        </div>

        <ValidacaoBadges itens={pin.validacao} />

        {pin.last_error && pin.status !== "published" && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-caption text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-3">{pin.last_error}</span>
          </p>
        )}

        <PinAcoes pin={pin} boards={boards} tz={tz} podeOperar={podeOperar} />
      </div>
    </article>
  );
}
