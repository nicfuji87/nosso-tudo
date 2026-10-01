"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { rejeitarCriativos } from "@/app/ml/(painel)/criativos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import { MOTIVOS_REJEICAO } from "./rotulos";

/** Rejeição com motivo obrigatório (vira feedback para a geração). */
export function RejeitarDialog({
  ids,
  aberto,
  aoMudar,
  aoConcluir,
}: {
  ids: string[];
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (aberto) setMotivo("");
  }, [aberto]);

  const valido = motivo.trim().length >= 2;

  function confirmar() {
    if (!valido || !ids.length) return;
    iniciar(async () => {
      const r = await rejeitarCriativos(ids, motivo.trim());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(ids.length > 1 ? `${ids.length} criativos rejeitados.` : r.mensagem);
      aoMudar(false);
      aoConcluir?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ids.length > 1 ? `Rejeitar ${ids.length} criativos` : "Rejeitar criativo"}</DialogTitle>
          <DialogDescription>O motivo fica no histórico e ajuda a calibrar as próximas gerações.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos rápidos">
            {MOTIVOS_REJEICAO.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className={cn(
                  "rounded-full border px-3 py-1 text-caption transition-colors",
                  motivo === m ? "border-tech bg-tech/10 text-tech" : "border-border hover:bg-secondary",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva o motivo (mín. 2 caracteres)"
            maxLength={300}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                confirmar();
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!valido || pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <XCircle />}
              Rejeitar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
