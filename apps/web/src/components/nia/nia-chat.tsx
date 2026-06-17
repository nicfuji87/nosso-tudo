"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import {
  confirmarCartao,
  confirmarCategoria,
  confirmarCompromisso,
  confirmarConta,
  confirmarFato,
  confirmarMeta,
  confirmarOrcamento,
  confirmarPessoa,
  confirmarRecorrencia,
  confirmarTransacao,
  confirmarTransacaoDetalhada,
  desfazerTransacao,
  rejeitarAcao,
  votarMensagem,
} from "@/app/app/nia/actions";
import {
  LABEL_COMPORTAMENTO,
  LABEL_MEIO_PAGAMENTO,
  LABEL_TIPO_ENTIDADE,
  LABEL_TIPO_TRANSACAO,
} from "@/lib/types/db";
import type {
  NiaWidget,
  WidgetChecklistItens,
  WidgetConfirmarTransacao,
  WidgetDocumento,
  WidgetResumoPeriodo,
} from "@/lib/nia/schemas";

interface Msg {
  id: string;
  autor: "user" | "nia";
  texto: string;
  widgets: NiaWidget[];
  mensagemId?: string | null;
  anexos?: { tipo: string; nome: string }[];
}

type TipoAnexo = "imagem" | "pdf" | "audio";

interface PendingAnexo {
  id: string;
  tipo: TipoAnexo;
  nome: string;
  storagePath: string;
  mimeType: string;
  tamanho: number;
  pronto: boolean;
}

const ICONE_ANEXO = { imagem: ImageIcon, pdf: FileText, audio: Mic } as const;

function tipoDeMime(mime: string): TipoAnexo | null {
  if (mime.startsWith("image/")) return "imagem";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());
}

const MAX_DIM_IMG = 1600;
const QUALIDADE_JPEG = 0.72;

/**
 * Reduz a imagem antes do upload: redimensiona para no máx. 1600px no maior lado
 * e recodifica em JPEG (~0.72). Evita guardar arquivos grandes no Storage e reduz
 * o payload enviado ao modelo. Degrada para o arquivo original em qualquer erro.
 */
async function comprimirImagem(
  file: File,
): Promise<{ blob: Blob; nome: string; mime: string }> {
  const original = { blob: file as Blob, nome: file.name, mime: file.type };
  if (!file.type.startsWith("image/")) return original;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIM_IMG / Math.max(bitmap.width, bitmap.height));
    // Já pequena e leve: não mexe.
    if (escala === 1 && file.size <= 600 * 1024) {
      bitmap.close?.();
      return original;
    }
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return original;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", QUALIDADE_JPEG),
    );
    if (!blob || blob.size >= file.size) return original;
    return { blob, nome: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg" };
  } catch {
    return original;
  }
}

