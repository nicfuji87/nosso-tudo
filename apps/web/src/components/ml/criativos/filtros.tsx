"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Layers, List, Loader2, Search, X, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox, NativeSelect } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import { MODOS_IMAGEM, labelModo, type FamiliaOpcao } from "./rotulos";

export type Vista = "familias" | "kanban" | "lista" | "revisao";

/** "Por família" é a vista padrão (V2 §11.5); as demais mostram todas as variantes. */
const VISTAS: { valor: Vista; label: string; icon: typeof List }[] = [
  { valor: "familias", label: "Por família", icon: Layers },
  { valor: "kanban", label: "Kanban", icon: Columns3 },
  { valor: "lista", label: "Lista", icon: List },
  { valor: "revisao", label: "Revisão rápida", icon: Zap },
];

const STATUS_CHIPS: { valor: string; label: string }[] = [
  { valor: "", label: "Todos" },
  { valor: "to_generate", label: "A gerar" },
  { valor: "generating", label: "Em geração" },
  { valor: "waiting_manual_image", label: "Aguardando imagem" },
  { valor: "review", label: "Revisão" },
  { valor: "approved", label: "Aprovados" },
  { valor: "rejected", label: "Rejeitados" },
  { valor: "published", label: "Publicados" },
  { valor: "archived", label: "Arquivados" },
];

/** Filtros persistidos na URL (spec §25). */
export function FiltrosCriativos({
  vista,
  produtos,
  familias,
  totalRevisao,
}: {
  vista: Vista;
  produtos: { id: string; title: string }[];
  familias: FamiliaOpcao[];
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
    p.delete("acao");
    const s = p.toString();
    iniciar(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  function hrefVista(v: Vista) {
    const p = new URLSearchParams(sp.toString());
    p.delete("criativo");
    p.delete("acao");
    if (v === "familias") p.delete("vista");
    else p.set("vista", v);
    if (v === "revisao") p.delete("status");
    if (v !== "familias") p.delete("arquivadas");
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const temFiltro = Boolean(sp.get("status") || sp.get("modo") || sp.get("produto") || sp.get("q") || sp.get("familia") || sp.get("arquivadas"));
  const statusAtual = sp.get("status") ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-3xl bg-secondary p-1 sm:h-10 sm:flex-nowrap sm:rounded-full" aria-label="Visualização">
          {VISTAS.map((v, i) => (
            <Fragment key={v.valor}>
              {i === 1 && (
                <span className="hidden items-center gap-2 pl-1.5 pr-0.5 text-overline uppercase text-muted-foreground md:inline-flex" aria-hidden>
                  <span className="h-4 w-px bg-border" /> Todas as variantes
                </span>
              )}
              <Link
                href={hrefVista(v.valor)}
                scroll={false}
                aria-current={vista === v.valor ? "page" : undefined}
                title={v.valor === "familias" ? undefined : `Todas as variantes — ${v.label}`}
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
            </Fragment>
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
            placeholder={vista === "familias" ? "Buscar por família ou hipótese (Enter)" : "Buscar por headline ou título (Enter)"}
            className="h-10 rounded-xl pl-9"
            aria-label="Buscar criativos"
          />
        </div>
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
        {familias.length > 0 && (
          <NativeSelect value={sp.get("familia") ?? ""} onChange={(e) => atualizar({ familia: e.target.value || null })} aria-label="Família" className="max-w-56">
            <option value="">Todas as famílias</option>
            {familias.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name.length > 50 ? `${f.name.slice(0, 50)}…` : f.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {vista === "familias" && (
          <label className="flex h-10 items-center gap-2 rounded-xl px-2 text-body-sm text-muted-foreground">
            <Checkbox checked={sp.get("arquivadas") === "1"} onChange={(e) => atualizar({ arquivadas: e.target.checked ? "1" : null })} />
            Famílias arquivadas
          </label>
        )}
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              atualizar({ status: null, modo: null, produto: null, q: null, familia: null, arquivadas: null });
            }}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-body-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" aria-hidden /> Limpar
          </button>
        )}
      </form>

      {vista !== "revisao" && (
        <nav aria-label="Status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STATUS_CHIPS.map((st) => (
            <button
              key={st.valor || "todos"}
              type="button"
              onClick={() => atualizar({ status: st.valor || null })}
              aria-pressed={statusAtual === st.valor}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-caption font-medium transition-colors",
                statusAtual === st.valor ? "border-tech bg-tech/10 text-tech" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {st.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
