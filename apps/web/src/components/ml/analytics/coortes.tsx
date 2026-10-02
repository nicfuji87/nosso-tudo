import Link from "next/link";
import { CalendarClock, Filter, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSOES_COORTE, JANELAS_COORTE, fmtNum, fmtPct, type DimensaoCoorte } from "./formato";

export interface LinhaCoorte {
  key: string;
  label: string;
  pins: number;
  impressions: number;
  saves: number;
  pin_clicks: number;
  outbound_clicks: number;
  ctr: number | null;
  hrefFiltro?: string;
  ativo?: boolean;
}

const MAX = 30;

/**
 * Coortes por idade do Pin (§11.9): desempenho nos primeiros N dias de cada Pin, agrupado por uma dimensão.
 * Abas e dimensão vivem na URL (`coorte`, `coorte_por`) — o servidor chama `ml_analytics_cohort`.
 */
export function Coortes({
  dias,
  dimensao,
  linhas,
  erro,
  hrefJanela,
  hrefDimensao,
}: {
  dias: string;
  dimensao: DimensaoCoorte;
  linhas: LinhaCoorte[];
  erro?: string | null;
  hrefJanela: (d: string) => string;
  hrefDimensao: (d: DimensaoCoorte) => string;
}) {
  const lista = linhas.slice(0, MAX);
  const maxOut = Math.max(0, ...lista.map((l) => l.outbound_clicks));
  const totalPins = linhas.reduce((s, l) => s + l.pins, 0);
  const rotuloDim = DIMENSOES_COORTE.find((d) => d.value === dimensao)?.label ?? dimensao;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="inline-flex rounded-full bg-secondary p-1" aria-label="Janela da coorte">
          {JANELAS_COORTE.map((j) => (
            <Link
              key={j}
              href={hrefJanela(j)}
              scroll={false}
              aria-current={dias === j ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-body-sm font-medium transition-colors",
                dias === j ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {j} dias
            </Link>
          ))}
        </nav>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Agrupar coorte por">
          {DIMENSOES_COORTE.map((d) => (
            <Link
              key={d.value}
              href={hrefDimensao(d.value)}
              scroll={false}
              aria-current={dimensao === d.value ? "true" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-caption transition-colors",
                dimensao === d.value
                  ? "border-tech/50 bg-tech/10 font-medium text-tech"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Só entram Pins com {dias} dias completos desde a publicação; as métricas somadas são as dos primeiros {dias} dias de cada Pin
          (independem do período selecionado acima; os demais filtros valem).
        </span>
      </p>

      {erro ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-body-sm text-destructive" role="alert">
          Não foi possível calcular a coorte: {erro}
        </p>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CalendarClock className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-body-sm font-medium">Ainda sem Pins com {dias} dias completos</p>
          <p className="max-w-md text-caption text-muted-foreground">
            A coorte aparece quando houver Pins publicados há pelo menos {dias} dias que atendam aos filtros. Tente uma janela menor.
          </p>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-body-sm">
            <caption className="sr-only">
              Coorte de {dias} dias por {rotuloDim}
            </caption>
            <thead>
              <tr className="text-overline uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3 text-left font-medium">{rotuloDim}</th>
                <th className="pb-2 pl-2 text-right font-medium">Pins</th>
                <th className="pb-2 pl-2 text-right font-medium">Impr.</th>
                <th className="pb-2 pl-2 text-right font-medium">Outbound</th>
                <th className="pb-2 pl-2 text-right font-medium">CTR</th>
                <th className="pb-2 pl-2 text-right font-medium">Saves</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.key} className={cn("border-t border-border/60 align-top", l.ativo && "bg-tech/5")}>
                  <td className="max-w-[18rem] py-2 pr-3">
                    {l.hrefFiltro ? (
                      <Link href={l.hrefFiltro} scroll={false} className="group inline-flex min-w-0 items-start gap-1 hover:text-tech" title="Filtrar por este item">
                        <span className="line-clamp-2">{l.label}</span>
                        <Filter className="mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" aria-hidden />
                      </Link>
                    ) : (
                      <span className="line-clamp-2">{l.label}</span>
                    )}
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                      <div
                        className="h-full rounded-full bg-tech/60"
                        style={{ width: `${maxOut > 0 ? Math.max(2, (l.outbound_clicks / maxOut) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                  <td className="tabular py-2 pl-2 text-right text-muted-foreground">{fmtNum(l.pins)}</td>
                  <td className="tabular py-2 pl-2 text-right">{fmtNum(l.impressions)}</td>
                  <td className="tabular py-2 pl-2 text-right font-medium">{fmtNum(l.outbound_clicks)}</td>
                  <td className="tabular py-2 pl-2 text-right">{fmtPct(l.ctr)}</td>
                  <td className="tabular py-2 pl-2 text-right text-muted-foreground">{fmtNum(l.saves)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-muted-foreground">
            {fmtNum(totalPins)} Pin(s) na coorte
            {linhas.length > MAX ? ` · mostrando os ${MAX} primeiros de ${fmtNum(linhas.length)} grupos (por outbound clicks)` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
