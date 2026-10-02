import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PinView } from "./tipos";

/** Miniatura 2:3 do Pin (img simples, lazy). */
export function PinThumb({ pin, className }: { pin: Pick<PinView, "media_url" | "title" | "alt_text">; className?: string }) {
  if (!pin.media_url)
    return (
      <div className={cn("flex aspect-[2/3] items-center justify-center rounded-lg bg-secondary text-muted-foreground", className)}>
        <ImageOff className="size-1/2 max-h-5 max-w-5" aria-label="Sem imagem" />
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pin.media_url}
      alt={pin.alt_text || pin.title || "Imagem do Pin"}
      loading="lazy"
      className={cn("aspect-[2/3] rounded-lg bg-secondary object-cover", className)}
    />
  );
}