export function NiaChat({
  nome,
  workspaceId,
  alertas = [],
  conversaIdInicial,
  mensagensIniciais = [],
  statusAcoes = {},
}: {
  nome: string;
  workspaceId: string;
  alertas?: string[];
  conversaIdInicial?: string;
  mensagensIniciais?: Msg[];
  statusAcoes?: Record<string, string>;
}) {
  const saudacao = `Oi, ${nome}! Sou a Nia. Me conta um gasto — tipo "paguei 80 no mercado" — ou pergunta "quanto gastei esse mês?".`;
  const bolhaAlertas: Msg | null =
    alertas.length > 0
      ? {
          id: "alertas",
          autor: "nia",
          texto: `⚠️ Tenho ${alertas.length} aviso${alertas.length > 1 ? "s" : ""} pra você:\n${alertas
            .map((a) => `• ${a}`)
            .join("\n")}`,
          widgets: [],
        }
      : null;

  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const inicial: Msg[] = [];
    if (bolhaAlertas) inicial.push(bolhaAlertas);
    if (mensagensIniciais.length > 0) inicial.push(...mensagensIniciais);
    else inicial.push({ id: "intro", autor: "nia", texto: saudacao, widgets: [] });
    return inicial;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [anexos, setAnexos] = useState<PendingAnexo[]>([]);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const conversaId = useRef<string | undefined>(conversaIdInicial);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // Status das ações do histórico só vale para os widgets carregados inicialmente.
  const statusAcoesIniciais = useRef(statusAcoes);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  function ajustarAltura() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function novaConversa() {
    if (loading) return;
    conversaId.current = undefined;
    setInput("");
    setAnexos([]);
    setMsgs(
      bolhaAlertas
        ? [bolhaAlertas, { id: "intro", autor: "nia", texto: saudacao, widgets: [] }]
        : [{ id: "intro", autor: "nia", texto: saudacao, widgets: [] }],
    );
    requestAnimationFrame(ajustarAltura);
  }

  async function subirAnexo(blob: Blob, nome: string, mimeType: string, tipo: TipoAnexo) {
    const id = novoId();
    const ext = nome.includes(".") ? `.${nome.split(".").pop()}` : tipo === "audio" ? ".webm" : "";
    const storagePath = `${workspaceId}/${id}${ext}`;
    setAnexos((a) => [
      ...a,
      { id, tipo, nome, storagePath, mimeType, tamanho: blob.size, pronto: false },
    ]);
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("nia-anexos")
      .upload(storagePath, blob, { upsert: false, contentType: mimeType });
    if (error) {
      toast.error("Falha ao enviar anexo", { description: nome });
      setAnexos((a) => a.filter((x) => x.id !== id));
    } else {
      setAnexos((a) => a.map((x) => (x.id === id ? { ...x, pronto: true } : x)));
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const tipo = tipoDeMime(file.type);
      if (!tipo) {
        toast.error("Tipo não suportado", { description: file.name });
        continue;
      }
      if (tipo === "imagem") {
        const c = await comprimirImagem(file);
        await subirAnexo(c.blob, c.nome, c.mime, "imagem");
      } else {
        await subirAnexo(file, file.name, file.type, tipo);
      }
    }
  }

  function removerAnexo(id: string) {
    setAnexos((a) => a.filter((x) => x.id !== id));
  }

  async function toggleGravacao() {
    if (gravando) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) await transcreverParaCampo(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      toast.error("Não consegui acessar o microfone");
    }
  }

  /** Transcreve a gravação e joga o texto no campo, para o usuário revisar/editar. */
  async function transcreverParaCampo(blob: Blob) {
    setTranscrevendo(true);
    try {
      const form = new FormData();
      form.append("file", blob, `audio-${Date.now()}.webm`);
      const res = await fetch("/api/nia/transcrever", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { texto?: string; error?: string };
      if (!res.ok || !data.texto) {
        toast.error(data.error ?? "Não consegui transcrever o áudio.");
        return;
      }
      setInput((prev) => (prev ? `${prev.trimEnd()} ${data.texto}` : data.texto!));
      requestAnimationFrame(() => {
        ajustarAltura();
        inputRef.current?.focus();
      });
    } catch {
      toast.error("Sem conexão para transcrever o áudio.");
    } finally {
      setTranscrevendo(false);
    }
  }

  async function enviar() {
    const texto = input.trim();
    const prontos = anexos.filter((a) => a.pronto);
    if (loading || anexos.some((a) => !a.pronto)) return;
    if (!texto && prontos.length === 0) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setAnexos([]);
    setMsgs((m) => [
      ...m,
      {
        id: novoId(),
        autor: "user",
        texto,
        widgets: [],
        anexos: prontos.map((a) => ({ tipo: a.tipo, nome: a.nome })),
      },
    ]);
    setLoading(true);

    const niaId = novoId();
    setMsgs((m) => [...m, { id: niaId, autor: "nia", texto: "", widgets: [], mensagemId: null }]);
    const patch = (fn: (msg: Msg) => Msg) =>
      setMsgs((m) => m.map((x) => (x.id === niaId ? fn(x) : x)));

    try {
      const res = await fetch("/api/nia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mensagem: texto,
          conversaId: conversaId.current,
          anexos: prontos.map((a) => ({
            tipo: a.tipo,
            storagePath: a.storagePath,
            mimeType: a.mimeType,
            nomeOriginal: a.nome,
            tamanho: a.tamanho,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        patch((x) => ({ ...x, texto: data.error ?? "Tive um problema." }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finalizado = false; // recebeu 'done' ou 'error'?

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: {
            type: string;
            delta?: string;
            widget?: NiaWidget;
            conversaId?: string;
            mensagemId?: string | null;
            error?: string;
          };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "text" && ev.delta) {
            acc += ev.delta;
            patch((x) => ({ ...x, texto: acc }));
          } else if (ev.type === "widget" && ev.widget) {
            const w = ev.widget;
            patch((x) => ({ ...x, widgets: [...x.widgets, w] }));
          } else if (ev.type === "done") {
            finalizado = true;
            conversaId.current = ev.conversaId ?? conversaId.current;
            patch((x) => ({ ...x, mensagemId: ev.mensagemId ?? null, texto: x.texto || "Pronto." }));
          } else if (ev.type === "error") {
            finalizado = true;
            patch((x) => ({ ...x, texto: acc || ev.error || "Tive um problema." }));
          }
        }
      }

      // Stream fechou sem 'done'/'error' (ex.: timeout da função no meio): não
      // deixa a mensagem pendurada — avisa e deixa o usuário tentar de novo.
      if (!finalizado) {
        const aviso = "⚠️ A resposta foi interrompida antes de terminar. Pode mandar de novo?";
        patch((x) => ({ ...x, texto: acc ? `${acc}\n\n${aviso}` : aviso }));
      }
    } catch {
      patch((x) => ({ ...x, texto: "Sem conexão agora. Tente de novo." }));
    } finally {
      setLoading(false);
    }
  }

  const ultima = msgs[msgs.length - 1];
  const aguardando = loading && ultima?.autor === "nia" && !ultima.texto && ultima.widgets.length === 0;

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="size-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-h4 font-semibold leading-tight">Nia</h1>
          <p className="text-caption text-muted-foreground">sua assistente do Nosso Tudo</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={novaConversa}
          disabled={loading}
          aria-label="Nova conversa"
          title="Nova conversa"
        >
          <SquarePen className="size-5" />
        </Button>
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
              {m.anexos && m.anexos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.anexos.map((a, i) => {
                    const Icone = ICONE_ANEXO[a.tipo as TipoAnexo] ?? FileText;
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-md bg-black/10 px-1.5 py-0.5 text-caption"
                      >
                        <Icone className="size-3" /> {a.nome}
                      </span>
                    );
                  })}
                </div>
              )}
              {m.widgets.map((w, i) => (
                <WidgetView key={i} widget={w} statusAcoes={statusAcoesIniciais.current} />
              ))}
              {m.autor === "nia" && m.mensagemId && <Feedback mensagemId={m.mensagemId} />}
            </div>
          </div>
        ))}
        {aguardando && (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Nia está pensando…
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-2 shadow-card">
        {anexos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {anexos.map((a) => {
              const Icone = ICONE_ANEXO[a.tipo];
              return (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-caption"
                >
                  {a.pronto ? (
                    <Icone className="size-3.5" />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  <span className="max-w-32 truncate">{a.nome}</span>
                  <button type="button" onClick={() => removerAnexo(a.id)} aria-label="Remover anexo">
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,audio/*"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            ajustarAltura();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={2}
          placeholder="Fale com a Nia…"
          className="max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-body outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => cameraRef.current?.click()}
              disabled={loading}
              aria-label="Tirar foto (nota fiscal, recibo)"
            >
              <Camera className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              aria-label="Anexar imagem, PDF ou áudio"
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleGravacao}
              disabled={loading || transcrevendo}
              aria-label={
                transcrevendo ? "Transcrevendo áudio" : gravando ? "Parar gravação" : "Gravar áudio"
              }
              className={cn(gravando && "animate-pulse text-destructive")}
            >
              {transcrevendo ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
            </Button>
          </div>
          <Button
            size="icon"
            onClick={enviar}
            disabled={loading || anexos.some((a) => !a.pronto) || (!input.trim() && anexos.length === 0)}
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </Button>
        </div>
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

/** Deriva o estado inicial de um card de ação a partir do status persistido em nia_acoes. */
function estadoFromStatus(status: string | undefined): EstadoAcao {
  switch (status) {
    case "executada":
    case "confirmada":
      return "feito";
    case "rejeitada":
      return "descartado";
    case "desfeita":
      return "desfeito";
    default:
      return "idle";
  }
}

function WidgetView({
  widget,
  statusAcoes = {},
}: {
  widget: NiaWidget;
  statusAcoes?: Record<string, string>;
}) {
  const acaoId = "acaoId" in widget ? widget.acaoId : undefined;
  const estadoInicial = estadoFromStatus(acaoId ? statusAcoes[acaoId] : undefined);
  const historico = estadoInicial !== "idle";

  switch (widget.tipo) {
    case "resumo_periodo":
      return <ResumoPeriodoCard w={widget} />;
    case "confirmar_transacao":
      return <ConfirmarTransacaoCard w={widget} estadoInicial={estadoInicial} historico={historico} />;
    case "checklist_itens":
      return <ChecklistItensCard w={widget} estadoInicial={estadoInicial} />;
    case "documento":
      return <DocumentoCard w={widget} />;
    case "criar_pessoa":
      return (
        <AcaoCard
          titulo={widget.nome}
          subtitulo={`Nova ${LABEL_TIPO_ENTIDADE[widget.tipoEntidade].toLowerCase()}`}
          confirmar={() => confirmarPessoa(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Cadastrado"
          estadoInicial={estadoInicial}
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
          estadoInicial={estadoInicial}
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
          estadoInicial={estadoInicial}
        />
      );
    case "criar_meta":
      return (
        <AcaoCard
          titulo={widget.nome}
          subtitulo={`Meta${widget.dataAlvo ? ` · até ${widget.dataAlvo}` : ""}`}
          valor={widget.valorAlvo}
          confirmar={() => confirmarMeta(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Meta criada"
          estadoInicial={estadoInicial}
        />
      );
    case "criar_orcamento":
      return (
        <AcaoCard
          titulo={`Orçamento · ${widget.categoria}`}
          subtitulo="Limite mensal"
          valor={widget.valorPlanejado}
          confirmar={() => confirmarOrcamento(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Orçamento definido"
          estadoInicial={estadoInicial}
        />
      );
    case "criar_categoria":
      return (
        <AcaoCard
          titulo={widget.nome}
          subtitulo={`Categoria ${LABEL_COMPORTAMENTO[widget.comportamento].toLowerCase()}`}
          confirmar={() => confirmarCategoria(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Categoria criada"
          estadoInicial={estadoInicial}
        />
      );
    case "criar_recorrencia":
      return (
        <AcaoCard
          titulo={widget.descricao}
          subtitulo={`Conta fixa · ${widget.frequenciaLabel}${
            widget.categoria ? ` · ${widget.categoria}` : ""
          }`}
          valor={widget.valor}
          confirmar={() => confirmarRecorrencia(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Conta fixa criada"
          estadoInicial={estadoInicial}
        />
      );
    case "criar_conta":
      return (
        <AcaoCard
          titulo={widget.apelido}
          subtitulo={`Conta · ${widget.banco} · titular ${widget.titular}`}
          confirmar={() => confirmarConta(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Conta criada"
          estadoInicial={estadoInicial}
        />
      );
    case "criar_cartao":
      return (
        <AcaoCard
          titulo={widget.apelido}
          subtitulo={`Cartão · ${widget.banco}${
            widget.ultimosDigitos ? ` · final ${widget.ultimosDigitos}` : ""
          } · titular ${widget.titular}`}
          confirmar={() => confirmarCartao(widget.acaoId)}
          descartar={() => rejeitarAcao(widget.acaoId)}
          labelFeito="Cartão criado"
          estadoInicial={estadoInicial}
        />
      );
    default:
      return null;
  }
}

function ConfirmarTransacaoCard({
  w,
  estadoInicial = "idle",
  historico = false,
}: {
  w: WidgetConfirmarTransacao;
  estadoInicial?: EstadoAcao;
  historico?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoAcao>(estadoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [decisao, setDecisao] = useState<"mesmo" | "outro">("mesmo");

  const detalhes = [LABEL_TIPO_TRANSACAO[w.tipoTransacao], w.categoria, w.estabelecimento]
    .filter(Boolean)
    .join(" · ");
  const pagamento = [w.meioPagamento ? LABEL_MEIO_PAGAMENTO[w.meioPagamento] : null, w.pagamento]
    .filter(Boolean)
    .join(" · ");
  const linha2 = [pagamento, w.beneficiario ? `para ${w.beneficiario}` : null, w.data ? formatDate(w.data) : null]
    .filter(Boolean)
    .join(" · ");

  async function confirmar() {
    setEstado("salvando");
    const r = await confirmarTransacao(w.acaoId, w.match ? decisao : undefined);
    if (r.error) {
      setErro(r.error);
      setEstado("erro");
    } else {
      setEstado("feito");
    }
  }
  async function descartar() {
    await rejeitarAcao(w.acaoId);
    setEstado("descartado");
  }
  async function undo() {
    setEstado("desfazendo");
    const r = await desfazerTransacao(w.acaoId);
    if (r.error) {
      setErro(r.error);
      setEstado("erro");
    } else {
      setEstado("desfeito");
    }
  }

  const editavel = estado === "idle" || estado === "salvando";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{w.descricao}</p>
          {detalhes && <p className="text-caption text-muted-foreground">{detalhes}</p>}
          {linha2 && <p className="text-caption text-muted-foreground">{linha2}</p>}
        </div>
        <p className="shrink-0 font-mono text-body font-semibold tabular-nums">{formatBRL(w.valor)}</p>
      </div>

      {w.match && editavel && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-caption text-muted-foreground">
            Escrito <span className="text-foreground">“{w.estabelecimento}”</span> — é o mesmo{" "}
            <span className="text-foreground">{w.match.sugestao}</span> que você já usa?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setDecisao("mesmo")}
              className={cn(
                "rounded-full border px-3 py-1 text-caption transition-colors",
                decisao === "mesmo"
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              É o mesmo
            </button>
            <button
              type="button"
              onClick={() => setDecisao("outro")}
              className={cn(
                "rounded-full border px-3 py-1 text-caption transition-colors",
                decisao === "outro"
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              É outro
            </button>
          </div>
        </div>
      )}

      {estado === "feito" && (
        <div className="mt-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-body-sm text-accent">
            <Check className="size-4" /> Lançado
          </p>
          {!historico && (
            <button
              type="button"
              onClick={undo}
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

      {editavel && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={confirmar} disabled={estado === "salvando"}>
            {estado === "salvando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={descartar} disabled={estado === "salvando"}>
            <X className="size-4" /> Descartar
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentoCard({ w }: { w: WidgetDocumento }) {
  if (w.ehImagem) {
    return (
      <a
        href={w.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[16rem] overflow-hidden rounded-2xl border border-border shadow-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={w.url} alt={w.nome} className="w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={w.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-body-sm shadow-card hover:bg-secondary"
    >
      <FileText className="size-4 text-accent" /> {w.nome}
    </a>
  );
}

function ChecklistItensCard({
  w,
  estadoInicial = "idle",
}: {
  w: WidgetChecklistItens;
  estadoInicial?: EstadoAcao;
}) {
  const inicial =
    estadoInicial === "feito" || estadoInicial === "desfeito"
      ? "feito"
      : estadoInicial === "descartado"
        ? "descartado"
        : "idle";
  const [incluidos, setIncluidos] = useState<boolean[]>(() => w.itens.map(() => true));
  const [estado, setEstado] = useState<"idle" | "salvando" | "feito" | "descartado" | "erro">(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pulados, setPulados] = useState(0);

  const total = w.itens.reduce((s, it, i) => s + (incluidos[i] && it.valorTotal ? it.valorTotal : 0), 0);
  const qtd = incluidos.filter(Boolean).length;
  const editavel = estado === "idle" || estado === "salvando" || estado === "erro";

  const todosMarcados = qtd === w.itens.length;
  const muitosItens = w.itens.length > 8;

  function toggle(i: number) {
    if (!editavel || estado === "salvando") return;
    setIncluidos((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }
  function toggleTodos() {
    if (!editavel || estado === "salvando") return;
    setIncluidos(() => w.itens.map(() => !todosMarcados));
  }
  async function confirmar() {
    const indices = incluidos.flatMap((v, i) => (v ? [i] : []));
    setEstado("salvando");
    const r = await confirmarTransacaoDetalhada(w.acaoId, indices);
    if (r.error) {
      setErro(r.error);
      setEstado("erro");
    } else {
      setPulados(r.pulados ?? 0);
      setEstado("feito");
    }
  }
  async function descartar() {
    await rejeitarAcao(w.acaoId);
    setEstado("descartado");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="border-b border-border px-4 py-3">
        <p className="font-medium">{w.descricao}</p>
        {w.estabelecimento && <p className="text-caption text-muted-foreground">{w.estabelecimento}</p>}
      </div>
      {editavel && w.itens.length > 1 && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="text-caption text-muted-foreground">
            {qtd} de {w.itens.length} selecionados
          </span>
          <button
            type="button"
            onClick={toggleTodos}
            disabled={estado === "salvando"}
            className="text-caption font-medium text-accent underline-offset-2 hover:underline"
          >
            {todosMarcados ? "Limpar" : "Selecionar todos"}
          </button>
        </div>
      )}
      <div className={cn("divide-y divide-border", muitosItens && "max-h-72 overflow-y-auto")}>
        {w.itens.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            disabled={!editavel || estado === "salvando"}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                incluidos[i] ? "border-accent bg-accent text-accent-foreground" : "border-border",
              )}
            >
              {incluidos[i] && <Check className="size-3.5" />}
            </span>
            <span className={cn("flex-1 text-body-sm", !incluidos[i] && "text-muted-foreground line-through")}>
              {it.nome}
              {it.quantidade ? ` · ${it.quantidade}` : ""}
            </span>
            {it.valorTotal != null && (
              <span
                className={cn(
                  "font-mono text-body-sm tabular-nums",
                  !incluidos[i] && "text-muted-foreground line-through",
                )}
              >
                {formatBRL(it.valorTotal)}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/40 px-4 py-3">
        {estado === "feito" ? (
          <p className="flex items-center gap-1.5 text-body-sm text-accent">
            <Check className="size-4" /> Lançado · {Math.max(0, qtd - pulados)} itens
            {pulados > 0 && (
              <span className="text-muted-foreground">
                {" "}
                ({pulados} já {pulados === 1 ? "estava lançado" : "estavam lançados"})
              </span>
            )}
          </p>
        ) : estado === "descartado" ? (
          <p className="text-body-sm text-muted-foreground">Descartado.</p>
        ) : (
          <>
            <div className="text-body-sm text-muted-foreground">
              {qtd} itens · <span className="font-mono tabular-nums text-foreground">{formatBRL(total)}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmar} disabled={estado === "salvando" || qtd === 0}>
                {estado === "salvando" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={descartar} disabled={estado === "salvando"} aria-label="Descartar">
                <X className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>
      {estado === "erro" && <p className="px-4 pb-3 text-body-sm text-destructive">{erro}</p>}
    </div>
  );
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
  estadoInicial = "idle",
}: {
  titulo: string;
  subtitulo?: string | null;
  valor?: number | null;
  confirmar: () => Promise<{ error?: string; ok?: boolean }>;
  descartar: () => Promise<{ ok: boolean }>;
  onUndo?: () => Promise<{ error?: string; ok?: boolean }>;
  labelFeito?: string;
  estadoInicial?: EstadoAcao;
}) {
  const [estado, setEstado] = useState<EstadoAcao>(estadoInicial);
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
