"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Navegador de mês para os relatórios. Mantém o mês selecionado na URL
 * (`?mes=YYYY-MM`); no mês corrente o parâmetro é removido (URL limpa).
 * O futuro filtro por pessoa/categoria entra ao lado, no mesmo padrão.
 */
export function PeriodoFilter({ mes, ehMesAtual }: { mes: string; ehMesAtual: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ano, m] = mes.split("-").map(Number);
  const rotulo = new Date(ano!, m! - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const titulo = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);

  function navegar(d: Date) {
    const agora = new Date();
    const ehAtual = d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
    const params = new URLSearchParams(searchParams.toString());
    if (ehAtual) params.delete("mes");
    else params.set("mes", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const irPara = (deltaMes: number) => navegar(new Date(ano!, m! - 1 + deltaMes, 1));
  const irParaAtual = () => navegar(new Date());

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => irPara(-1)}
          aria-label="Mês anterior"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-[8.5rem] text-center text-body-sm font-medium tabular-nums">{titulo}</span>
        <button
          type="button"
          onClick={() => irPara(1)}
          disabled={ehMesAtual}
          aria-label="Próximo mês"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      {!ehMesAtual && (
        <button
          type="button"
          onClick={irParaAtual}
          className="text-caption font-medium text-primary transition-colors hover:underline"
        >
          Este mês
        </button>
      )}
    </div>
  );
}
