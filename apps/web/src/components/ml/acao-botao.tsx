"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export type RespostaAcao = { ok?: boolean; error?: string; mensagem?: string; jobId?: string } & Record<string, unknown>;

/**
 * Botão que chama uma Server Action com feedback imediato: desabilita enquanto
 * roda (proteção contra clique duplo), toast de sucesso/erro e refresh da página.
 */
export function AcaoBotao({
  acao,
  sucesso,
  confirmar,
  children,
  aoConcluir,
  semRefresh,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  acao: () => Promise<RespostaAcao>;
  sucesso?: string | ((r: RespostaAcao) => string);
  confirmar?: string;
  aoConcluir?: (r: RespostaAcao) => void;
  semRefresh?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      {...props}
      disabled={pendente || props.disabled}
      aria-busy={pendente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => {
          const r = await acao();
          if (r?.error) {
            toast.error(r.error);
            return;
          }
          const msg = typeof sucesso === "function" ? sucesso(r) : (r?.mensagem as string | undefined) ?? sucesso;
          if (msg) toast.success(msg);
          aoConcluir?.(r);
          if (!semRefresh) router.refresh();
        });
      }}
    >
      {pendente && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
