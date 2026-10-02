import type { ReactNode } from "react";
import Link from "next/link";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtBrl, fmtNum, fmtPct, type LinhaBreakdown } from "./formato";

export interface LinhaRelatorio extends LinhaBreakdown {
  /** Link que aplica o filtro por esta linha (ausente quando não há filtro possível). */
  hrefFiltro?: string;
  rotulo?: ReactNode;
  extra?: ReactNode;
  ativo?: boolean;
}

const VISIVEIS = 8;
const MAX = 50;

function Linhas({ linhas, maxOut }: { linhas: LinhaRelatorio[]; maxOut: number }) {
  return (
    <>
      {linhas.map((l, i) => (
        <tr key={l.key} className={cn("border-t border-border/60 align-top", l.ativo && "bg-tech/5", i >= VISIVEIS && "extra")}>
          <td className="max-w-[16rem] py-2 pr-3">
            <div className="flex items-start gap-1.5">
              {l.hrefFiltro ? (
                <Link href={l.hrefFiltro} scroll={false} className="group inline-flex min-w-0 items-start gap-1 hover:text-tech" title="Filtrar por este item">
                  <span className="line-clamp-2">{l.rotulo ?? l.label}</span>
                  <Filter className="mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" aria-hidden />
                </Link>
              ) : (
                <span className="line-clamp-2">{l.rotulo ?? l.label}</span>
              )}
              {l.extra}
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="h-full rounded-full bg-tech/60" style={{ width: `${maxOut > 0 ? Math.max(2, (l.outbound_clicks / maxOut) * 100) : 0}%` }} />
            </div>
          </td>
          <td className="tabular py-2 pl-2 text-right text-muted-foreground">{fmtNum(l.pins)}</td>
          <td className="tabular py-2 pl-2 text-right">{fmtNum(l.impressions)}</td>
          <td className="tabular py-2 pl-2 text-right font-medium">{fmtNum(l.outbound_clicks)}</td>
          <td className="tabular py-2 pl-2 text-right">{fmtPct(l.ctr)}</td>
          <td className="tabular py-2 pl-2 text-right text-muted-foreground">{fmtNum(l.saves)}</td>
          <td className="tabular py-2 pl-2 text-right">{l.commission > 0 ? fmtBrl(l.commission) : "—"}</td>
        </tr>
      ))}
    </>
  );
}

/** Tabela de relatório por dimensão (ordenada pelo chamador). */
export function TabelaRelatorio({
  titulo,
  descricao,
  linhas,
  vazio = "Sem dados no período.",
  nota,
  className,
}: {
  titulo: string;
  descricao?: string;
  linhas: LinhaRelatorio[];
  vazio?: string;
  nota?: ReactNode;
  className?: string;
}) {
  const lista = linhas.slice(0, MAX);
  const maxOut = Math.max(0, ...lista.map((l) => l.outbound_clicks));
  const idMais = `mais-${titulo.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  const cabecalho = (
    <thead>
      <tr className="text-overline uppercase tracking-wide text-muted-foreground">
        <th className="pb-2 pr-3 text-left font-medium">Item</th>
        <th className="pb-2 pl-2 text-right font-medium">Pins</th>
        <th className="pb-2 pl-2 text-right font-medium">Impr.</th>
        <th className="pb-2 pl-2 text-right font-medium">Outbound</th>
        <th className="pb-2 pl-2 text-right font-medium">CTR</th>
        <th className="pb-2 pl-2 text-right font-medium">Saves</th>
        <th className="pb-2 pl-2 text-right font-medium">Comissão</th>
      </tr>
    </thead>
  );

  return (
    <section className={cn("rounded-xl border border-border/70 bg-card p-4 shadow-card sm:p-5", className)}>
      <header className="mb-3">
        <h3 className="text-body font-semibold">{titulo}</h3>
        {descricao && <p className="text-caption text-muted-foreground">{descricao}</p>}
      </header>
      {nota && <div className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-caption text-warning">{nota}</div>}
      {lista.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          {lista.length > VISIVEIS && <input type="checkbox" id={idMais} className="peer sr-only" />}
          <table className="w-full min-w-[34rem] text-body-sm [&_tr.extra]:hidden peer-checked:[&_tr.extra]:table-row">
            {cabecalho}
            <tbody>
              <Linhas linhas={lista} maxOut={maxOut} />
            </tbody>
          </table>
          {lista.length > VISIVEIS && (
            <label htmlFor={idMais} className="mt-2 inline-block cursor-pointer text-caption text-tech hover:underline peer-checked:[&>.mais]:hidden peer-checked:[&>.menos]:inline">
              <span className="mais">Mostrar mais {lista.length - VISIVEIS}</span>
              <span className="menos hidden">Mostrar menos</span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
