"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Loader2, X } from "lucide-react";
import { aprovarPins, cancelarPins } from "@/app/ml/(painel)/publicacoes/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ml/campos";
import { PinCartao } from "./pin-cartao";
import { useAcao } from "./pin-acoes";
import { hrefCom, pode, type BoardOpcao, type ParamsUrl, type PinView } from "./tipos";

/** Fila de Pins com seleção múltipla e ações em lote (Aprovar / Cancelar). */
export function ListaPins({
  pins,
  boards,
  tz,
  podeOperar,
  params,
}: {
  pins: PinView[];
  boards: BoardOpcao[];
  tz: string;
  podeOperar: boolean;
  params: ParamsUrl;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { pendente, executar } = useAcao();

  const selecionados = useMemo(() => pins.filter((p) => sel.has(p.id)), [pins, sel]);
  const aprovaveis = selecionados.filter((p) => pode.aprovar(p.status)).map((p) => p.id);
  const cancelaveis = selecionados.filter((p) => pode.cancelar(p.status)).map((p) => p.id);
  const todos = pins.length > 0 && pins.every((p) => sel.has(p.id));

  const alternar = (id: string, v: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="space-y-3">
      {podeOperar && (
        <div className="sticky top-[4.25rem] z-20 flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-card backdrop-blur lg:top-2">
          <label className="flex items-center gap-2 text-body-sm">
            <Checkbox checked={todos} onChange={(e) => setSel(e.target.checked ? new Set(pins.map((p) => p.id)) : new Set())} />
            {sel.size ? `${sel.size} selecionado(s)` : "Selecionar página"}
          </label>
          {sel.size > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Processando" />}
              <Button
                size="sm"
                variant="tech"
                disabled={pendente || !aprovaveis.length}
                title={aprovaveis.length ? undefined : "Nenhum selecionado está aguardando aprovação"}
                onClick={() => executar(() => aprovarPins(aprovaveis), { aoConcluir: () => setSel(new Set()) })}
              >
                <CheckCircle2 />
                Aprovar ({aprovaveis.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pendente || !cancelaveis.length}
                onClick={() =>
                  executar(() => cancelarPins(cancelaveis), {
                    confirmar: `Cancelar ${cancelaveis.length} publicação(ões)? Os criativos não são apagados.`,
                    aoConcluir: () => setSel(new Set()),
                  })
                }
              >
                <Ban />
                Cancelar ({cancelaveis.length})
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Limpar seleção" onClick={() => setSel(new Set())}>
                <X />
              </Button>
            </div>
          )}
        </div>
      )}
      <ul className="space-y-2.5">
        {pins.map((p) => (
          <li key={p.id}>
            <PinCartao
              pin={p}
              boards={boards}
              tz={tz}
              podeOperar={podeOperar}
              hrefDetalhe={hrefCom("/ml/publicacoes", params, { pin: p.id })}
              selecionado={sel.has(p.id)}
              onSelecionar={podeOperar ? (v) => alternar(p.id, v) : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
