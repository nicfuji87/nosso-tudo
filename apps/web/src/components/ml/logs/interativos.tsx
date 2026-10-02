"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Linha de tabela clicável (abre o detalhe via URL). Links e botões internos
 * continuam funcionando normalmente; teclado: Enter abre.
 */
export function LinhaClicavel({
  href,
  ativa,
  className,
  children,
}: {
  href: string;
  ativa?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const abrir = () => router.push(href, { scroll: false });
  return (
    <tr
      tabIndex={0}
      aria-selected={ativa}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,summary")) return;
        abrir();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) abrir();
      }}
      className={cn(
        "cursor-pointer align-top transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/60 focus-visible:outline-none",
        ativa && "bg-tech/5",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/**
 * Drawer lateral cujo estado aberto vive na URL (`?job=…`): fechar = voltar à lista com os filtros.
 * Use `key` com o id exibido para reabrir ao trocar de item.
 */
export function DrawerUrl({
  hrefFechar,
  titulo,
  descricao,
  children,
}: {
  hrefFechar: string;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(true);
  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) router.replace(hrefFechar, { scroll: false });
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <SheetTitle>{titulo}</SheetTitle>
          {descricao && <SheetDescription asChild><div>{descricao}</div></SheetDescription>}
        </SheetHeader>
        <div className="mt-5 space-y-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
