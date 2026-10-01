"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { descartarProdutos } from "@/app/ml/(painel)/produtos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ml/campos";
import { MOTIVOS_DESCARTE } from "@/lib/ml/estados";
import { cn } from "@/lib/utils";

/**
 * Descarte com motivo rápido (spec §7): repetido, baixa qualidade, preço,
 * pouco visual, outro + nota opcional. Serve para 1 ou N produtos.
 */
export function DescartarDialog({
  ids,
  aberto,
  aoMudar,
  aoConcluir,
}: {
  ids: string[];
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESCARTE[0].value);
  const [nota, setNota] = useState("");
  const [pendente, iniciar] = useTransition();
  const plural = ids.length > 1;

  function confirmar() {
    iniciar(async () => {
      const r = await descartarProdutos(ids, motivo, nota.trim() || undefined);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      if (r.falhas.length) toast.warning(`${r.mensagem} Falhas: ${r.falhas[0]?.erro ?? ""}`);
      else toast.success(r.mensagem);
      setNota("");
      aoMudar(false);
      aoConcluir?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plural ? `Descartar ${ids.length} produtos` : "Descartar produto"}</DialogTitle>
          <DialogDescription>
            O motivo vira feedback e o produto não volta a ser recomendado durante o período de cooldown.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2" disabled={pendente}>
          <legend className="mb-2 text-body-sm font-medium">Motivo</legend>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS_DESCARTE.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-body-sm transition-colors",
                  motivo === m.value ? "border-tech bg-tech/10" : "border-border hover:bg-secondary/60",
                )}
              >
                <input
                  type="radio"
                  name="motivo-descarte"
                  value={m.value}
                  checked={motivo === m.value}
                  onChange={() => setMotivo(m.value)}
                  className="accent-[rgb(var(--tech))]"
                />
                {m.label}
              </label>
            ))}
          </div>
          <label className="block space-y-1.5 pt-2">
            <span className="text-body-sm font-medium">Nota (opcional)</span>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              placeholder="Ex.: já temos um parecido no catálogo"
              className="min-h-[70px]"
            />
          </label>
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendente || !ids.length}>
            {pendente ? <Loader2 className="animate-spin" /> : <XCircle />}
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
