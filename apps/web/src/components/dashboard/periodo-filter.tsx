"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PeriodoPreset } from "@/lib/periodo";

const OPCOES: { value: PeriodoPreset; label: string }[] = [
  { value: "mes-atual", label: "Este mês" },
  { value: "mes-anterior", label: "Mês passado" },
  { value: "3-meses", label: "Últimos 3 meses" },
  { value: "6-meses", label: "Últimos 6 meses" },
  { value: "ano", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Filtro de tempo dos relatórios: presets + intervalo personalizado.
 * Estado na URL (`?periodo=` e, no custom, `?de=&ate=`); "Este mês" limpa.
 */
export function PeriodoFilter({
  preset,
  de,
  ate,
}: {
  preset: PeriodoPreset;
  de: string | null;
  ate: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dDe, setDDe] = useState(de ?? "");
  const [dAte, setDAte] = useState(ate ?? "");

  function push(params: URLSearchParams) {
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function selecionarPreset(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("de");
    params.delete("ate");
    if (value === "mes-atual") params.delete("periodo");
    else params.set("periodo", value);
    push(params);
  }

  function aplicarCustom(novoDe: string, novoAte: string) {
    if (!novoDe || !novoAte) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", "custom");
    params.set("de", novoDe);
    params.set("ate", novoAte);
    push(params);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={selecionarPreset}>
        <SelectTrigger className="h-9 w-auto min-w-[9.5rem] rounded-full px-4">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dDe}
            max={dAte || undefined}
            onChange={(e) => {
              setDDe(e.target.value);
              aplicarCustom(e.target.value, dAte);
            }}
            className="h-9 rounded-full border border-input bg-card px-3 text-body-sm text-foreground focus:outline-none focus-visible:border-foreground/40"
          />
          <span className="text-caption text-muted-foreground">até</span>
          <input
            type="date"
            value={dAte}
            min={dDe || undefined}
            onChange={(e) => {
              setDAte(e.target.value);
              aplicarCustom(dDe, e.target.value);
            }}
            className="h-9 rounded-full border border-input bg-card px-3 text-body-sm text-foreground focus:outline-none focus-visible:border-foreground/40"
          />
        </div>
      )}
    </div>
  );
}
