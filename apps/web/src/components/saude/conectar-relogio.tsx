"use client";

import { useState, useTransition } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { vincularRelogio } from "@/app/app/saude/actions";

/** Digitar o código de 6 letras que o relógio mostra em Laboratório › Conectar ao Nosso Tudo. */
export function ConectarRelogio({ compacto = false }: { compacto?: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [codigo, setCodigo] = useState("");

  function enviar(form: FormData) {
    iniciar(async () => {
      const r = await vincularRelogio({ codigo: form.get("codigo"), nome: form.get("nome") });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Relógio conectado. Os dados começam a chegar em alguns minutos.");
        setCodigo("");
      }
    });
  }

  return (
    <form
      action={enviar}
      className={cn(
        "rounded-xl border border-border/70 bg-card p-6 shadow-card",
        compacto ? "space-y-4" : "mx-auto max-w-lg space-y-5 text-center",
      )}
    >
      {!compacto && (
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Watch className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <h2 className="text-h4 font-semibold tracking-tight">Conectar relógio</h2>
        <p className="text-body-sm text-muted-foreground">
          No Galaxy Watch, abra <b>Saúde NT › Laboratório › Conectar ao Nosso Tudo</b> e toque em{" "}
          <b>Gerar código</b>. Digite aqui as 6 letras que aparecerem.
        </p>
      </div>
      <div className={cn("grid gap-3", compacto ? "sm:grid-cols-[1fr_1fr_auto] sm:items-end" : "text-left")}>
        <div className="space-y-1.5">
          <Label htmlFor="codigo">Código do relógio</Label>
          <Input
            id="codigo"
            name="codigo"
            required
            autoComplete="off"
            inputMode="text"
            maxLength={7}
            placeholder="ABC 234"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="tabular text-center text-h4 tracking-[0.3em]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome (opcional)</Label>
          <Input id="nome" name="nome" maxLength={40} placeholder="Relógio do Nicolas" />
        </div>
        <Button type="submit" disabled={pendente} className={compacto ? "" : "w-full"}>
          {pendente ? "Conectando…" : "Conectar"}
        </Button>
      </div>
    </form>
  );
}
