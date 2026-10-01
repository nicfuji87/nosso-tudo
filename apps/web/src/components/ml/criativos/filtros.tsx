"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, List, Loader2, Search, X, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ml/campos";
import { CREATIVE_STATUS_LABEL } from "@/lib/ml/estados";
import { cn } from "@/lib/utils";
import { MODOS_IMAGEM, labelModo } from "./rotulos";

export type Vista = "kanban" | "lista" | "revisao";

const VISTAS: { valor: Vista; label: string; icon: typeof List }[] = [
  { valor: "kanban", label: "Kanban", icon: Columns3 },
  { valor: "lista", label: "Lista", icon: List },
  { valor: "revisao", label: "Revisão rápida", icon: Zap },
];

/** Filtros persistidos na URL (spec §25). */
export function FiltrosCriativos({
  vista,
  produtos,
  totalRevisao,
}: {
  vista: Vista;
  produtos: { id: string; title: string }[];
  totalRevisao: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  function atualizar(muda: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(muda)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("criativo");
    const s = p.toString();
    iniciar(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  function hrefVista(v: Vista) {
    const p = new URLSearchParams(sp.toString());
    p.delete("criativo");
    if (v === "kanban") p.delete("vista");
    else p.set("vista", v);
    if (v === "revisao") p.delete("status");
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const temFiltro = Boolean(sp.get("status") || sp.get("modo") || sp.get("produto") || sp.get("q"));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex h-10 items-center gap-1 rounded-full bg-secondary p-1" aria-label="Visualização">
          {VISTAS.map((v) => (
            <Link
              key={v.valor}
              href={hrefVista(v.valor)}
              scroll={false}
              aria-current={vista === v.valor ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-all",
                vista === v.valor ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-4" aria-hidden />
              {v.label}
              {v.valor === "revisao" && totalRevisao > 0 && (
                <span className="rounded-full bg-tech px-1.5 text-overline text-tech-foreground tabular">{totalRevisao}</span>
              )}
            </Link>
          ))}
        </nav>
        {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </div>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          atualizar({ q: q.trim() || null });
        }}
      >
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por headline ou título (Enter)"
            className="h-10 rounded-xl pl-9"
            aria-label="Buscar criativos"
          />
        </div>
        {vista !== "revisao" && (
          <NativeSelect value={sp.get("status") ?? ""} onChange={(e) => atualizar({ status: e.target.value || null })} aria-label="Status">
            <option value="">Todos os status</option>
            {Object.entries(CREATIVE_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect value={sp.get("modo") ?? ""} onChange={(e) => atualizar({ modo: e.target.value || null })} aria-label="Modo de imagem">
          <option value="">Todos os modos</option>
          {MODOS_IMAGEM.map((m) => (
            <option key={m} value={m}>
              {labelModo(m)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={sp.get("produto") ?? ""}
          onChange={(e) => atualizar({ produto: e.target.value || null })}
          aria-label="Produto"
          className="max-w-64"
        >
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title.length > 60 ? `${p.title.slice(0, 60)}…` : p.title}
            </option>
          ))}
        </NativeSelect>
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              atualizar({ status: null, modo: null, produto: null, q: null });
            }}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-body-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" aria-hidden /> Limpar
          </button>
        )}
      </form>
    </div>
  );
}
