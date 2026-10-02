import Link from "next/link";
import { ArrowUpRight, ImageOff } from "lucide-react";
import { StatusBadge } from "@/components/ml/status";
import { formatarNoFuso } from "@/lib/ml/tempo";

export interface PinBloqueado {
  id: string;
  title: string | null;
  media_url: string | null;
  status: string;
  scheduled_at: string | null;
  last_error: string | null;
  board: string | null;
}

/** Pins agendados para as próximas 48 h (ou que acabaram de falhar) que não vão sair sem intervenção. */
export function PinsBloqueados({ pins, tz }: { pins: PinBloqueado[]; tz: string }) {
  return (
    <ul className="space-y-2.5">
      {pins.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/20 p-3">
          <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md border border-border/70 bg-secondary/50">
            {p.media_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.media_url} alt={p.title ?? "Imagem do Pin"} loading="lazy" className="absolute inset-0 size-full object-cover" />
            ) : (
              <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tipo="pin" status={p.status} className="px-2 py-0.5" />
              <span className="text-caption text-muted-foreground tabular">
                {p.scheduled_at ? `agendado ${formatarNoFuso(p.scheduled_at, tz)}` : "sem horário"}
                {p.board ? ` · ${p.board}` : ""}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-body-sm font-medium">{p.title ?? "Pin sem título"}</p>
            {p.last_error && <p className="mt-0.5 line-clamp-3 break-words text-caption text-destructive">{p.last_error}</p>}
          </div>
          <Link
            href={`/ml/publicacoes?pin=${encodeURIComponent(p.id)}`}
            className="inline-flex h-9 items-center gap-1.5 self-center rounded-full bg-tech px-4 text-body-sm font-medium text-tech-foreground shadow-card hover:shadow-card-hover"
          >
            Resolver <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
