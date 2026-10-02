import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PassoOnboarding {
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  feito: boolean;
  opcional?: boolean;
  /** Passo sem estado verificável (só um atalho para revisar). */
  revisar?: boolean;
}

/** Checklist de configuração inicial (spec §3.1) — some quando o essencial estiver pronto. */
export function OnboardingCard({ passos }: { passos: PassoOnboarding[] }) {
  const obrigatorios = passos.filter((p) => !p.opcional && !p.revisar);
  const feitos = obrigatorios.filter((p) => p.feito).length;
  const pct = obrigatorios.length ? Math.round((feitos / obrigatorios.length) * 100) : 100;

  return (
    <section className="rounded-xl border border-tech/30 bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-tech/15 text-tech">
            <Rocket className="size-[18px]" aria-hidden />
          </span>
          <div>
            <h2 className="text-h4 font-semibold tracking-tight">Configuração inicial</h2>
            <p className="text-body-sm text-muted-foreground">
              {feitos} de {obrigatorios.length} passos essenciais concluídos. Faça o teste completo antes de ligar as automações.
            </p>
          </div>
        </div>
        <span className="tabular text-caption font-medium text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-tech transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {passos.map((p) => (
          <li key={p.chave}>
            <Link
              href={p.href}
              className={cn(
                "group flex items-start gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-secondary/60",
                p.feito && "opacity-75",
              )}
            >
              {p.feito ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Concluído" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Pendente" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-body-sm font-medium">
                  <span className={cn(p.feito && "line-through decoration-muted-foreground/50")}>{p.titulo}</span>
                  {p.opcional && (
                    <Badge variant="outline" size="sm">
                      opcional
                    </Badge>
                  )}
                </span>
                <span className="block text-caption text-muted-foreground">{p.descricao}</span>
              </span>
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
