"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Formulário de filtros persistidos na URL (spec §25). Os campos são inputs
 * nativos com `name` (renderizados pelo servidor como children); ao aplicar,
 * só os valores preenchidos vão para a query e a paginação volta à 1.
 */
export function FormFiltros({
  children,
  className,
  limparHref,
  rotuloAplicar = "Aplicar filtros",
}: {
  children: React.ReactNode;
  className?: string;
  limparHref?: string;
  rotuloAplicar?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, iniciar] = useTransition();

  function aplicar(form: HTMLFormElement) {
    const dados = new FormData(form);
    const qs = new URLSearchParams();
    dados.forEach((valor, chave) => {
      if (typeof valor === "string" && valor.trim() !== "" && chave !== "pagina") qs.set(chave, valor.trim());
    });
    const s = qs.toString();
    iniciar(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  return (
    <form
      className={cn("rounded-xl border border-border/70 bg-card p-4 shadow-card", className)}
      onSubmit={(e) => {
        e.preventDefault();
        aplicar(e.currentTarget);
      }}
      onChange={(e) => {
        // selects aplicam na hora; campos de texto/número esperam o Enter ou o botão
        if (e.target instanceof HTMLSelectElement && e.currentTarget) aplicar(e.currentTarget);
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {limparHref && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => iniciar(() => router.push(limparHref, { scroll: false }))}
            disabled={pendente}
          >
            <RotateCcw /> Limpar
          </Button>
        )}
        <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <SlidersHorizontal />}
          {rotuloAplicar}
        </Button>
      </div>
    </form>
  );
}
