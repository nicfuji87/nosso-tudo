"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { NativeSelect } from "@/components/ml/campos";
import { Button } from "@/components/ui/button";

export interface FiltroDef {
  nome: string;
  rotulo: string;
  opcoes: { valor: string; rotulo: string }[];
  /** Valor quando o parâmetro está ausente (não aparece como "filtro ativo"). */
  padrao?: string;
}

/** Barra de filtros que grava na URL (router.replace) e volta para a página 1. */
export function FiltrosLogs({ filtros, preservar = ["aba"] }: { filtros: FiltroDef[]; preservar?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendente, iniciar] = useTransition();

  const aplicar = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    p.delete("pagina");
    p.delete("job");
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const ativos = filtros.filter((f) => {
    const v = sp.get(f.nome);
    return v != null && v !== "" && v !== f.padrao;
  });

  const limpar = () => {
    const p = new URLSearchParams();
    for (const k of preservar) {
      const v = sp.get(k);
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-end gap-2" aria-busy={pendente}>
      {filtros.map((f) => (
        <label key={f.nome} className="flex min-w-[150px] flex-1 flex-col gap-1 sm:flex-none">
          <span className="text-caption font-medium text-muted-foreground">{f.rotulo}</span>
          <NativeSelect
            className="h-9 w-full sm:w-auto"
            value={sp.get(f.nome) ?? f.padrao ?? ""}
            onChange={(e) => aplicar({ [f.nome]: e.target.value === f.padrao ? null : e.target.value })}
          >
            {f.opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </NativeSelect>
        </label>
      ))}
      {ativos.length > 0 && (
        <Button size="sm" variant="ghost" onClick={limpar} disabled={pendente}>
          <X /> Limpar filtros
        </Button>
      )}
      {pendente && <Loader2 className="mb-2.5 size-4 animate-spin text-muted-foreground" aria-label="Atualizando" />}
    </div>
  );
}
