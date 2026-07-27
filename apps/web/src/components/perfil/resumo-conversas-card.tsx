"use client";

import { useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { salvarResumoConversas } from "@/app/app/perfil/actions";

const textareaCls = cn(
  "flex min-h-[160px] w-full rounded-md border border-input bg-card px-4 py-2.5 text-body-sm text-foreground transition-shadow duration-fast ease-smooth",
  "placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:border-foreground/40 focus-visible:shadow-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/**
 * Editor do resumo rolante das conversas (lib/nia/resumo.ts).
 *
 * Existe porque o resumo é reescrito todo dia em cima de si mesmo: sem uma tela
 * onde dá para ler e corrigir, um erro que entre nele circula para sempre sem
 * ninguém ver. Apagar é uma saída legítima — no dia seguinte ele recomeça.
 */
export function ResumoConversasCard({ resumoInicial }: { resumoInicial: string }) {
  const [texto, setTexto] = useState(resumoInicial);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  async function gravar(valor: string, msgOk: string) {
    setSalvando(true);
    const r = await salvarResumoConversas(valor);
    setSalvando(false);
    if (r.error) {
      toast.error("Erro ao salvar", { description: r.error });
      return;
    }
    setSujo(false);
    toast.success(msgOk);
  }

  return (
    <div className="space-y-4">
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setSujo(true);
        }}
        maxLength={1500}
        className={textareaCls}
        aria-label="Resumo das conversas"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-xs text-muted-foreground">{texto.length}/1500</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={salvando || !texto}
            onClick={() => {
              setTexto("");
              void gravar("", "Resumo apagado");
            }}
          >
            <Trash2 className="size-4" /> Apagar
          </Button>
          <Button type="button" onClick={() => gravar(texto, "Resumo atualizado")} disabled={!sujo || salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar resumo
          </Button>
        </div>
      </div>
    </div>
  );
}
