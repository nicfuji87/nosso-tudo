import { CategoryIcon } from "@/components/patterns/category-icon";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransacaoComRelacoes } from "@/lib/types/db";

export function TransacaoItem({ tx }: { tx: TransacaoComRelacoes }) {
  const isCredito = tx.tipo === "receita" || tx.tipo === "investimento_resgate";
  const pendente = tx.status_revisao !== "confirmado";
  const subtitle =
    [tx.estabelecimento?.nome, tx.categoria?.nome].filter(Boolean).join(" · ") || "Sem categoria";

  return (
    <div className={cn("flex items-center gap-3 py-3", pendente && "opacity-70")}>
      <CategoryIcon icone={tx.categoria?.icone} cor={tx.categoria?.cor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-body-sm font-medium">{tx.descricao}</p>
          {pendente && (
            <Badge variant="warning" size="sm">
              a confirmar
            </Badge>
          )}
        </div>
        <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "tabular text-body-sm font-semibold",
            isCredito ? "text-success" : "text-foreground",
          )}
        >
          {isCredito ? "+ " : "− "}
          {formatBRL(tx.valor)}
        </p>
        <p className="text-caption text-muted-foreground">{formatDayLabel(tx.data_transacao)}</p>
      </div>
    </div>
  );
}
