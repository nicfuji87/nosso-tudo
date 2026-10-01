"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, CheckCircle2, ChevronDown, Package, ThumbsUp, Trash2 } from "lucide-react";
import { aprovarProdutos, descartarProdutos } from "@/app/ml/(painel)/produtos/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Checkbox } from "@/components/ml/campos";
import { ScoreBadge } from "@/components/ml/status";
import { useExecutar } from "@/components/ml/criativos/menu-criativo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MOTIVOS_DESCARTE } from "@/lib/ml/estados";
import { cn } from "@/lib/utils";

export interface ProdutoPendente {
  id: string;
  title: string;
  thumbnail: string | null;
  score: number | null;
  confianca: number | null;
  preco: number | null;
  positivo: string | null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function MenuDescartar({ ids, rotulo, desabilitado, aoConcluir }: { ids: string[]; rotulo: string; desabilitado?: boolean; aoConcluir?: () => void }) {
  const { pendente, executar } = useExecutar();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={desabilitado || pendente || !ids.length}>
          <Trash2 /> {rotulo} <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Motivo do descarte</DropdownMenuLabel>
        {MOTIVOS_DESCARTE.map((m) => (
          <DropdownMenuItem key={m.value} onSelect={() => executar(() => descartarProdutos(ids, m.value), aoConcluir)}>
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Produtos analisados aguardando decisão (spec §17: 2–5 s por item). */
export function ProdutosAprovacao({ produtos, podeOperar }: { produtos: ProdutoPendente[]; podeOperar: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const marcados = produtos.filter((p) => sel.has(p.id)).map((p) => p.id);
  const todos = produtos.length > 0 && marcados.length === produtos.length;

  function alternar(id: string, v: boolean) {
    setSel((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  return (
    <div className="space-y-3">
      {podeOperar && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
          <label className="mr-auto flex items-center gap-2 text-body-sm">
            <Checkbox checked={todos} onChange={(e) => setSel(e.target.checked ? new Set(produtos.map((p) => p.id)) : new Set())} />
            {marcados.length ? `${marcados.length} selecionado(s)` : "Selecionar todos"}
          </label>
          <AcaoBotao size="sm" variant="tech" disabled={!marcados.length} acao={() => aprovarProdutos(marcados)} aoConcluir={() => setSel(new Set())}>
            <CheckCheck /> Aprovar selecionados
          </AcaoBotao>
          <MenuDescartar ids={marcados} rotulo="Descartar" desabilitado={!marcados.length} aoConcluir={() => setSel(new Set())} />
        </div>
      )}
      <ul className="divide-y divide-border/70">
        {produtos.map((p) => (
          <li key={p.id} className={cn("flex flex-wrap items-center gap-3 py-2.5 sm:flex-nowrap", sel.has(p.id) && "bg-tech/5")}>
            {podeOperar && <Checkbox checked={sel.has(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} aria-label={`Selecionar ${p.title}`} />}
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card">
              {p.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnail} alt={p.title} loading="lazy" className="absolute inset-0 size-full object-contain" />
              ) : (
                <Package className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/ml/produtos/${p.id}`} className="line-clamp-1 text-body-sm font-medium hover:underline">
                {p.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                <ScoreBadge score={p.score} confianca={p.confianca} className="px-2 py-0" />
                {p.preco != null && <span className="tabular">{brl.format(p.preco)}</span>}
                {p.positivo && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-success">
                    <ThumbsUp className="size-3 shrink-0" aria-hidden />
                    <span className="line-clamp-1">{p.positivo}</span>
                  </span>
                )}
              </div>
            </div>
            {podeOperar && (
              <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                <AcaoBotao size="sm" variant="tech" acao={() => aprovarProdutos([p.id])} className="flex-1 sm:flex-none">
                  <CheckCircle2 /> Aprovar
                </AcaoBotao>
                <MenuDescartar ids={[p.id]} rotulo="Descartar" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
