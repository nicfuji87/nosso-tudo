"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Card com cabeçalho clicável que recolhe o conteúdo. Lembra o estado (localStorage). */
export function CollapsibleCard({
  id,
  titulo,
  subtitulo,
  resumo,
  defaultOpen = false,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo?: string;
  /** Texto curto à direita quando recolhido (ex.: um total). */
  resumo?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  const key = `nt:card-${id}`;

  useEffect(() => {
    const v = localStorage.getItem(key);
    if (v != null) setAberto(v === "1");
  }, [key]);

  function toggle() {
    setAberto((a) => {
      const n = !a;
      localStorage.setItem(key, n ? "1" : "0");
      return n;
    });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 p-5 text-left"
        aria-expanded={aberto}
      >
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium">{titulo}</p>
          {subtitulo && <p className="text-caption text-muted-foreground">{subtitulo}</p>}
        </div>
        {!aberto && resumo && (
          <span className="shrink-0 text-body-sm font-medium tabular-nums">{resumo}</span>
        )}
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")}
        />
      </button>
      {aberto && <CardContent className="px-5 pb-5 pt-0">{children}</CardContent>}
    </Card>
  );
}
