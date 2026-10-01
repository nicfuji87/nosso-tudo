import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { jsonBonito, jsonVazio } from "./formatos";

/**
 * JSON formatado e recolhível. Os dados já chegam redigidos do servidor
 * (tokens/Authorization nunca são gravados) — aqui só exibimos.
 */
export function JsonBloco({
  titulo,
  valor,
  aberto,
  className,
}: {
  titulo: string;
  valor: unknown;
  aberto?: boolean;
  className?: string;
}) {
  if (jsonVazio(valor)) {
    return (
      <div className={cn("text-caption text-muted-foreground", className)}>
        <span className="font-medium text-foreground">{titulo}:</span> vazio
      </div>
    );
  }
  return (
    <details className={cn("group rounded-lg border border-border/70 bg-secondary/40", className)} open={aberto}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-caption font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {titulo}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-border/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/90">
        {typeof valor === "string" ? valor : jsonBonito(valor)}
      </pre>
    </details>
  );
}
