"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  aceitarMudancaPreco,
  agendarPin,
  aprovarPins,
  cancelarPins,
  duplicarPublicacao,
  editarPin,
  pausarPin,
  publicarAgora,
  retomarPin,
  revalidarPin,
} from "@/app/ml/(painel)/publicacoes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import { LIMITES_PIN } from "@/lib/ml/conteudo/guardrails";
import { cn } from "@/lib/utils";
import { deInputLocal, paraInputLocal, pode, precoBloqueando, type BoardOpcao, type ItemValidacao, type PinView } from "./tipos";
import { ValidacaoLista } from "./validacao";

type Resposta = { ok?: boolean; error?: string; mensagem?: string } & Record<string, unknown>;

/** Executa uma action com toast + refresh e trava contra clique duplo. */
export function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const executar = (fn: () => Promise<Resposta>, opts: { confirmar?: string; aoConcluir?: (r: Resposta) => void } = {}) => {
    if (opts.confirmar && !window.confirm(opts.confirmar)) return;
    iniciar(async () => {
      const r = await fn();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      if (r?.mensagem) toast.success(r.mensagem);
      opts.aoConcluir?.(r);
      router.refresh();
    });
  };
  return { pendente, executar };
}

// ---------------------------------------------------------------------------
// Campo "quando": próxima janela livre ou data/hora no fuso configurado
// ---------------------------------------------------------------------------
function CampoQuando({
  modo,
  setModo,
  valor,
  setValor,
  tz,
}: {
  modo: "auto" | "data";
  setModo: (m: "auto" | "data") => void;
  valor: string;
  setValor: (v: string) => void;
  tz: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-body-sm font-medium">Quando</legend>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3 has-[:checked]:border-tech has-[:checked]:bg-tech/5">
        <input type="radio" name="quando" className="mt-1 accent-[rgb(var(--tech))]" checked={modo === "auto"} onChange={() => setModo("auto")} />
        <span>
          <span className="block text-body-sm font-medium">Próxima janela livre</span>
          <span className="block text-caption text-muted-foreground">Respeita janelas, limite diário e intervalo mínimo configurados.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3 has-[:checked]:border-tech has-[:checked]:bg-tech/5">
        <input type="radio" name="quando" className="mt-1 accent-[rgb(var(--tech))]" checked={modo === "data"} onChange={() => setModo("data")} />
        <span className="flex-1 space-y-2">
          <span className="block text-body-sm font-medium">Data e hora específicas</span>
          <Input
            type="datetime-local"
            value={valor}
            min={paraInputLocal(new Date(), tz)}
            onChange={(e) => {
              setValor(e.target.value);
              setModo("data");
            }}
            aria-label="Data e hora da publicação"
          />
          <span className="block text-caption text-muted-foreground">Horário no fuso {tz}.</span>
        </span>
      </label>
    </fieldset>
  );
}

function resolverQuando(modo: "auto" | "data", valor: string, tz: string): string | null {
  if (modo === "auto") return "auto";
  const iso = deInputLocal(valor, tz);
  if (!iso) {
    toast.error("Informe data e hora.");
    return null;
  }
  if (new Date(iso).getTime() < Date.now()) {
    toast.error("Escolha um horário no futuro.");
    return null;
  }
  return iso;
}

