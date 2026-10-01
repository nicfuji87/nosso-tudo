"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RespostaAcao } from "@/components/ml/acao-botao";

/** Executa uma Server Action de formulário com toast + refresh. Devolve `true` em sucesso. */
export function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const executar = (acao: () => Promise<RespostaAcao>, aoConcluir?: (r: RespostaAcao) => void) =>
    new Promise<boolean>((resolve) => {
      iniciar(async () => {
        try {
          const r = await acao();
          if (r?.error) {
            toast.error(r.error);
            resolve(false);
            return;
          }
          if (r?.mensagem) toast.success(r.mensagem);
          aoConcluir?.(r);
          router.refresh();
          resolve(true);
        } catch {
          toast.error("Não foi possível concluir. Verifique sua conexão e tente de novo.");
          resolve(false);
        }
      });
    });
  return { pendente, executar };
}

/** Valor para copiar (ex.: Redirect URI) com botão "Copiar". */
export function CopiarTexto({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code
        className="min-w-0 flex-1 select-all break-all rounded-xl border border-border bg-secondary/60 px-3 py-2 font-mono text-caption"
        aria-label={rotulo}
      >
        {valor}
      </code>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor);
            setCopiado(true);
            toast.success("Copiado.");
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            toast.error("Não consegui copiar — selecione o texto e copie manualmente.");
          }
        }}
      >
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

/** Campo de segredo: nunca pré-preenchido; mostra a máscara do que já está salvo. */
export function CampoSegredo({ mascara, className, ...props }: Omit<InputProps, "type"> & { mascara?: string | null }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <Input
          {...props}
          type={visivel ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={mascara ? `Salvo: ${mascara}` : props.placeholder}
          className="pr-11 font-mono"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label={visivel ? "Ocultar" : "Mostrar"}
          disabled={props.disabled}
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {mascara && <p className="text-caption text-muted-foreground">Já existe um valor salvo ({mascara}). Deixe em branco para manter.</p>}
    </div>
  );
}

/** Seção recolhível simples (acessível). */
export function Recolhivel({
  titulo,
  inicialAberto,
  children,
  className,
}: {
  titulo: React.ReactNode;
  inicialAberto?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = useState(Boolean(inicialAberto));
  return (
    <div className={cn("rounded-xl border border-border/70", className)}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-body-sm font-medium hover:bg-secondary/50"
      >
        <span>{titulo}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto && <div className="border-t border-border/70 px-4 py-4">{children}</div>}
    </div>
  );
}

/** Aviso para quem não pode editar. */
export function SoLeitura({ texto = "Somente administradores do ML podem alterar esta integração." }: { texto?: string }) {
  return <p className="rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">{texto}</p>;
}
