"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Filtra os relatórios por categoria de topo (pai) — mostra o detalhe dela em
 * subcategorias. Estado na URL (`?categoria=<id>`); "Todas" remove o parâmetro.
 */
export function CategoriaFilter({
  categorias,
  categoriaId,
}: {
  categorias: { id: string; nome: string; icone: string | null }[];
  categoriaId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (categorias.length === 0) return null;

  function selecionar(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "todas") params.delete("categoria");
    else params.set("categoria", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Select value={categoriaId ?? "todas"} onValueChange={selecionar}>
      <SelectTrigger className="h-9 w-auto min-w-[10rem] gap-2 rounded-full px-4">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todas">Todas as categorias</SelectItem>
        {categorias.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.icone ? `${c.icone} ` : ""}
            {c.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
