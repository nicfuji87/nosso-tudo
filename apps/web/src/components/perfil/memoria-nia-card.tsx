"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

/**
 * Editor genérico de uma lista curada de frases (memória da família,
 * preferências…). Salva a lista inteira de uma vez via a action recebida.
 */
export function ListaCuradaCard({
  itensIniciais,
  salvar,
  addPlaceholder,
  emptyText,
  saveLabel = "Salvar",
  toastOk = "Salvo",
  maxLen = 300,
}: {
  itensIniciais: string[];
  salvar: (itens: string[]) => Promise<{ error?: string; ok?: boolean }>;
  addPlaceholder: string;
  emptyText: string;
  saveLabel?: string;
  toastOk?: string;
  maxLen?: number;
}) {
  const [itens, setItens] = useState<string[]>(itensIniciais);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  function editar(i: number, v: string) {
    setItens((a) => a.map((f, j) => (j === i ? v : f)));
    setSujo(true);
  }
  function remover(i: number) {
    setItens((a) => a.filter((_, j) => j !== i));
    setSujo(true);
  }
  function adicionar() {
    const v = novo.trim();
    if (!v) return;
    setItens((a) => [...a, v]);
    setNovo("");
    setSujo(true);
  }

  async function persistir() {
    setSalvando(true);
    const limpos = itens.map((f) => f.trim()).filter(Boolean);
    const r = await salvar(limpos);
    setSalvando(false);
    if (r.error) {
      toast.error("Erro ao salvar", { description: r.error });
      return;
    }
    setItens(limpos);
    setSujo(false);
    toast.success(toastOk);
  }

  return (
    <div className="space-y-3">
      {itens.length === 0 ? (
        <p className="rounded-lg bg-secondary/50 p-3 text-body-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input value={f} onChange={(e) => editar(i, e.target.value)} maxLength={maxLen} aria-label={`Item ${i + 1}`} />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remover(i)}
                aria-label="Remover"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          maxLength={maxLen}
          placeholder={addPlaceholder}
        />
        <Button type="button" variant="secondary" onClick={adicionar} disabled={!novo.trim()} className="shrink-0">
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={persistir} disabled={!sujo || salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
