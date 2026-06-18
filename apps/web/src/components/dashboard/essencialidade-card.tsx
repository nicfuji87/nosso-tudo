"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBRL, formatDate } from "@/lib/format";
import { LABEL_ESSENCIALIDADE, type Essencialidade } from "@/lib/types/db";
import { transacoesPorEssencialidade, type EssencialidadeDrill } from "./actions";

const COR: Record<Essencialidade, string> = {
  essencial: "#8FA993",
  necessario: "#3D6D84",
  superfluo: "#E08A4B",
  investimento: "#7E57C2",
};

export interface EssencDatum {
  essencialidade: Essencialidade;
  total: number;
}

/** Barra essencial × supérfluo CLICÁVEL: toque numa faixa/legenda p/ ver o que entra nela. */
export function EssencialidadeCard({ data }: { data: EssencDatum[] }) {
  const [drill, setDrill] = useState<Essencialidade | null>(null);
  const total = data.reduce((s, e) => s + e.total, 0);
  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {data.map((e) => (
          <button
            key={e.essencialidade}
            type="button"
            onClick={() => setDrill(e.essencialidade)}
            aria-label={`Ver ${LABEL_ESSENCIALIDADE[e.essencialidade]}`}
            className="h-full cursor-pointer transition-opacity hover:opacity-80"
            style={{ width: `${(e.total / total) * 100}%`, backgroundColor: COR[e.essencialidade] }}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.map((e) => (
          <button
            key={e.essencialidade}
            type="button"
            onClick={() => setDrill(e.essencialidade)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-secondary/60"
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR[e.essencialidade] }} />
            <div className="min-w-0">
              <p className="truncate text-caption text-muted-foreground">{LABEL_ESSENCIALIDADE[e.essencialidade]}</p>
              <p className="text-body-sm font-medium tabular-nums">
                {formatBRL(e.total)}{" "}
                <span className="text-caption font-normal text-muted-foreground">
                  ({Math.round((e.total / total) * 100)}%)
                </span>
              </p>
            </div>
          </button>
        ))}
      </div>
      <EssencialidadeDrillSheet essencialidade={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

function EssencialidadeDrillSheet({
  essencialidade,
  onClose,
}: {
  essencialidade: Essencialidade | null;
  onClose: () => void;
}) {
  const [det, setDet] = useState<EssencialidadeDrill | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!essencialidade) return;
    setDet(null);
    setCarregando(true);
    let vivo = true;
    transacoesPorEssencialidade(essencialidade).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [essencialidade]);

  return (
    <Sheet open={!!essencialidade} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {carregando || !det ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader className="pr-8">
              <SheetTitle>{essencialidade ? LABEL_ESSENCIALIDADE[essencialidade] : ""}</SheetTitle>
              <p className="text-body-sm text-muted-foreground">
                {det.linhas.length} {det.linhas.length === 1 ? "item" : "itens"} ·{" "}
                <span className="font-medium text-foreground tabular-nums">{formatBRL(det.total)}</span>
              </p>
            </SheetHeader>
            {det.linhas.length === 0 ? (
              <p className="py-10 text-center text-body-sm text-muted-foreground">
                Nada classificado aqui neste mês.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
                {det.linhas.map((l, i) => (
                  <li key={`${l.id}-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium">{l.descricao}</p>
                      <p className="text-caption text-muted-foreground">
                        {[l.estabelecimento, l.data ? formatDate(l.data) : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(l.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
