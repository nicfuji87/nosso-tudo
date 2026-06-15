"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  confirmarCompromisso,
  confirmarFato,
  confirmarPessoa,
  confirmarTransacao,
  desfazerTransacao,
  rejeitarAcao,
  votarMensagem,
} from "@/app/app/nia/actions";
import { LABEL_TIPO_ENTIDADE, LABEL_TIPO_TRANSACAO } from "@/lib/types/db";
import type { NiaResposta, NiaWidget, WidgetResumoPeriodo } from "@/lib/nia/schemas";

interface Msg {
  id: string;
  autor: "user" | "nia";
  texto: string;
  widgets: NiaWidget[];
  mensagemId?: string | null;
}

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());
}

export function NiaChat({ nome }: { nome: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "intro",
      autor: "nia",
      texto: `Oi, ${nome}! Sou a Nia. Me conta um gasto — tipo "paguei 80 no mercado" — ou pergunta "quanto gastei esse mês?".`,
      widgets: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const conversaId = useRef<string | undefined>(undefined);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || loading) return;
    setInput("");
    setMsgs((m) => [...m, { id: novoId(), autor: "user", texto, widgets: [] }]);
    setLoading(true);
    try {
      const res = await fetch("/api/nia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagem: texto, conversaId: conversaId.current }),
      });
      const data = (await res.json()) as Partial<NiaResposta> & { error?: string };
      if (!res.ok) {
        setMsgs((m) => [
          ...m,
          { id: novoId(), autor: "nia", texto: data.error ?? "Tive um problema.", widgets: [] },
        ]);
      } else {
        conversaId.current = data.conversaId;
        setMsgs((m) => [
          ...m,
          {
            id: novoId(),
            autor: "nia",
            texto: data.texto || "Pronto.",
            widgets: data.widgets ?? [],
            mensagemId: data.mensagemId ?? null,
          },
        ]);
      }
    } catch {
      setMsgs((m) => [
        ...m,
        { id: novoId(), autor: "nia", texto: "Sem conexão agora. Tente de novo.", widgets: [] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h1 className="text-h4 font-semibold leading-tight">Nia</h1>
          <p className="text-caption text-muted-foreground">sua assistente do Nosso Tudo</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.autor === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] space-y-3",
                m.autor === "user"
                  ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-body-sm text-primary-foreground"
                  : "text-body-sm text-foreground",
              )}
            >
              {m.texto && <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>}
              {m.widgets.map((w, i) => (
                <WidgetView key={i} widget={w} />
              ))}
              {m.autor === "nia" && m.mensagemId && <Feedback mensagemId={m.mensagemId} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Nia está pensando…
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder="Fale com a Nia…"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-body-sm outline-none placeholder:text-muted-foreground"
        />
        <Button size="icon" onClick={enviar} disabled={loading || !input.trim()} aria-label="Enviar">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Feedback({ mensagemId }: { mensagemId: string }) {
  const [voto, setVoto] = useState<"positivo" | "negativo" | null>(null);
  async function vote(v: "positivo" | "negativo") {
    setVoto(v);
    await votarMensagem(mensagemId, v);
  }
  return (
    <div className="flex items-center gap-1 pt-0.5">
      <button
        type="button"
        onClick={() => vote("positivo")}
        aria-label="Resposta útil"
        className={cn(
          "rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary",
          voto === "positivo" && "text-accent",
        )}
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => vote("negativo")}
        aria-label="Resposta ruim"
        className={cn(
          "rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary",
          voto === "negativo" && "text-destructive",
        )}
      >
        <ThumbsDown className="size-3.5" />
      </button>
    </div>
  );
}

function WidgetView({ widget }: { widget: NiaWidget }) {
  switch (widget.tipo) {
    case "resumo_periodo":
      return <ResumoPeriodoCard w={widget} />;
    case "confirmar_transacao": {
      const detalhes = [
        LABEL_TIPO_TRANSACAO[widget.tipoTransacao],
        widget.categoria,
        widget.estabelecimento,
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <AcaoCard
          titulo={widget.descricao}
          subtitulo={detalhes}
          valor={widget.valor}
          confirmar={() => confirmarTransacao(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          onUndo={() => desfazerTransacao(widget.acaoId)}
          labelFeito="Lançado"
        />
      );
    }
    case "criar_pessoa":
      return (
        <AcaoCard
          titulo={widget.nome}
          subtitulo={`Nova ${LABEL_TIPO_ENTIDADE[widget.tipoEntidade].toLowerCase()}`}
          confirmar={() => confirmarPessoa(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Cadastrado"
        />
      );
    case "criar_compromisso":
      return (
        <AcaoCard
          titulo={widget.nome}
          subtitulo={
            widget.dataEstimada ? `Compra coletiva · entrega ~ ${widget.dataEstimada}` : "Compra coletiva · aberto"
          }
          valor={widget.valorEstimado}
          confirmar={() => confirmarCompromisso(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Compromisso criado"
        />
      );
    case "lembrar_fato":
      return (
        <AcaoCard
          titulo="Guardar na memória da família?"
          subtitulo={widget.fato}
          confirmar={() => confirmarFato(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Guardado"
        />
      );
    default:
      return null;
  }
}

function ResumoPeriodoCard({ w }: { w: WidgetResumoPeriodo }) {
  const max = Math.max(1, ...w.categorias.map((c) => c.total));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-caption uppercase tracking-wide text-muted-foreground">{w.titulo}</p>
      <p className="mt-1 font-mono text-h3 font-semibold tabular-nums">{formatBRL(w.saldo)}</p>
      <div className="mt-1 flex gap-4 text-caption text-muted-foreground">
        <span>Receitas {formatBRL(w.receitas)}</span>
        <span>Despesas {formatBRL(w.despesas)}</span>
      </div>
      {w.categorias.length > 0 && (
        <div className="mt-3 space-y-2">
          {w.categorias.map((c) => (
            <div key={c.nome} className="space-y-1">
              <div className="flex justify-between text-caption">
                <span className="text-foreground">{c.nome}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{formatBRL(c.total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((c.total / max) * 100)}%`,
                    backgroundColor: c.cor ?? "var(--accent, #8FA993)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type EstadoAcao =
  | "idle"
  | "salvando"
  | "feito"
  | "descartado"
  | "desfazendo"
  | "desfeito"
  | "erro";

function AcaoCard({
  titulo,
  subtitulo,
  valor,
  confirmar,
  descartar,
  onUndo,
  labelFeito = "Feito",
}: {
  titulo: string;
  subtitulo?: string | null;
  valor?: number | null;
  confirmar: () => Promise<{ error?: string; ok?: boolean }>;
  descartar: () => Promise<{ ok: boolean }>;
  onUndo?: () => Promise<{ error?: string; ok?: boolean }>;
  labelFeito?: string;
}) {
  const [estado, setEstado] = useState<EstadoAcao>("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function doConfirmar() {
    setEstado("salvando");
    const r = await confirmar();
    if (r.error) {
      setErro(r.error);
      setEstado("erro");
    } else {
      setEstado("feito");
    }
  }
  async function doDescartar() {
    await descartar();
    setEstado("descartado");
  }
  async function doUndo() {
    if (!onUndo) return;
    setEstado("desfazendo");
    const r = await onUndo();
    if (r.error) {
      setErro(r.error);
      setEstado("erro");
    } else {
      setEstado("desfeito");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{titulo}</p>
          {subtitulo && <p className="text-caption text-muted-foreground">{subtitulo}</p>}
        </div>
        {typeof valor === "number" && (
          <p className="shrink-0 font-mono text-body font-semibold tabular-nums">{formatBRL(valor)}</p>
        )}
      </div>

      {estado === "feito" && (
        <div className="mt-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-body-sm text-accent">
            <Check className="size-4" /> {labelFeito}
          </p>
          {onUndo && (
            <button
              type="button"
              onClick={doUndo}
              className="text-caption text-muted-foreground underline-offset-2 hover:underline"
            >
              desfazer
            </button>
          )}
        </div>
      )}
      {estado === "desfazendo" && (
        <p className="mt-3 flex items-center gap-1.5 text-body-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> desfazendo…
        </p>
      )}
      {estado === "desfeito" && <p className="mt-3 text-body-sm text-muted-foreground">Desfeito.</p>}
      {estado === "descartado" && <p className="mt-3 text-body-sm text-muted-foreground">Descartado.</p>}
      {estado === "erro" && <p className="mt-3 text-body-sm text-destructive">{erro}</p>}

      {(estado === "idle" || estado === "salvando") && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={doConfirmar} disabled={estado === "salvando"}>
            {estado === "salvando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={doDescartar} disabled={estado === "salvando"}>
            <X className="size-4" /> Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
