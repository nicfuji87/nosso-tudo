"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { salvarMemoriaNia } from "@/app/app/perfil/actions";

/**
 * Edita a memória da família que a Nia recebe como contexto (nia_contexto.fatos).
 * É o que a Nia "lembra" sobre a rotina/preferências — o usuário pode revisar,
 * corrigir ou apagar. Salva a lista inteira de uma vez.
 */
export function MemoriaNiaCard({ fatosIniciais }: { fatosIniciais: string[] }) {
  const [fatos, setFatos] = useState<string[]>(fatosIniciais);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  function editar(i: number, v: string) {
    setFatos((a) => a.map((f, j) => (j === i ? v : f)));
    setSujo(true);
  }
  function remover(i: number) {
    setFatos((a) => a.filter((_, j) => j !== i));
    setSujo(true);
  }
  function adicionar() {
    const v = novo.trim();
    if (!v) return;
    setFatos((a) => [...a, v]);
    setNovo("");
    setSujo(true);
  }

  async function salvar() {
    setSalvando(true);
    const limpos = fatos.map((f) => f.trim()).filter(Boolean);
    const r = await salvarMemoriaNia(limpos);
    setSalvando(false);
    if (r.error) {
      toast.error("Erro ao salvar", { description: r.error });
      return;
    }
    setFatos(limpos);
    setSujo(false);
    toast.success("Memória atualizada");
  }

  return (
    <div className="space-y-3">
      {fatos.length === 0 ? (
        <p className="rounded-lg bg-secondary/50 p-3 text-body-sm text-muted-foreground">
          A Nia ainda não guardou nada. Conforme você conversa, ela aprende a rotina e as preferências da família — e
          tudo o que ela lembrar aparece aqui para você revisar.
        </p>
      ) : (
        <ul className="space-y-2">
          {fatos.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                value={f}
                onChange={(e) => editar(i, e.target.value)}
                maxLength={300}
                aria-label={`Memória ${i + 1}`}
              />
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
          maxLength={300}
          placeholder="Adicionar algo que a Nia deve lembrar…"
        />
        <Button type="button" variant="secondary" onClick={adicionar} disabled={!novo.trim()} className="shrink-0">
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={salvar} disabled={!sujo || salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar memória
        </Button>
      </div>
    </div>
  );
}
