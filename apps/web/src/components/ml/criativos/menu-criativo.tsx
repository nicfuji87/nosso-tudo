"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Copy,
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { aprovarCriativos, arquivarCriativo, duplicarCriativo, voltarParaRevisao } from "@/app/ml/(painel)/criativos/actions";
import type { RespostaAcao } from "@/components/ml/acao-botao";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { baixarArquivo, editavel, nomeArquivo, podeRejeitar, type CriativoView } from "./rotulos";

/** Executa uma action com toast + refresh (para itens de menu, que não são botões). */
export function useExecutar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  function executar(fn: () => Promise<RespostaAcao>, aoConcluir?: (r: RespostaAcao) => void) {
    iniciar(async () => {
      const r = await fn();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      if (r?.mensagem) toast.success(r.mensagem);
      aoConcluir?.(r);
      router.refresh();
    });
  }
  return { pendente, executar };
}

export interface HandlersCriativo {
  aoEditar: (id: string) => void;
  aoRejeitar: (ids: string[]) => void;
  aoCriarPin: (id: string) => void;
  aoFiltrarProduto?: (productId: string) => void;
}

export function MenuCriativo({ c, podeOperar, handlers }: { c: CriativoView; podeOperar: boolean; handlers: HandlersCriativo }) {
  const { pendente, executar } = useExecutar();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações do criativo" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => handlers.aoEditar(c.id)}>
          <Pencil /> {editavel(c.status) && podeOperar ? "Editar" : "Ver detalhes"}
        </DropdownMenuItem>
        {podeOperar && c.status === "review" && (
          <DropdownMenuItem onSelect={() => executar(() => aprovarCriativos([c.id]))}>
            <CheckCircle2 /> Aprovar
          </DropdownMenuItem>
        )}
        {podeOperar && c.status === "approved" && (
          <DropdownMenuItem onSelect={() => handlers.aoCriarPin(c.id)}>
            <Send /> Criar Pin
          </DropdownMenuItem>
        )}
        {podeOperar && podeRejeitar(c.status) && (
          <DropdownMenuItem onSelect={() => handlers.aoRejeitar([c.id])}>
            <XCircle /> Rejeitar
          </DropdownMenuItem>
        )}
        {podeOperar && (c.status === "rejected" || c.status === "archived") && (
          <DropdownMenuItem onSelect={() => executar(() => voltarParaRevisao(c.id))}>
            <RotateCcw /> {c.status === "archived" ? "Restaurar para revisão" : "Voltar para revisão"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {podeOperar && (
          <DropdownMenuItem onSelect={() => executar(() => duplicarCriativo(c.id))}>
            <Copy /> Duplicar (variante)
          </DropdownMenuItem>
        )}
        {c.asset && (
          <DropdownMenuItem
            onSelect={() => {
              const a = c.asset!;
              void baixarArquivo(a.public_url, nomeArquivo(c.headline ?? c.produto?.title ?? "criativo", a.public_url));
            }}
          >
            <Download /> Baixar imagem
          </DropdownMenuItem>
        )}
        {handlers.aoFiltrarProduto && (
          <DropdownMenuItem onSelect={() => handlers.aoFiltrarProduto?.(c.product_id)}>
            <Filter /> Só deste produto
          </DropdownMenuItem>
        )}
        {podeOperar && c.status !== "archived" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                if (window.confirm("Arquivar este criativo? Ele sai do Kanban, mas pode ser restaurado.")) executar(() => arquivarCriativo(c.id));
              }}
            >
              <Archive /> Arquivar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
