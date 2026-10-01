"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { enviarImagem } from "@/app/ml/(painel)/criativos/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIPOS = ["image/png", "image/jpeg", "image/webp"];
// Server Actions do projeto aceitam até 10 MB de corpo (next.config) — margem para o multipart.
const MAX_BYTES = 9.5 * 1024 * 1024;

function tamanho(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function validarArquivo(f: File): string | null {
  if (!TIPOS.includes(f.type)) return "Formato não suportado. Use PNG, JPG ou WebP.";
  if (f.size > MAX_BYTES) return `Imagem com ${tamanho(f.size)} — o limite é 9,5 MB.`;
  return null;
}

/**
 * Envio da imagem final de um criativo (modo ChatGPT/upload ou substituição):
 * arrastar/soltar, colar (Ctrl+V) ou escolher; prévia antes de enviar.
 */
export function UploadImagem({
  creativeId,
  rotuloEnviar = "Enviar imagem",
  aoEnviar,
  desabilitado,
  compacto,
}: {
  creativeId: string;
  rotuloEnviar?: string;
  aoEnviar?: (r: { avisos: string[] }) => void;
  desabilitado?: boolean;
  compacto?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!arquivo) {
      setPrevia(null);
      setDims(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  // Reinicia ao trocar de criativo.
  useEffect(() => {
    setArquivo(null);
  }, [creativeId]);

  function escolher(f: File | null | undefined) {
    if (!f) return;
    const erro = validarArquivo(f);
    if (erro) toast.error(erro);
    else setArquivo(f);
  }

  // Colar imagem da área de transferência (Ctrl+V) em qualquer lugar da página.
  useEffect(() => {
    if (desabilitado) return;
    const aoColar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && TIPOS.includes(i.type));
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        const erro = validarArquivo(f);
        if (erro) toast.error(erro);
        else setArquivo(f);
      }
    };
    window.addEventListener("paste", aoColar);
    return () => window.removeEventListener("paste", aoColar);
  }, [desabilitado]);

  function enviar() {
    if (!arquivo) return;
    iniciar(async () => {
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      const r = await enviarImagem(creativeId, fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const avisos = r.avisos ?? [];
      if (avisos.length) toast.warning(r.mensagem);
      else toast.success(r.mensagem);
      setArquivo(null);
      if (input.current) input.current.value = "";
      aoEnviar?.({ avisos });
    });
  }

  const vertical = dims ? dims.h / dims.w >= 1.3 : true;

  return (
    <div className="space-y-3">
      {!arquivo ? (
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            escolher(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-4 text-center transition-colors hover:border-tech/60 hover:bg-tech/5 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50",
            compacto ? "py-5" : "py-10",
            arrastando && "border-tech bg-tech/10",
          )}
        >
          <ImageUp className="size-7 text-tech" aria-hidden />
          <span className="text-body-sm font-medium">Arraste a imagem aqui, cole com Ctrl+V ou clique para escolher</span>
          <span className="text-caption text-muted-foreground">PNG, JPG ou WebP · até 9,5 MB · ideal vertical 2:3 (1000×1500)</span>
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3 sm:flex-row sm:items-center">
          {previa && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previa}
              alt="Prévia da imagem selecionada"
              className="h-40 w-auto rounded-lg border border-border/70 object-contain"
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-body-sm font-medium">{arquivo.name}</p>
            <p className="text-caption text-muted-foreground tabular">
              {tamanho(arquivo.size)}
              {dims && ` · ${dims.w}×${dims.h}`}
            </p>
            {!vertical && <p className="text-caption text-warning">A imagem não é vertical — no Pinterest o formato 2:3 rende mais.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="tech" size="sm" onClick={enviar} disabled={pendente || desabilitado}>
                {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
                {rotuloEnviar}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setArquivo(null)} disabled={pendente}>
                <X /> Trocar
              </Button>
            </div>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Escolher imagem"
        onChange={(e) => escolher(e.target.files?.[0])}
      />
    </div>
  );
}
