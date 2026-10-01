"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import { hrefCom, type ParamsUrl } from "./tipos";

/** Select que grava o filtro na URL (spec §25: filtros persistidos). */
export function FiltroSelect({
  nome,
  rotulo,
  valor,
  opcoes,
  params,
  base = "/ml/publicacoes",
  todos = "Todos",
  limpar = ["pagina"],
  className,
}: {
  nome: string;
  rotulo: string;
  valor: string | undefined;
  opcoes: { value: string; label: string }[];
  params: ParamsUrl;
  base?: string;
  todos?: string;
  limpar?: string[];
  className?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <NativeSelect
      aria-label={rotulo}
      value={valor ?? ""}
      disabled={pendente}
      className={cn("h-9 max-w-[14rem]", className)}
      onChange={(e) => {
        const mud: Record<string, string | null> = { [nome]: e.target.value || null };
        for (const k of limpar) mud[k] = null;
        iniciar(() => router.replace(hrefCom(base, params, mud), { scroll: false }));
      }}
    >
      <option value="">
        {rotulo}: {todos}
      </option>
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