function AgendarDialog({ pin, tz, open, onOpenChange }: { pin: PinView; tz: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const futuro = pin.scheduled_at && new Date(pin.scheduled_at).getTime() > Date.now() ? pin.scheduled_at : null;
  const [modo, setModo] = useState<"auto" | "data">(futuro ? "data" : "auto");
  const [valor, setValor] = useState(futuro ? paraInputLocal(futuro, tz) : "");
  const { pendente, executar } = useAcao();
  const reagendar = pin.status === "scheduled";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reagendar ? "Reagendar publicação" : pin.status === "canceled" ? "Reabrir e agendar" : "Agendar publicação"}</DialogTitle>
          <DialogDescription>
            {reagendar ? "Atualiza o horário sem criar outro job de publicação." : "O Pin passa para Agendado e é revalidado antes de sair."}
          </DialogDescription>
        </DialogHeader>
        <CampoQuando modo={modo} setModo={setModo} valor={valor} setValor={setValor} tz={tz} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="tech"
            size="sm"
            disabled={pendente}
            onClick={() => {
              const q = resolverQuando(modo, valor, tz);
              if (q) executar(() => agendarPin(pin.id, q), { aoConcluir: () => onOpenChange(false) });
            }}
          >
            {pendente && <Loader2 className="animate-spin" />}
            {reagendar ? "Reagendar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Contador({ atual, max }: { atual: number; max: number }) {
  return (
    <span className={cn("tabular", atual > max ? "text-destructive" : atual > max * 0.9 ? "text-warning" : "text-muted-foreground")}>
      {atual}/{max}
    </span>
  );
}

function EditarDialog({
  pin,
  boards,
  open,
  onOpenChange,
}: {
  pin: PinView;
  boards: BoardOpcao[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [title, setTitle] = useState(pin.title ?? "");
  const [description, setDescription] = useState(pin.description ?? "");
  const [alt, setAlt] = useState(pin.alt_text ?? "");
  const [board, setBoard] = useState(pin.board?.id ?? "");
  const [link, setLink] = useState(pin.link_url ?? "");
  const { pendente, executar } = useAcao();
  const excede = title.length > LIMITES_PIN.titulo || description.length > LIMITES_PIN.descricao || alt.length > LIMITES_PIN.altText;
  const listaBoards = pin.board && !boards.some((b) => b.id === pin.board?.id) ? [pin.board, ...boards] : boards;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar Pin</DialogTitle>
          <DialogDescription>As mudanças valem só para esta publicação; o criativo original não muda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo label="Título" dica={<Contador atual={title.length} max={LIMITES_PIN.titulo} />}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITES_PIN.titulo + 20} />
          </Campo>
          <Campo label="Descrição" dica={<Contador atual={description.length} max={LIMITES_PIN.descricao} />}>
            <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Campo>
          <Campo label="Texto alternativo (alt text)" dica={<Contador atual={alt.length} max={LIMITES_PIN.altText} />}>
            <Textarea rows={2} value={alt} onChange={(e) => setAlt(e.target.value)} />
          </Campo>
          <Campo label="Board">
            <NativeSelect className="w-full" value={board} onChange={(e) => setBoard(e.target.value)}>
              <option value="">Selecione…</option>
              {listaBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Link de afiliado" dica="Validado no servidor (precisa ser um link de afiliado do Mercado Livre).">
            <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://mercadolivre.com/sec/…" />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="tech"
            size="sm"
            disabled={pendente || excede}
            onClick={() =>
              executar(
                () =>
                  editarPin(pin.id, {
                    title,
                    description,
                    alt_text: alt,
                    ...(board ? { board_id: board } : {}),
                    ...(link.trim() ? { link_url: link.trim() } : {}),
                  }),
                { aoConcluir: () => onOpenChange(false) },
              )
            }
          >
            {pendente && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicarDialog({
  pin,
  boards,
  tz,
  open,
  onOpenChange,
}: {
  pin: PinView;
  boards: BoardOpcao[];
  tz: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const outros = boards.filter((b) => b.id !== pin.board?.id);
  const [board, setBoard] = useState(outros[0]?.id ?? boards[0]?.id ?? "");
  const [modo, setModo] = useState<"auto" | "data">("auto");
  const [valor, setValor] = useState("");
  const { pendente, executar } = useAcao();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar publicação</DialogTitle>
          <DialogDescription>
            Cria uma nova publicação do mesmo criativo. As regras anti-repetição continuam valendo: limite de Pins do produto por semana
            e o mesmo produto no mesmo board dentro da janela de duplicação podem bloquear.
          </DialogDescription>
        </DialogHeader>
        <Campo label="Board de destino">
          <NativeSelect className="w-full" value={board} onChange={(e) => setBoard(e.target.value)}>
            {!boards.length && <option value="">Nenhum board ativo</option>}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === pin.board?.id ? " (atual)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <CampoQuando modo={modo} setModo={setModo} valor={valor} setValor={setValor} tz={tz} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="tech"
            size="sm"
            disabled={pendente || !board}
            onClick={() => {
              const q = resolverQuando(modo, valor, tz);
              if (q) executar(() => duplicarPublicacao(pin.id, board, q), { aoConcluir: () => onOpenChange(false) });
            }}
          >
            {pendente && <Loader2 className="animate-spin" />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevalidarDialog({ itens, open, onOpenChange }: { itens: ItemValidacao[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const problemas = itens.filter((i) => i.bloqueia).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resultado da validação</DialogTitle>
          <DialogDescription>
            {problemas ? `${problemas} item(ns) impedem a publicação.` : "Nenhum bloqueio — pronto para publicar."}
          </DialogDescription>
        </DialogHeader>
        <ValidacaoLista itens={itens} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Barra de ações de um Pin
// ---------------------------------------------------------------------------
type Dialogo = "agendar" | "editar" | "duplicar" | "revalidar" | null;

export function PinAcoes({ pin, boards, tz, podeOperar }: { pin: PinView; boards: BoardOpcao[]; tz: string; podeOperar: boolean }) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [itensRevalidados, setItensRevalidados] = useState<ItemValidacao[]>([]);
  const { pendente, executar } = useAcao();
  const s = pin.status;
  const falhou = s === "failed" || s === "blocked";

  const verNoPinterest = pin.external_url ? (
    <Button asChild variant="outline" size="sm">
      <a href={pin.external_url} target="_blank" rel="noopener noreferrer">
        <ExternalLink />
        Ver no Pinterest
      </a>
    </Button>
  ) : null;

  if (!podeOperar) return verNoPinterest;

  const fechar = (v: boolean) => !v && setDialogo(null);
  const revalidar = () =>
    executar(() => revalidarPin(pin.id), {
      aoConcluir: (r) => {
        setItensRevalidados(Array.isArray(r.itens) ? (r.itens as ItemValidacao[]) : []);
        setDialogo("revalidar");
      },
    });
  const publicar = () =>
    executar(() => publicarAgora(pin.id), {
      confirmar: falhou
        ? "Reprocessar agora? O Pin passa pela validação de novo antes de publicar."
        : "Publicar agora? A validação pré-publicação roda antes de enviar ao Pinterest.",
    });

  const primarios: ReactNode[] = [];
  if (pode.aprovar(s))
    primarios.push(
      <Button key="aprovar" variant="tech" size="sm" disabled={pendente} onClick={() => executar(() => aprovarPins([pin.id]))}>
        <CheckCircle2 />
        Aprovar
      </Button>,
    );
  if (falhou && precoBloqueando(pin))
    primarios.push(
      <Button
        key="preco"
        variant="tech"
        size="sm"
        disabled={pendente}
        onClick={() =>
          executar(() => aceitarMudancaPreco(pin.id), {
            confirmar: "Aceitar o preço atual como referência e reagendar na próxima janela livre?",
          })
        }
      >
        <TrendingUp />
        Aceitar novo preço
      </Button>,
    );
  if (pode.publicarAgora(s))
    primarios.push(
      <Button key="publicar" variant={falhou || s === "scheduled" ? "tech" : "outline"} size="sm" disabled={pendente} onClick={publicar}>
        {falhou ? <RefreshCw /> : <Send />}
        {falhou ? "Reprocessar" : "Publicar agora"}
      </Button>,
    );
  if (pode.retomar(s))
    primarios.push(
      <Button key="retomar" variant="outline" size="sm" disabled={pendente} onClick={() => executar(() => retomarPin(pin.id))}>
        <PlayCircle />
        Retomar
      </Button>,
    );
  if (pode.agendar(s))
    primarios.push(
      <Button key="agendar" variant="outline" size="sm" disabled={pendente} onClick={() => setDialogo("agendar")}>
        <CalendarClock />
        {s === "scheduled" ? "Reagendar" : s === "canceled" ? "Reabrir" : "Agendar"}
      </Button>,
    );
  if (verNoPinterest) primarios.push(<span key="ver">{verNoPinterest}</span>);

  const temMais = pode.editar(s) || pode.duplicar(s) || pode.revalidar(s) || pode.pausar(s) || pode.cancelar(s);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primarios}
      {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Processando" />}
      {temMais && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais ações" disabled={pendente}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pode.editar(s) && (
              <DropdownMenuItem onSelect={() => setDialogo("editar")}>
                <Pencil className="size-4" />
                Editar
              </DropdownMenuItem>
            )}
            {pode.revalidar(s) && (
              <DropdownMenuItem onSelect={revalidar}>
                <ShieldCheck className="size-4" />
                Revalidar agora
              </DropdownMenuItem>
            )}
            {pode.duplicar(s) && (
              <DropdownMenuItem onSelect={() => setDialogo("duplicar")}>
                <Copy className="size-4" />
                Duplicar publicação
              </DropdownMenuItem>
            )}
            {pode.pausar(s) && (
              <DropdownMenuItem onSelect={() => executar(() => pausarPin(pin.id))}>
                <PauseCircle className="size-4" />
                Pausar
              </DropdownMenuItem>
            )}
            {pode.cancelar(s) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    executar(() => cancelarPins([pin.id]), {
                      confirmar: "Cancelar esta publicação? O criativo não é apagado e pode ser publicado de novo.",
                    })
                  }
                >
                  <Ban className="size-4" />
                  Cancelar publicação
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {dialogo === "agendar" && <AgendarDialog pin={pin} tz={tz} open onOpenChange={fechar} />}
      {dialogo === "editar" && <EditarDialog pin={pin} boards={boards} open onOpenChange={fechar} />}
      {dialogo === "duplicar" && <DuplicarDialog pin={pin} boards={boards} tz={tz} open onOpenChange={fechar} />}
      {dialogo === "revalidar" && <RevalidarDialog itens={itensRevalidados} open onOpenChange={fechar} />}
    </div>
  );
}
