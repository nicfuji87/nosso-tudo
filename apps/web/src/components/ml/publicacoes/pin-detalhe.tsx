"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ml/status";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { PinAcoes } from "./pin-acoes";
import { PinThumb } from "./thumb";
import { type BoardOpcao, type PinView } from "./tipos";
import { ValidacaoLista } from "./validacao";

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-body-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Detalhe do Pin em painel lateral, aberto por `?pin=<id>` (link compartilhável). */
export function PinDetalhe({
  pin,
  boards,
  tz,
  podeOperar,
  hrefFechar,
}: {
  pin: PinView;
  boards: BoardOpcao[];
  tz: string;
  podeOperar: boolean;
  hrefFechar: string;
}) {
  const router = useRouter();
  const dt = (v: string | null) => formatarNoFuso(v, tz, { dateStyle: "medium", timeStyle: "short" });
  const titulo = pin.title || pin.creative?.headline || "Pin sem título";

  return (
    <Sheet open onOpenChange={(v) => !v && router.replace(hrefFechar, { scroll: false })}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tipo="pin" status={pin.status} />
            {pin.environment === "sandbox" && (
              <Badge variant="warning">
                <FlaskConical className="size-3.5" aria-hidden />
                Sandbox
              </Badge>
            )}
          </div>
          <SheetTitle className="text-left">{titulo}</SheetTitle>
          <SheetDescription className="text-left">
            {pin.product ? (
              <Link href={`/ml/produtos/${pin.product.id}`} className="hover:underline">
                {pin.product.title}
              </Link>
            ) : (
              "Produto não encontrado"
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          <div className="flex gap-4">
            {pin.media_url ? (
              <a href={pin.media_url} target="_blank" rel="noopener noreferrer" className="w-36 shrink-0" title="Abrir imagem">
                <PinThumb pin={pin} className="w-full" />
              </a>
            ) : (
              <PinThumb pin={pin} className="w-36 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <PinAcoes pin={pin} boards={boards} tz={tz} podeOperar={podeOperar} />
              {pin.last_error && pin.status !== "published" && (
                <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-caption text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{pin.last_error}</span>
                </p>
              )}
            </div>
          </div>

          <dl className="divide-y divide-border/60">
            <Linha rotulo="Agendado para">{dt(pin.scheduled_at)}</Linha>
            {pin.published_at && <Linha rotulo="Publicado em">{dt(pin.published_at)}</Linha>}
            <Linha rotulo="Board">{pin.board?.name ?? <span className="text-warning">Sem board</span>}</Linha>
            <Linha rotulo="Link">
              {pin.link_url ? (
                <a href={pin.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-tech hover:underline">
                  <span className="break-all">{pin.link_url}</span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                </a>
              ) : (
                <span className="text-warning">Sem link de afiliado</span>
              )}
            </Linha>
            {pin.product?.permalink && (
              <Linha rotulo="Anúncio ML">
                <a href={pin.product.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  Ver no Mercado Livre
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </Linha>
            )}
            {pin.external_url && (
              <Linha rotulo="Pinterest">
                <a href={pin.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-tech hover:underline">
                  Abrir Pin
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </Linha>
            )}
            <Linha rotulo="Tentativas">
              <span className="tabular">{pin.attempts}</span>
            </Linha>
            {pin.creative && (
              <Linha rotulo="Criativo">
                {pin.creative.headline || <span className="text-muted-foreground">Sem headline</span>}
              </Linha>
            )}
            {pin.duplicated_from && (
              <Linha rotulo="Duplicado de">
                <Link href={`/ml/publicacoes?pin=${pin.duplicated_from}`} scroll={false} className="hover:underline">
                  Publicação original
                </Link>
              </Linha>
            )}
          </dl>

          <section className="space-y-2">
            <h3 className="text-body-sm font-semibold">Descrição</h3>
            <p className="whitespace-pre-line rounded-xl bg-secondary/50 p-3 text-body-sm">{pin.description || "—"}</p>
            {pin.alt_text && (
              <p className="text-caption text-muted-foreground">
                <span className="font-medium">Alt text:</span> {pin.alt_text}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-body-sm font-semibold">Checagens pré-publicação</h3>
              {pin.validated_at && <span className="text-caption text-muted-foreground">em {dt(pin.validated_at)}</span>}
            </div>
            <ValidacaoLista itens={pin.validacao} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
