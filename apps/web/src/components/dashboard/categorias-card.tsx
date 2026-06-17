"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { CategoryDonut, type DonutDatum } from "./category-donut";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBRL, formatDate } from "@/lib/format";
import { transacoesPorCategoria, type CategoriaDrill } from "./actions";

export interface CategoriaResumo {
  id: string;
  nome: string;
  total: number;
  cor: string;
}

/** Donut + legenda CLICÁVEL: toque numa categoria (ou em "Outros") para ver o que tem dentro. */
export function CategoriasCard({ categorias, total }: { categorias: CategoriaResumo[]; total: number }) {
  const [drill, setDrill] = useState<string | null>(null);
  const [outros, setOutros] = useState(false);

  if (categorias.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-center text-caption text-muted-foreground">
        Sem despesas neste mês ainda.
      </div>
    );
  }

  const top = categorias.slice(0, 5);
  const resto = categorias.slice(5);
  const restoTotal = resto.reduce((s, c) => s + c.total, 0);

  const donut: DonutDatum[] = top.map((c) => ({ nome: c.nome, valor: c.total, cor: c.cor }));
  if (resto.length > 0) donut.push({ nome: "Outros", valor: restoTotal, cor: "#C4B8B0" });

  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto w-full max-w-[12rem] shrink-0 sm:w-44">
        <CategoryDonut data={donut} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-caption text-muted-foreground">Total</span>
          <span className="text-body font-semibold tabular-nums">{formatBRL(total)}</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-0.5">
        {top.map((c) => (
          <li key={c.id}>
            <LegendaLinha
              nome={c.nome}
              cor={c.cor}
              pct={pct(c.total)}
              valor={c.total}
              onClick={() => setDrill(c.id)}
            />
          </li>
        ))}
        {resto.length > 0 && (
          <li>
            <LegendaLinha
              nome={`Outros (${resto.length})`}
              cor="#C4B8B0"
              pct={pct(restoTotal)}
              valor={restoTotal}
              onClick={() => setOutros(true)}
            />
          </li>
        )}
      </ul>

      {/* "Outros": categorias agrupadas, cada uma abre seus lançamentos */}
      <Sheet open={outros} onOpenChange={setOutros}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
          <SheetHeader className="pr-8">
            <SheetTitle>Outros</SheetTitle>
            <p className="text-body-sm text-muted-foreground">
              {resto.length} categorias ·{" "}
              <span className="font-medium text-foreground tabular-nums">{formatBRL(restoTotal)}</span>
            </p>
          </SheetHeader>
          <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
            {resto.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOutros(false);
                    setDrill(c.id);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor }} />
                  <span className="min-w-0 flex-1 truncate text-body-sm">{c.nome}</span>
                  <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{pct(c.total)}%</span>
                  <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(c.total)}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <CategoriaDrillSheet id={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

function LegendaLinha({
  nome,
  cor,
  pct,
  valor,
  onClick,
}: {
  nome: string;
  cor: string;
  pct: number;
  valor: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-secondary/60"
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
      <span className="min-w-0 flex-1 truncate text-body-sm">{nome}</span>
      <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{pct}%</span>
      <span className="w-24 shrink-0 text-right text-body-sm font-medium tabular-nums">{formatBRL(valor)}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function CategoriaDrillSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [det, setDet] = useState<CategoriaDrill | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!id) return;
    setDet(null);
    setCarregando(true);
    let vivo = true;
    transacoesPorCategoria(id).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
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
                Os gastos desta categoria vêm de itens de notas — abra a transação para ver os itens.
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
