import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/format";
import type { DependenciaFornecedores, DinheiroSemDono } from "@/lib/db/queries";

const CORES = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0", "#3D6D84", "#8FA993"];

/** Onde a família mais concentra os gastos — dependência de poucos fornecedores. */
export function DependenciaFornecedoresCard({ dados }: { dados: DependenciaFornecedores }) {
  const { fornecedores, total, topPct, topN } = dados;
  if (fornecedores.length === 0 || total <= 0) return null;
  const max = Math.max(1, ...fornecedores.map((f) => f.total));

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-body-sm font-medium">Dependência de fornecedores</p>
        <p className="text-caption text-muted-foreground">
          {topN > 0 && (
            <>
              Os {topN} maiores concentram{" "}
              <span className="font-medium text-foreground">{Math.round(topPct)}%</span> dos gastos do período.
            </>
          )}
        </p>
        <ul className="mt-4 space-y-3">
          {fornecedores.map((f, i) => {
            const pct = total > 0 ? (f.total / total) * 100 : 0;
            return (
              <li key={f.id}>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="min-w-0 truncate">{f.nome}</span>
                  <span className="tabular shrink-0 font-medium">
                    {formatBRL(f.total)}{" "}
                    <span className="text-caption font-normal text-muted-foreground">({Math.round(pct)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(f.total / max) * 100}%`, backgroundColor: CORES[i % CORES.length] }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Dinheiro que saiu sem destino claro (despesas sem categoria) — pra recuperar consciência. */
export function DinheiroSemDonoCard({ dados }: { dados: DinheiroSemDono }) {
  if (dados.linhas.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-body-sm font-medium">Dinheiro sem dono</p>
        <p className="text-caption text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{formatBRL(dados.total)}</span> saíram sem uma
          categoria — não sabemos no que foi. Categorize para o dinheiro contar sua história.
        </p>
        <ul className="mt-4 divide-y divide-border/70">
          {dados.linhas.slice(0, 8).map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium">{l.descricao}</p>
                <p className="text-caption text-muted-foreground">{formatDate(l.data)}</p>
              </div>
              <span className="tabular shrink-0 text-body-sm font-medium">{formatBRL(l.valor)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
