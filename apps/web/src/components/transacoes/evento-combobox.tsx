"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizarTexto } from "@/lib/normalize";

/**
 * Campo de evento/contexto: continua sendo TEXTO LIVRE (digite um novo nome para
 * criar), mas mostra num dropdown os eventos que já existem para reaproveitar —
 * evita duplicar "Viagem Argentina" / "viagem argentina". Selecionar preenche o
 * texto com o nome existente; o salvar resolve por nome (não duplica).
 */
export function EventoCombobox({
  id,
  value,
  onChange,
  eventos,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (s: string) => void;
  eventos: { id: string; nome: string }[];
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const termo = normalizarTexto(value ?? "");
  const sugestoes = eventos
    .filter((e) => !termo || normalizarTexto(e.nome).includes(termo))
    .slice(0, 8);
  // Se o que está escrito já é exatamente um evento existente, não há o que sugerir.
  const exato = eventos.some((e) => normalizarTexto(e.nome) === termo);
  const mostra = aberto && sugestoes.length > 0 && !exato;

  return (
    <div ref={ref} className="relative">
      <Input
        id={id}
        value={value ?? ""}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
        }}
      />
      {mostra && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-card">
          {!termo && (
            <li className="px-3 pb-1 pt-0.5 text-caption text-muted-foreground">Eventos já usados</li>
          )}
          {sugestoes.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(e.nome);
                  setAberto(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm transition-colors hover:bg-secondary/60"
              >
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{e.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
