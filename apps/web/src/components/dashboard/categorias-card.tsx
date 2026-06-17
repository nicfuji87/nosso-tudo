import { CategoryDonut, type DonutDatum } from "./category-donut";
import { formatBRL } from "@/lib/format";

/** Donut de categorias COM legenda — sem ela não dá pra saber quais são. */
export function CategoriasCard({ data, total }: { data: DonutDatum[]; total: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-center text-caption text-muted-foreground">
        Sem despesas neste mês ainda.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto w-full max-w-[12rem] shrink-0 sm:w-44">
        <CategoryDonut data={data} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-caption text-muted-foreground">Total</span>
          <span className="text-body font-semibold tabular-nums">{formatBRL(total)}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.nome} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.cor }} />
            <span className="min-w-0 flex-1 truncate text-body-sm">{d.nome}</span>
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
              {total > 0 ? Math.round((d.valor / total) * 100) : 0}%
            </span>
            <span className="w-24 shrink-0 text-right text-body-sm font-medium tabular-nums">
              {formatBRL(d.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
