"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Imagem } from "./formato";

/** Galeria do produto: imagem principal grande + miniaturas. */
export function Galeria({ imagens, titulo }: { imagens: Imagem[]; titulo: string }) {
  const [atual, setAtual] = useState(0);
  const img = imagens[atual] ?? imagens[0];

  if (!img)
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card text-muted-foreground">
        <ImageOff className="size-8" aria-hidden />
        <span className="text-body-sm">Sem imagens</span>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/70 bg-white shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagens remotas do Mercado Livre */}
        <img src={img.url} alt={`${titulo} — imagem ${atual + 1} de ${imagens.length}`} className="size-full object-contain p-4" />
        <span className="absolute bottom-2 right-2 rounded-full bg-card/90 px-2 py-0.5 text-caption text-muted-foreground shadow-sm tabular">
          {atual + 1}/{imagens.length}
          {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
        </span>
      </div>
      {imagens.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Miniaturas">
          {imagens.map((im, i) => (
            <li key={`${im.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setAtual(i)}
                aria-label={`Ver imagem ${i + 1}`}
                aria-pressed={i === atual}
                className={cn(
                  "block size-16 overflow-hidden rounded-lg border-2 bg-white transition-colors",
                  i === atual ? "border-tech" : "border-transparent hover:border-border",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- imagens remotas do Mercado Livre */}
                <img src={im.url} alt="" loading="lazy" className="size-full object-contain p-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
