"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { alternarAgendamento } from "@/app/ml/(painel)/automacoes/actions";
import { Switch } from "@/components/ui/switch";

/** Liga/desliga uma automação (admin+). Otimista, com rollback se falhar. */
export function AlternarAgendamento({
  id,
  nome,
  enabled,
  podeEditar,
}: {
  id: string;
  nome: string;
  enabled: boolean;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(enabled);
  const [pendente, iniciar] = useTransition();

  useEffect(() => setValor(enabled), [enabled]);

  return (
    <label className="flex items-center gap-2 text-caption text-muted-foreground">
      <Switch
        checked={valor}
        disabled={!podeEditar || pendente}
        aria-label={`${valor ? "Desativar" : "Ativar"} ${nome}`}
        onCheckedChange={(novo) => {
          setValor(novo);
          iniciar(async () => {
            const r = await alternarAgendamento(id, novo);
            if (!r.ok) {
              setValor(!novo);
              toast.error(r.error);
              return;
            }
            toast.success(`${nome}: ${r.mensagem}`);
            router.refresh();
          });
        }}
      />
      <span className="w-14">{valor ? "Ativa" : "Desativada"}</span>
    </label>
  );
}
