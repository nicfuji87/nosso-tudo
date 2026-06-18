import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import type { Descoberta, SeveridadeDescoberta } from "@/lib/insights";

const COR_SEVERIDADE: Record<SeveridadeDescoberta, string> = {
  oportunidade: "#8FA993",
  atencao: "#E08A4B",
  risco: "#EF8A8A",
};

/**
 * "Descobertas da semana" — o app entrega a conclusão, não um relatório a abrir.
 * Cada linha leva ao lugar onde a pessoa age sobre o achado.
 */
export function DescobertasCard({ descobertas }: { descobertas: Descoberta[] }) {
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
                <Link
                  href={d.href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-lg"
                    style={{ backgroundColor: `${COR_SEVERIDADE[d.severidade]}22` }}
                  >
                    {d.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5 text-body-sm font-medium">
                      <span className="truncate">{d.titulo}</span>
                      {d.valor != null && (
                        <span className="shrink-0 tabular-nums" style={{ color: COR_SEVERIDADE[d.severidade] }}>
                          {formatBRL(d.valor)}
                        </span>
                      )}
                    </p>
                    {d.detalhe && <p className="truncate text-caption text-muted-foreground">{d.detalhe}</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
