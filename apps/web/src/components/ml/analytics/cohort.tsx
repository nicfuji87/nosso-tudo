import Link from "next/link";
import { ExternalLink, ImageOff, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBrl, fmtNum, fmtPct, rotuloAngulo, type LinhaBreakdown } from "./formato";

export interface VariacaoCohort extends LinhaBreakdown {
  headline: string | null;
  angulo: string | null;
  thumb: string | null;
  hrefFiltro: string;
}

export interface GrupoCohort {
  produto: { id: string; title: string };
  hrefFiltroProduto: string;
  variacoes: VariacaoCohort[];
}

/** Amostra mínima para declarar vencedor por CTR. */
export const MIN_IMPRESSOES = 100;

/** Cohort de criativos: compara as variações do mesmo produto lado a lado. */
export function CohortCriativos({ grupos }: { grupos: GrupoCohort[] }) {
  if (!grupos.length) return <p className="py-6 text-center text-body-sm text-muted-foreground">Sem criativos publicados no período.</p>;
  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const elegiveis = g.variacoes.filter((v) => v.impressions >= MIN_IMPRESSOES && v.ctr != null);
        const melhor =
          g.variacoes.length > 1 && elegiveis.length > 1 ? elegiveis.reduce((a, b) => ((b.ctr ?? 0) > (a.ctr ?? 0) ? b : a)) : null;
        return (
          <div key={g.produto.id} className="rounded-xl border border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link href={g.hrefFiltroProduto} scroll={false} className="line-clamp-1 text-body-sm font-semibold hover:text-tech" title="Filtrar por este produto">
                  {g.produto.title}
                </Link>
                <Link href={`/ml/produtos/${g.produto.id}`} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir produto">
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
              <span className="text-caption text-muted-foreground">
                {g.variacoes.length} variação(ões)
                {g.variacoes.length > 1 && !melhor && ` · amostra pequena (< ${MIN_IMPRESSOES} impressões) para comparar`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-body-sm">
                <thead>
                  <tr className="text-overline uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">Criativo</th>
                    <th className="px-2 py-1.5 text-right font-medium">Pins</th>
                    <th className="px-2 py-1.5 text-right font-medium">Impr.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Outbound</th>
                    <th className="px-2 py-1.5 text-right font-medium">CTR</th>
                    <th className="px-3 py-1.5 text-right font-medium">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {g.variacoes.map((v) => (
                    <tr key={v.key} className={cn("border-t border-border/50", melhor?.key === v.key && "bg-success/5")}>
                      <td className="px-3 py-2">
                        <Link href={v.hrefFiltro} scroll={false} className="flex items-center gap-2.5 hover:text-tech" title="Filtrar por este criativo">
                          {v.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumb} alt={v.headline ?? "Criativo"} loading="lazy" className="aspect-[2/3] w-8 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex aspect-[2/3] w-8 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
                              <ImageOff className="size-3.5" aria-label="Sem imagem" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="line-clamp-1">{v.headline || "Sem headline"}</span>
                            {v.angulo && <span className="block text-caption text-muted-foreground">{rotuloAngulo(v.angulo)}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">{fmtNum(v.pins)}</td>
                      <td className="tabular px-2 py-2 text-right">{fmtNum(v.impressions)}</td>
                      <td className="tabular px-2 py-2 text-right font-medium">{fmtNum(v.outbound_clicks)}</td>
                      <td className="tabular px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          {melhor?.key === v.key && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 text-overline text-success">
                              <Trophy className="size-3" aria-hidden />
                              melhor
                            </span>
                          )}
                          {fmtPct(v.ctr)}
                        </span>
                      </td>
                      <td className="tabular px-3 py-2 text-right">{v.commission > 0 ? fmtBrl(v.commission) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
