import type { LucideIcon } from "lucide-react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export type TipoGrupo = "produtos" | "links" | "imagens" | "criativos" | "publicacoes" | "excecoes" | "configuracoes";

/** Bloco de um tipo de pendência na Central (âncora `#grupo-<tipo>` para ?tipo=). */
export function GrupoPendencia({
  tipo,
  icon: Icon,
  titulo,
  contagem,
  tempo,
  descricao,
  acoes,
  children,
  tom = "tech",
}: {
  tipo: TipoGrupo;
  icon: LucideIcon;
  titulo: string;
  contagem: number;
  tempo?: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  tom?: "tech" | "warning" | "destructive";
}) {
  return (
    <section
      id={`grupo-${tipo}`}
      aria-labelledby={`titulo-${tipo}`}
      className="scroll-mt-24 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-shadow data-[foco=true]:shadow-focus sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              tom === "warning" ? "bg-warning/15 text-warning" : tom === "destructive" ? "bg-destructive/15 text-destructive" : "bg-tech/15 text-tech",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={`titulo-${tipo}`} className="flex flex-wrap items-center gap-2 text-h4 font-semibold tracking-tight">
              {titulo}
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-body-sm font-semibold tabular">{contagem}</span>
            </h2>
            {(descricao || tempo) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
                {descricao}
                {tempo && (
                  <span className="inline-flex items-center gap-1 text-caption">
                    <Timer className="size-3.5" aria-hidden /> {tempo}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}
