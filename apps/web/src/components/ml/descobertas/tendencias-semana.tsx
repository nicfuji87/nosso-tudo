import { Flame, TrendingUp } from "lucide-react";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { TREND_TYPE_LABEL } from "@/components/ml/produtos/formato";

export interface TendenciaResumo {
  id: number;
  keyword: string;
  url: string | null;
  trend_type: string;
  position: number | null;
}

/** Faixa "Tendências da semana" (ml_trends da semana mais recente). */
export function TendenciasSemana({ itens, semana, tz }: { itens: TendenciaResumo[]; semana: string | null; tz: string }) {
  if (!itens.length || !semana) return null;
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-card" aria-labelledby="tendencias-titulo">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tendencias-titulo" className="flex items-center gap-2 text-body font-semibold">
          <Flame className="size-4 text-tech" aria-hidden /> Tendências da semana
        </h2>
        <span className="text-caption text-muted-foreground">
          Semana de {formatarNoFuso(`${semana}T12:00:00Z`, tz, { dateStyle: "medium" })} · Mercado Livre
        </span>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {itens.map((t) => {
          const conteudo = (
            <>
              <TrendingUp className="size-3.5 shrink-0 text-tech" aria-hidden />
              <span className="truncate font-medium">{t.keyword}</span>
              <span className="shrink-0 text-caption text-muted-foreground">{TREND_TYPE_LABEL[t.trend_type] ?? t.trend_type}</span>
            </>
          );
          const cls =
            "flex max-w-[16rem] items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-body-sm";
          return (
            <li key={t.id} className="shrink-0">
              {t.url ? (
                <a href={t.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-secondary`}>
                  {conteudo}
                </a>
              ) : (
                <span className={cls}>{conteudo}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
