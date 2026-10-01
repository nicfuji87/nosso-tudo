"use client";

import { PauseCircle, PlayCircle } from "lucide-react";
import { alternarPausaGlobal } from "@/app/ml/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import type { ButtonProps } from "@/components/ui/button";

/** "Pausar automações" / "Retomar automações" (admin+). O servidor valida o papel de novo. */
export function PausaGlobalBotao({
  pausado,
  size = "sm",
  variant,
}: {
  pausado: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  if (pausado) {
    return (
      <AcaoBotao
        size={size}
        variant={variant ?? "tech"}
        acao={() => alternarPausaGlobal(false)}
        confirmar="Retomar as automações? Os agendamentos ativos voltam a rodar nos próximos horários."
      >
        <PlayCircle /> Retomar automações
      </AcaoBotao>
    );
  }
  return (
    <AcaoBotao
      size={size}
      variant={variant ?? "secondary"}
      acao={() => alternarPausaGlobal(true)}
      confirmar="Pausar todas as automações? Nada roda sozinho até você retomar (a configuração é mantida)."
    >
      <PauseCircle /> Pausar automações
    </AcaoBotao>
  );
}
