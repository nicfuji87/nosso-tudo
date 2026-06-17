"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { normalizarTexto } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import type { Categoria } from "@/lib/types/db";

/**
 * Seletor de categoria buscável e agrupado (grupo → subcategorias), em ordem
 * alfabética. A busca ignora acento e símbolos (normalizarTexto).
 */
export function CategoriaPicker({
  categorias,
  value,
  onChange,
  placeholder = "Selecionar categoria",
}: {
  categorias: Categoria[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selecionada = categorias.find((c) => c.id === value) ?? null;

  const pais = categorias
    .filter((c) => !c.categoria_pai_id)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const filhosPorPai = new Map<string, Categoria[]>();
  for (const c of categorias) {
    if (!c.categoria_pai_id) continue;
    const arr = filhosPorPai.get(c.categoria_pai_id) ?? [];
    arr.push(c);
    filhosPorPai.set(c.categoria_pai_id, arr);
  }
  for (const arr of filhosPorPai.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const termo = normalizarTexto(q);
  const casa = (nome: string) => !termo || normalizarTexto(nome).includes(termo);

  const grupos = pais
    .map((pai) => {
      const todos = filhosPorPai.get(pai.id) ?? [];
      const paiCasa = casa(pai.nome);
      const filhos = paiCasa ? todos : todos.filter((f) => casa(f.nome));
      if (!paiCasa && filhos.length === 0) return null;
      return { pai, filhos };
    })
    .filter((g): g is { pai: Categoria; filhos: Categoria[] } => g !== null);

  function escolher(id: string) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-body-sm transition-colors hover:bg-secondary/40"
      >
        <span className={cn("truncate", !selecionada && "text-muted-foreground")}>
          {selecionada ? `${selecionada.icone ? `${selecionada.icone} ` : ""}${selecionada.nome}` : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex max-h-[88dvh] flex-col">
          <SheetHeader className="pr-8">
            <SheetTitle>Categoria</SheetTitle>
          </SheetHeader>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar categoria"
              className="pl-9"
            />
          </div>
          <div className="-mx-1 mt-3 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
            {grupos.length === 0 ? (
              <p className="py-10 text-center text-body-sm text-muted-foreground">Nenhuma categoria encontrada.</p>
            ) : (
              grupos.map(({ pai, filhos }) => (
                <div key={pai.id}>
                  <button
                    type="button"
                    onClick={() => escolher(pai.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/60"
                  >
                    {pai.icone && <span className="shrink-0">{pai.icone}</span>}
                    <span className="flex-1 truncate text-body-sm font-medium">{pai.nome}</span>
                    {value === pai.id && <Check className="size-4 shrink-0 text-accent" />}
                  </button>
                  {filhos.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => escolher(f.id)}
                      className="flex w-full items-center gap-2 rounded-lg py-2 pl-9 pr-2 text-left transition-colors hover:bg-secondary/60"
                    >
                      <span className="flex-1 truncate text-body-sm text-muted-foreground">{f.nome}</span>
                      {value === f.id && <Check className="size-4 shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
