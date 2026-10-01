"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { aprovarProdutos, reanalisarProdutos } from "@/app/ml/(painel)/produtos/actions";
import { Checkbox } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { DescartarDialog } from "@/components/ml/produtos/descartar-dialog";
import { Button } from "@/components/ui/button";
import { CardDescoberta } from "./card-descoberta";
import type { ItemDescoberta } from "./tipos";

/** Grade de descobertas com seleção múltipla e barra de ações em lote (spec §7). */
export function ListaDescobertas({ itens, podeOperar }: { itens: ItemDescoberta[]; podeOperar: boolean }) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [descartar, setDescartar] = useState<string[] | null>(null);
  const [jobLote, setJobLote] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const idsPagina = useMemo(() => itens.map((i) => i.id), [itens]);
  // seleção só do que ainda está na página (após refresh, itens aprovados somem)
  const sel = idsPagina.filter((id) => selecionados.has(id));
  const todos = sel.length > 0 && sel.length === idsPagina.length;

  function alternar(id: string, v: boolean) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function aprovarLote() {
    iniciar(async () => {
      const r = await aprovarProdutos(sel);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      if (r.falhas.length) toast.warning(`${r.mensagem} Ex.: ${r.falhas[0]?.erro ?? ""}`);
      else toast.success(r.mensagem);
      setSelecionados(new Set());
      router.refresh();
    });
  }

  function reanalisarLote() {
    iniciar(async () => {
      const r = await reanalisarProdutos(sel);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      setJobLote(r.jobId ?? null);
      setSelecionados(new Set());
    });
  }

  return (
    <div className="space-y-3">
      {podeOperar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Checkbox
              checked={todos}
              ref={(el) => {
                if (el) el.indeterminate = sel.length > 0 && !todos;
              }}
              onChange={(e) => setSelecionados(e.target.checked ? new Set(idsPagina) : new Set())}
              aria-label="Selecionar todos da página"
            />
            Selecionar todos da página
          </label>
          {jobLote && <JobStatus jobId={jobLote} />}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {itens.map((item) => (
          <li key={item.id} className="flex">
            <CardDescoberta
              item={item}
              podeOperar={podeOperar}
              selecionado={selecionados.has(item.id)}
              aoSelecionar={(v) => alternar(item.id, v)}
              aoDescartar={() => setDescartar([item.id])}
            />
          </li>
        ))}
      </ul>

      {podeOperar && sel.length > 0 && (
        <div
          role="toolbar"
          aria-label="Ações em lote"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-elevated backdrop-blur-xl lg:left-64"
        >
          <span className="pl-1 text-body-sm font-medium tabular">
            {sel.length} selecionado{sel.length > 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="tech" onClick={aprovarLote} disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Check />} Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDescartar(sel)} disabled={pendente}>
              <X /> Descartar
            </Button>
            <Button size="sm" variant="outline" onClick={reanalisarLote} disabled={pendente}>
              <RefreshCw /> Reanalisar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())} disabled={pendente}>
              Limpar
            </Button>
          </div>
        </div>
      )}

      <DescartarDialog
        ids={descartar ?? []}
        aberto={descartar !== null}
        aoMudar={(v) => !v && setDescartar(null)}
        aoConcluir={() => setSelecionados(new Set())}
      />
    </div>
  );
}
