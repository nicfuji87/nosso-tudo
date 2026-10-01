"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Download, ExternalLink, ImageOff, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadImagem } from "@/components/ml/criativos/upload-imagem";
import { baixarArquivo, labelModo, nomeArquivo, type CriativoView } from "@/components/ml/criativos/rotulos";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";

const CHATGPT = "https://chatgpt.com/";

/**
 * Imagens manuais (modo ChatGPT / upload — ADR-ML-011): prompt pronto, imagem de
 * referência e upload do resultado, um criativo por vez com a fila ao lado.
 */
export function ImagemManual({ lista, atual, tz, podeOperar }: { lista: CriativoView[]; atual: CriativoView; tz: string; podeOperar: boolean }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const ehChatGpt = atual.image_mode === "manual_chatgpt" && Boolean(atual.image_prompt);
  const referencia = atual.reference_image_url ?? atual.produto?.thumbnail ?? null;
  const original = atual.produto?.thumbnail ?? null;
  const indice = lista.findIndex((c) => c.id === atual.id);

  async function copiarPrompt() {
    if (!atual.image_prompt) return;
    try {
      await navigator.clipboard.writeText(atual.image_prompt);
      setCopiado(true);
      toast.success("Prompt copiado — cole no ChatGPT.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar — selecione o texto e use Ctrl+C.");
    }
  }

  function proximo() {
    const resto = lista.filter((c) => c.id !== atual.id);
    const prox = resto[indice] ?? resto[0] ?? null;
    // enviarImagem já revalida a rota; a navegação busca a lista atualizada.
    router.push(prox ? `/ml/pendencias/imagens?id=${prox.id}` : "/ml/pendencias/imagens");
  }

  const passos = ehChatGpt
    ? [
        "Copie o prompt.",
        "No ChatGPT, anexe a imagem de referência (baixe ou arraste).",
        "Cole o prompt e gere a imagem.",
        "Baixe o resultado.",
        "Envie aqui (arraste, Ctrl+V ou escolha o arquivo).",
      ]
    : ["Use a imagem de referência como base.", "Prepare a arte final no formato vertical 2:3.", "Envie aqui (arraste, Ctrl+V ou escolha o arquivo)."];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">Imagens manuais</h1>
          <p className="text-body-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{lista.length}</span> aguardando imagem · meta 30–90 s por criativo
          </p>
        </div>
        <p className="text-caption text-muted-foreground tabular">
          {indice + 1} de {lista.length}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Foco */}
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={ehChatGpt ? "tech" : "default"}>
                {ehChatGpt ? <Bot className="size-3.5" aria-hidden /> : null}
                {labelModo(atual.image_mode)}
              </Badge>
              {atual.angulo && <Badge variant="outline">{labelAngulo(atual.angulo)}</Badge>}
              <span className="text-caption text-muted-foreground">Formato {atual.format}</span>
            </div>
            <h2 className="mt-2 text-h4 font-semibold leading-snug">{atual.headline ?? atual.title ?? "Criativo"}</h2>
            {atual.produto && (
              <Link href={`/ml/produtos/${atual.produto.id}`} className="text-body-sm text-muted-foreground hover:underline">
                {atual.produto.title}
              </Link>
            )}

            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {/* Referência */}
              <div className="space-y-3">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-card">
                  {original ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={original} alt={`Foto original: ${atual.produto?.title ?? "produto"}`} className="absolute inset-0 size-full object-contain" />
                  ) : (
                    <Package className="absolute inset-0 m-auto size-8 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {referencia && (
                    <Button asChild variant="secondary" size="sm">
                      <a href={referencia} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Abrir imagem de referência
                      </a>
                    </Button>
                  )}
                  {referencia && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const r = await baixarArquivo(referencia, nomeArquivo(`referencia-${atual.produto?.title ?? atual.id}`, referencia));
                        if (r === "aberto") toast.info("Abrimos a imagem em nova aba — salve com o botão direito.");
                      }}
                    >
                      <Download /> Baixar
                    </Button>
                  )}
                </div>
              </div>

              {/* Passos + prompt */}
              <div className="space-y-4">
                <ol className="space-y-1.5 text-body-sm">
                  {passos.map((p, i) => (
                    <li key={p} className="flex gap-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tech/15 text-caption font-semibold text-tech">{i + 1}</span>
                      <span className="pt-0.5">{p}</span>
                    </li>
                  ))}
                </ol>

                {ehChatGpt && (
                  <div className="space-y-2">
                    <label htmlFor="prompt" className="text-body-sm font-medium">
                      Prompt
                    </label>
                    <textarea
                      id="prompt"
                      readOnly
                      value={atual.image_prompt ?? ""}
                      rows={8}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full resize-y rounded-xl border border-input bg-secondary/40 px-3.5 py-2.5 font-mono text-caption leading-relaxed focus-visible:outline-none focus-visible:shadow-focus"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="tech" size="sm" onClick={copiarPrompt}>
                        {copiado ? <Check /> : <Copy />}
                        {copiado ? "Copiado" : "Copiar prompt"}
                      </Button>
                      <Button asChild variant="secondary" size="sm">
                        <a href={CHATGPT} target="_blank" rel="noopener noreferrer">
                          <Bot /> Abrir ChatGPT
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
                {atual.image_mode === "manual_chatgpt" && !atual.image_prompt && (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption text-warning">
                    O prompt ainda não foi gerado para este criativo. Envie uma imagem própria ou regere a imagem pelo editor.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border/70 bg-card p-4 shadow-card sm:p-5" aria-labelledby="enviar-titulo">
            <h2 id="enviar-titulo" className="mb-3 text-body font-semibold">
              Enviar imagem final
            </h2>
            {podeOperar ? (
              <UploadImagem creativeId={atual.id} rotuloEnviar="Enviar e próximo" aoEnviar={proximo} />
            ) : (
              <p className="text-body-sm text-muted-foreground">Seu papel permite só visualizar.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/ml/criativos?criativo=${atual.id}`}>Abrir no editor</Link>
              </Button>
              {lista.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const prox = lista[(indice + 1) % lista.length];
                    if (prox) router.push(`/ml/pendencias/imagens?id=${prox.id}`);
                  }}
                >
                  Pular para o próximo
                </Button>
              )}
            </div>
          </section>
        </div>

        {/* Fila */}
        <aside aria-label="Fila de imagens" className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-overline uppercase text-muted-foreground">Fila</p>
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[75vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
            {lista.map((c) => (
              <li key={c.id} className="w-56 shrink-0 lg:w-auto">
                <Link
                  href={`/ml/pendencias/imagens?id=${c.id}`}
                  aria-current={c.id === atual.id ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2 transition-colors",
                    c.id === atual.id ? "border-tech bg-tech/5" : "border-border/70 bg-card hover:bg-secondary/50",
                  )}
                >
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card">
                    {c.produto?.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.produto.thumbnail} alt={c.produto.title} loading="lazy" className="absolute inset-0 size-full object-contain" />
                    ) : (
                      <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-caption font-medium">{c.headline ?? c.title ?? c.produto?.title ?? "Criativo"}</p>
                    <p className="text-overline text-muted-foreground">
                      {labelModo(c.image_mode)} · {formatarNoFuso(c.created_at, tz, { day: "2-digit", month: "2-digit" })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
