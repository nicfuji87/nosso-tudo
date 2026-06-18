import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import type { CategoriaComparada, Comparativo } from "@/lib/db/queries";

const COR_ALTA = "#E08A4B"; // gastou mais
const COR_BAIXA = "#8FA993"; // gastou menos

/** "Subir é caro": alta de despesa é alerta (laranja), baixa é alívio (verde). */
function tom(delta: number) {
  if (delta > 0) return COR_ALTA;
  if (delta < 0) return COR_BAIXA;
  return "#9AA0A6";
}

function Variacao({ c }: { c: CategoriaComparada }) {
  const cor = tom(c.delta);
  const Icone = c.delta > 0 ? ArrowUpRight : c.delta < 0 ? ArrowDownRight : Minus;
  const pct =
    c.deltaPct == null
      ? "novo"
      : `${c.deltaPct > 0 ? "+" : ""}${Math.round(c.deltaPct)}%`;
  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums" style={{ color: cor }}>
      <Icone className="size-3.5" />
      <span className="text-body-sm font-medium">{pct}</span>
    </span>
  );
}

/**
 * "Este mês × mês anterior" no mesmo período (1..dia de corte), para a leitura
 * mid-month ser justa. Mostra os maiores movimentos por categoria.
 */
export function ComparativoCard({ comparativo }: { comparativo: Comparativo }) {
  const { diaCorte, parcial, totalAtual, totalAnterior, categorias } = comparativo;
  // Sem base de comparação ainda (primeiro mês com dados) → não mostra.
  if (totalAnterior <= 0) return null;

  const deltaTotal = totalAtual - totalAnterior;
  const pctTotal = totalAnterior > 0 ? Math.round((deltaTotal / totalAnterior) * 100) : 0;
  const movers = categorias.filter((c) => Math.abs(c.delta) >= 1).slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h4 font-semibold tracking-tight">
          {parcial ? "Este mês × anterior" : "Mês × anterior"}
        </h2>
        <span className="text-caption text-muted-foreground">
          {parcial ? `mesmo período · até dia ${diaCorte}` : "mês fechado"}
        </span>
      </div>

      <Card>
        <CardContent className="p-5">
          {/* Resumo de despesas no período comparável */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-caption text-muted-foreground">
                {parcial ? "Despesas até agora" : "Despesas no mês"}
              </p>
              <p className="text-h4 font-semibold tabular-nums">{formatBRL(totalAtual)}</p>
            </div>
            <div className="text-right">
              <p className="text-caption text-muted-foreground">
                {parcial ? `No mês passado, até o dia ${diaCorte}` : "No mês anterior"}
              </p>
              <p className="flex items-center justify-end gap-1.5 text-body-sm">
                <span className="tabular-nums text-muted-foreground">{formatBRL(totalAnterior)}</span>
                <span className="tabular-nums font-medium" style={{ color: tom(deltaTotal) }}>
                  ({deltaTotal > 0 ? "+" : ""}
                  {pctTotal}%)
                </span>
              </p>
            </div>
          </div>

          {movers.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-border/70 pt-4">
              {movers.map((c) => (
                <li key={c.categoriaId} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-body-sm">
                    {c.icone ? `${c.icone} ` : ""}
                    {c.nome}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                    {formatBRL(c.anterior)} → {formatBRL(c.atual)}
                  </span>
                  <Variacao c={c} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
