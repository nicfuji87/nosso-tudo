import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MesResolvido } from "@/lib/periodo";

/**
 * Navegação mês a mês do Início. Server component de propósito: são só links
 * (`?mes=YYYY-MM`), então funciona sem JS e o Next prefetcha o mês vizinho.
 *
 * Não navega para o futuro — a seta da direita some no mês corrente, mas o
 * espaço fica reservado para o título não pular de lugar.
 */
export function MesNavegador({ mes }: { mes: MesResolvido }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button asChild variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
        <Link href={`/app?mes=${mes.anterior}`} scroll={false} aria-label="Mês anterior">
          <ChevronLeft />
        </Link>
      </Button>

      <h1 className="text-h3 font-semibold tracking-tight">{mes.label}</h1>

      {mes.proximo ? (
        <Button asChild variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
          <Link href={`/app?mes=${mes.proximo}`} scroll={false} aria-label="Próximo mês">
            <ChevronRight />
          </Link>
        </Button>
      ) : (
        <span className="size-9 shrink-0" aria-hidden />
      )}

      {!mes.ehMesAtual && (
        <Button asChild variant="ghost" size="sm" className="ml-1 text-muted-foreground">
          <Link href="/app" scroll={false}>
            Hoje
          </Link>
        </Button>
      )}
    </div>
  );
}
