"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBRL, formatDate } from "@/lib/format";
import type { GastoPessoa } from "@/lib/db/queries";
import { transacoesPorPessoa, type PessoaDrill } from "./actions";

const CORES = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

/** Despesas do mês por responsável — barras CLICÁVEIS: toque numa pessoa (ou em
 *  "Não atribuído") para ver os lançamentos dela. */
export function GastoPorPessoa({ dados }: { dados: GastoPessoa[] }) {
  const [drill, setDrill] = useState<string | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <>
      <ul className="space-y-2">
        {dados.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setDrill(p.id)}
              className="w-full space-y-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-secondary/60"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-body-sm font-medium">{p.nome}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-body-sm tabular-nums">{formatBRL(p.total)}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(p.total / max) * 100}%`, backgroundColor: CORES[i % CORES.length] }}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <PessoaDrillSheet id={drill} onClose={() => setDrill(null)} />
    </>
  );
}

function PessoaDrillSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [det, setDet] = useState<PessoaDrill | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (id == null) return;
    setDet(null);
    setCarregando(true);
    let vivo = true;
    transacoesPorPessoa(id).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  return (
    <Sheet open={id != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {carregando || !det ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader className="pr-8">
              <SheetTitle>{det.nome}</SheetTitle>
              <p className="text-body-sm text-muted-foreground">
                {det.transacoes.length} {det.transacoes.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
                <span className="font-medium text-foreground tabular-nums">{formatBRL(det.total)}</span>
              </p>
            </SheetHeader>
            {det.transacoes.length === 0 ? (
              <p className="py-10 text-center text-body-sm text-muted-foreground">
                Nenhum lançamento neste mês.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
                {det.transacoes.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium">{t.descricao}</p>
                      <p className="text-caption text-muted-foreground">
                        {[t.estabelecimento, formatDate(t.data)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(t.valor)}</span>
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
