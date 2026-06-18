"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBRL } from "@/lib/format";
import type { Descoberta, SeveridadeDescoberta } from "@/lib/insights";

const COR_SEVERIDADE: Record<SeveridadeDescoberta, string> = {
  oportunidade: "#8FA993",
  atencao: "#E08A4B",
  risco: "#EF8A8A",
};

/**
 * "Descobertas da semana" — o app entrega a conclusão, não um relatório a abrir.
 * Quando a descoberta tem detalhamento (`itens`), o toque abre a lista do que
 * exatamente entrou na conta; senão, leva ao lugar de agir.
 */
export function DescobertasCard({ descobertas }: { descobertas: Descoberta[] }) {
  const [aberta, setAberta] = useState<Descoberta | null>(null);
  if (descobertas.length === 0) return null;

  const economia = descobertas
    .filter((d) => d.severidade === "oportunidade")
    .reduce((s, d) => s + (d.valor ?? 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h4 font-semibold tracking-tight">Descobertas</h2>
        {economia > 0 && (
          <span className="text-caption text-muted-foreground">
            até <span className="font-medium text-foreground tabular-nums">{formatBRL(economia)}/ano</span> em oportunidades
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/70">
            {descobertas.map((d) => (
              <li key={d.tipo}>
                {d.itens && d.itens.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAberta(d)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/50"
                  >
                    <LinhaConteudo d={d} />
                  </button>
                ) : (
                  <Link
                    href={d.href}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50"
                  >
                    <LinhaConteudo d={d} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <DescobertaSheet descoberta={aberta} onClose={() => setAberta(null)} />
    </section>
  );
}

function LinhaConteudo({ d }: { d: Descoberta }) {
  const cor = COR_SEVERIDADE[d.severidade];
  return (
    <>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-lg"
        style={{ backgroundColor: `${cor}22` }}
      >
        {d.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-body-sm font-medium">
          <span className="truncate">{d.titulo}</span>
          {d.valor != null && (
            <span className="shrink-0 tabular-nums" style={{ color: cor }}>
              {formatBRL(d.valor)}
            </span>
          )}
        </p>
        {d.detalhe && <p className="truncate text-caption text-muted-foreground">{d.detalhe}</p>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </>
  );
}

function DescobertaSheet({ descoberta, onClose }: { descoberta: Descoberta | null; onClose: () => void }) {
  const itens = descoberta?.itens ?? [];
  return (
    <Sheet open={!!descoberta} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {descoberta && (
          <>
            <SheetHeader className="pr-8">
              <SheetTitle>
                {descoberta.emoji} {descoberta.titulo}
              </SheetTitle>
              <p className="text-body-sm text-muted-foreground">
                {itens.length} {itens.length === 1 ? "item" : "itens"}
                {descoberta.valor != null && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatBRL(descoberta.valor)}
                      {descoberta.severidade === "oportunidade" ? "/ano" : ""}
                    </span>
                  </>
                )}
              </p>
            </SheetHeader>

            <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
              {itens.map((it, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{it.descricao}</p>
                    {it.sub && <p className="truncate text-caption text-muted-foreground">{it.sub}</p>}
                  </div>
                  {it.valor != null && (
                    <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(it.valor)}</span>
                  )}
                </li>
              ))}
            </ul>

            <Link
              href={descoberta.href}
              className="mt-3 flex items-center justify-center gap-1.5 text-body-sm font-medium text-primary transition-colors hover:underline"
            >
              {descoberta.tipo === "assinatura_fantasma" ? "Gerenciar recorrências" : "Abrir nas transações"}
              <ArrowRight className="size-4" />
            </Link>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
