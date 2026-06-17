"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBRL, formatDate } from "@/lib/format";
import { transacoesDoContexto, type ContextoDetalhe } from "./actions";

export interface EventoResumo {
  contextoId: string;
  nome: string;
  icone: string | null;
  tipo: string | null;
  total: number;
  nTransacoes: number;
}

export function EventosLista({ eventos }: { eventos: EventoResumo[] }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((ev) => (
          <Card key={ev.contextoId} interactive>
            <CardContent className="p-4">
              <button type="button" onClick={() => setSel(ev.contextoId)} className="block w-full text-left">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{ev.icone ?? "🗓️"}</span>
                  <p className="min-w-0 flex-1 truncate text-body-sm font-medium">{ev.nome}</p>
                </div>
                <p className="mt-3 text-body-lg font-semibold tabular-nums">{formatBRL(ev.total)}</p>
                <p className="text-caption text-muted-foreground">
                  {ev.nTransacoes} {ev.nTransacoes === 1 ? "lançamento" : "lançamentos"} · ver detalhes
                </p>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
      <EventoSheet contextoId={sel} onClose={() => setSel(null)} />
    </>
  );
}

function EventoSheet({ contextoId, onClose }: { contextoId: string | null; onClose: () => void }) {
  const [det, setDet] = useState<ContextoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!contextoId) return;
    setDet(null);
    setCarregando(true);
    let vivo = true;
    transacoesDoContexto(contextoId).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [contextoId]);

  return (
    <Sheet open={!!contextoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {carregando || !det ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <SheetHeader className="pr-8">
              <SheetTitle>{det.nome}</SheetTitle>
              <p className="text-body-sm text-muted-foreground">
                {det.transacoes.length} {det.transacoes.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
                <span className="font-medium text-foreground tabular-nums">{formatBRL(det.total)}</span>
              </p>
            </SheetHeader>
            <ul className="divide-y divide-border/70 rounded-2xl border border-border">
              {det.transacoes.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{t.descricao}</p>
                    <p className="text-caption text-muted-foreground">
                      {t.categoriaNome ? `${t.categoriaIcone ? `${t.categoriaIcone} ` : ""}${t.categoriaNome} · ` : ""}
                      {formatDate(t.data)}
                    </p>
                  </div>
                  <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(t.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
