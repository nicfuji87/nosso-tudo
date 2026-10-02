"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Columns2,
  Copy,
  Download,
  Filter,
  Images,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  Type,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { aprovarCriativos, arquivarCriativo, duplicarCriativo, voltarParaRevisao } from "@/app/ml/(painel)/criativos/actions";
import { checarFidelidadeAgora, excluirRascunho, regerarCena, regerarPacote } from "@/app/ml/(painel)/criativos/actions-v2";
import type { RespostaAcao } from "@/components/ml/acao-botao";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DialogoV2 } from "./dialogos-v2";
import { baixarArquivo, editavel, nomeArquivo, podeExcluirRascunho, podeRejeitar, type CriativoView } from "./rotulos";

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
  /** V2: abre um diálogo da variante (lado a lado, revisar fidelidade, problema, trocar referência). */
  aoDialogoV2?: (id: string, d: DialogoV2) => void;
  /** Acompanha o job devolvido por uma action (JobStatus). */
  aoJob?: (jobId: string, rotulo: string) => void;
  /** Aprovação que mostra a falha de cada item (V2: fidelidade/pacote). */
  aoAprovar?: (ids: string[]) => void;
  /** OpenAI conectada — habilita "Checar fidelidade com IA". */
  openai?: boolean;
}

export function MenuCriativo({ c, podeOperar, handlers }: { c: CriativoView; podeOperar: boolean; handlers: HandlersCriativo }) {
  const { pendente, executar } = useExecutar();
  const v2 = Boolean(c.family_id);
  const pode = podeOperar && editavel(c.status);
  const manual = c.image_mode === "manual_chatgpt" || c.image_mode === "upload";
  const comJob = (rotulo: string) => (r: RespostaAcao) => {
    if (typeof r.jobId === "string") handlers.aoJob?.(r.jobId, rotulo);
  };
  const aprovar = () => (handlers.aoAprovar ? handlers.aoAprovar([c.id]) : executar(() => aprovarCriativos([c.id])));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações do criativo" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[75vh] overflow-y-auto">
        <DropdownMenuItem onSelect={() => handlers.aoEditar(c.id)}>
          <Pencil /> {editavel(c.status) && podeOperar ? "Editar" : "Ver detalhes"}
        </DropdownMenuItem>
        {podeOperar && c.status === "review" && (
          <DropdownMenuItem onSelect={aprovar}>
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
        {v2 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-overline uppercase text-muted-foreground">Fidelidade</DropdownMenuLabel>
            {handlers.aoDialogoV2 && (
              <DropdownMenuItem onSelect={() => handlers.aoDialogoV2?.(c.id, "lado")}>
                <Columns2 /> Ver referência lado a lado
              </DropdownMenuItem>
            )}
            {pode && handlers.aoDialogoV2 && c.asset && (
              <DropdownMenuItem onSelect={() => handlers.aoDialogoV2?.(c.id, "fidelidade")}>
                <BadgeCheck /> Revisar fidelidade
              </DropdownMenuItem>
            )}
            {pode && handlers.aoDialogoV2 && c.asset && (
              <DropdownMenuItem onSelect={() => handlers.aoDialogoV2?.(c.id, "problema")}>
                <ShieldAlert /> Marcar problema de fidelidade
              </DropdownMenuItem>
            )}
            {pode && handlers.openai && c.asset && (
              <DropdownMenuItem onSelect={() => executar(() => checarFidelidadeAgora(c.id), comJob("Fidelidade (IA)"))}>
                <Bot /> Checar fidelidade com IA
              </DropdownMenuItem>
            )}
            {pode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-overline uppercase text-muted-foreground">Variante</DropdownMenuLabel>
                {!manual && (
                  <DropdownMenuItem onSelect={() => executar(() => regerarCena(c.id))}>
                    <RefreshCw /> Regerar cena
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => executar(() => regerarPacote(c.id), comJob("Pacote Pinterest"))}>
                  <Type /> Regerar copy
                </DropdownMenuItem>
                {handlers.aoDialogoV2 && (
                  <DropdownMenuItem onSelect={() => handlers.aoDialogoV2?.(c.id, "referencia")}>
                    <Images /> Trocar referência
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => handlers.aoEditar(c.id)}>
                  <Package /> Editar pacote Pinterest
                </DropdownMenuItem>
              </>
            )}
          </>
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
        {podeOperar && v2 && podeExcluirRascunho(c) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                if (window.confirm("Excluir este rascunho? A variante e suas imagens são apagadas e não podem ser recuperadas.")) executar(() => excluirRascunho(c.id));
              }}
            >
              <Trash2 /> Excluir rascunho
            </DropdownMenuItem>
          </>
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
