import { formatBRL } from "@/lib/format";
import type { GastoPessoa } from "@/lib/db/queries";

const CORES = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

/** Despesas do mês por responsável — barras horizontais. */
export function GastoPorPessoa({ dados }: { dados: GastoPessoa[] }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <ul className="space-y-3">
      {dados.map((p, i) => (
        <li key={p.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body-sm font-medium">{p.nome}</span>
            <span className="shrink-0 text-body-sm tabular-nums">{formatBRL(p.total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full"
              style={{ width: `${(p.total / max) * 100}%`, backgroundColor: CORES[i % CORES.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
