"use client";

import Link from "next/link";
import { CalendarClock, CheckCheck, CheckCircle2, ImageOff } from "lucide-react";
import { aprovarPins } from "@/app/ml/(painel)/publicacoes/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { formatarNoFuso } from "@/lib/ml/tempo";

export interface PinPendente {
  id: string;
  title: string | null;
  media_url: string | null;
  board: string | null;
  scheduled_at: string | null;
  created_at: string;
}

/** Pins aguardando aprovação humana antes de entrar na fila de publicação. */
export function PinsAprovacao({ pins, tz, podeOperar }: { pins: PinPendente[]; tz: string; podeOperar: boolean }) {
  return (
    <div className="space-y-3">
      {podeOperar && pins.length > 1 && (
        <div className="flex justify-end">
          <AcaoBotao size="sm" variant="tech" acao={() => aprovarPins(pins.map((p) => p.id))}>
            <CheckCheck /> Aprovar todos ({pins.length})
          </AcaoBotao>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {pins.map((p) => (
          <li key={p.id} className="flex gap-3 rounded-xl border border-border/70 p-2.5">
            <Link href={`/ml/publicacoes?pin=${p.id}`} className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-secondary/50">
              {p.media_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.media_url} alt={p.title ?? "Imagem do Pin"} loading="lazy" className="absolute inset-0 size-full object-cover" />
              ) : (
                <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/ml/publicacoes?pin=${p.id}`} className="line-clamp-2 text-body-sm font-medium hover:underline">
                {p.title ?? "Pin sem título"}
              </Link>
              <p className="text-caption text-muted-foreground">{p.board ?? "Board automático"}</p>
              <p className="flex items-center gap-1 text-caption text-muted-foreground tabular">
                <CalendarClock className="size-3.5" aria-hidden />
                {p.scheduled_at ? formatarNoFuso(p.scheduled_at, tz) : "Próxima janela livre"}
              </p>
              {podeOperar && (
                <AcaoBotao size="sm" variant="secondary" className="mt-auto self-start" acao={() => aprovarPins([p.id])}>
                  <CheckCircle2 /> Aprovar
                </AcaoBotao>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
