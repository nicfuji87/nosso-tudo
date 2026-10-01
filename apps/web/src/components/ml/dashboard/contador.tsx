import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarNumero } from "@/components/ml/logs/formatos";

type Tom = "neutro" | "acao" | "alerta" | "erro" | "ok";

const TONS: Record<Tom, { caixa: string; icone: string }> = {
  neutro: { caixa: "border-border/70 bg-card", icone: "bg-secondary text-muted-foreground" },
  acao: { caixa: "border-tech/40 bg-tech/5", icone: "bg-tech/15 text-tech" },
  alerta: { caixa: "border-warning/40 bg-warning/5", icone: "bg-warning/15 text-warning" },
  erro: { caixa: "border-destructive/40 bg-destructive/5", icone: "bg-destructive/15 text-destructive" },
  ok: { caixa: "border-success/30 bg-success/5", icone: "bg-success/15 text-success" },
};

/** Número clicável do Dashboard: leva à lista já filtrada. */
export function ContadorLink({
  href,
  rotulo,
  valor,
  dica,
  icone: Icone,
  tom = "neutro",
}: {
  href: string;
  rotulo: string;
  valor: number;
  dica?: string;
  icone: LucideIcon;
  tom?: Tom;
}) {
  const t = TONS[tom];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl border p-3.5 shadow-card transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:shadow-focus",
        t.caixa,
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.icone)}>
        <Icone className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="tabular block text-h4 font-semibold leading-tight">{formatarNumero(valor, true)}</span>
        <span className="block truncate text-caption text-muted-foreground">{rotulo}</span>
        {dica && <span className="block truncate text-caption text-muted-foreground/80">{dica}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  );
}

/** Métrica não clicável (bloco de performance). */
export function Metrica({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <p className="text-overline uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="tabular mt-0.5 text-h4 font-semibold leading-tight">{valor}</p>
      {dica && <p className="text-caption text-muted-foreground">{dica}</p>}
    </div>
  );
}
