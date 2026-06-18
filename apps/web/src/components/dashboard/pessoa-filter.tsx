"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Filtra os relatórios pela pessoa que se beneficiou do gasto (beneficiário).
 * Estado na URL (`?pessoa=<id>`); "Todas" remove o parâmetro.
 */
export function PessoaFilter({
  pessoas,
  pessoaId,
}: {
  pessoas: { id: string; nome: string }[];
  pessoaId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pessoas.length === 0) return null;

  function selecionar(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "todos") params.delete("pessoa");
    else params.set("pessoa", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Select value={pessoaId ?? "todos"} onValueChange={selecionar}>
      <SelectTrigger className="h-9 w-auto min-w-[10rem] gap-2 rounded-full px-4">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todas as pessoas</SelectItem>
        {pessoas.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
