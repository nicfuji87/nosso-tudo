import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Paginação por links (mantém os demais filtros da URL). */
export function Paginacao({
  base,
  params,
  pagina,
  total,
  porPagina,
}: {
  base: string;
  params: Record<string, string | undefined>;
  pagina: number;
  total: number;
  porPagina: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") qs.set(k, v);
    if (p > 1) qs.set("pagina", String(p));
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  const link = (p: number, ativo: boolean, children: React.ReactNode, label: string) =>
    ativo ? (
      <Link
        href={href(p)}
        aria-label={label}
        className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border px-3 text-body-sm hover:bg-secondary"
      >
        {children}
      </Link>
    ) : (
      <span
        aria-disabled
        className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border/50 px-3 text-body-sm text-muted-foreground/50"
      >
        {children}
      </span>
    );

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginação">
      <p className="text-caption text-muted-foreground tabular">
        {de}–{ate} de {total.toLocaleString("pt-BR")}
      </p>
      <div className="flex items-center gap-2">
        {link(pagina - 1, pagina > 1, <ChevronLeft className="size-4" />, "Página anterior")}
        <span className={cn("px-2 text-body-sm tabular")}>
          {pagina} / {paginas}
        </span>
        {link(pagina + 1, pagina < paginas, <ChevronRight className="size-4" />, "Próxima página")}
      </div>
    </nav>
  );
}
