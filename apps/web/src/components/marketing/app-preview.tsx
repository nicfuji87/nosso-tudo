import { ArrowUpRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/patterns/category-icon";
import { cn } from "@/lib/utils";

const ROWS = [
  { nome: "Supermercado", icone: "🛒", cor: "#FF7043", valor: "R$ 1.240", pct: 78 },
  { nome: "Moradia", icone: "🏠", cor: "#3D6D84", valor: "R$ 2.100", pct: 92 },
  { nome: "Transporte", icone: "🚗", cor: "#8FA993", valor: "R$ 480", pct: 36 },
];

/** Mock fiel da Home, montado com componentes reais do design system. */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-elevated",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-caption text-muted-foreground">Boa tarde,</p>
          <p className="text-body font-semibold">Bruna</p>
        </div>
        <Avatar className="size-9">
          <AvatarFallback>BL</AvatarFallback>
        </Avatar>
      </div>

      {/* Card de saúde do mês */}
      <div className="mt-4 overflow-hidden rounded-xl bg-brand-graphite p-5 text-brand-offwhite">
        <p className="text-overline uppercase tracking-wide text-brand-offwhite/50">
          Saldo de junho
        </p>
        <p className="tabular mt-1 text-h2 font-semibold tracking-tight text-brand-sage">
          + R$ 2.480,50
        </p>
        <div className="mt-3 flex gap-4 text-caption text-brand-offwhite/60">
          <span className="tabular">Receitas R$ 8.200</span>
          <span className="tabular">Despesas R$ 5.719</span>
        </div>
      </div>

      {/* Gastos por categoria */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-body-sm font-medium">Gastos por categoria</p>
          <ArrowUpRight className="size-4 text-muted-foreground" />
        </div>
        {ROWS.map((r) => (
          <div key={r.nome} className="flex items-center gap-3">
            <CategoryIcon icone={r.icone} cor={r.cor} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-body-sm">{r.nome}</span>
                <span className="tabular text-body-sm font-medium">{r.valor}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${r.pct}%`, backgroundColor: r.cor }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
