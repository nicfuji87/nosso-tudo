import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EtapaOnboarding {
  titulo: string;
  href: string;
  feito: boolean;
  opcional?: boolean;
}

/** Roteiro de configuração inicial (spec §3.1) — mostra o que falta, em ordem. */
export function PrimeirosPassos({ etapas }: { etapas: EtapaOnboarding[] }) {
  const obrigatorias = etapas.filter((e) => !e.opcional);
  const feitas = obrigatorias.filter((e) => e.feito).length;
  const completo = feitas === obrigatorias.length;
  return (
    <section className="rounded-xl border border-border/70 bg-card p-5 shadow-card" aria-labelledby="titulo-primeiros-passos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-primeiros-passos" className="text-h4 font-semibold tracking-tight">
          {completo ? "Configuração concluída" : "Primeiros passos"}
        </h2>
        <span className="tabular text-caption text-muted-foreground">
          {feitas} de {obrigatorias.length} essenciais
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className="h-full rounded-full bg-tech transition-all" style={{ width: `${obrigatorias.length ? (feitas / obrigatorias.length) * 100 : 0}%` }} />
      </div>
      <ol className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {etapas.map((e, i) => (
          <li key={e.titulo}>
            <Link
              href={e.href}
              className={cn(
                "flex items-center gap-2 rounded-xl px-2.5 py-2 text-body-sm transition-colors hover:bg-secondary/60",
                e.feito ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {e.feito ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="tabular mr-1 text-caption text-muted-foreground">{i + 1}.</span>
                {e.titulo}
                {e.opcional && <span className="ml-1 text-caption text-muted-foreground">(opcional)</span>}
                <span className="sr-only">{e.feito ? " — feito" : " — pendente"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
