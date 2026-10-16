"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { publicar, statusPin } from "@/app/ml/(painel)/estudio/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import type { BoardEstudio, ProdutoEscolhido } from "./tipos";

export interface TextosIniciais {
  titulo: string;
  descricao: string;
  altText: string;
  boardId: string | null;
}

/** Passo 4: revisar os textos, escolher o board, colar o link de afiliado e publicar. */
export function PassoPublicar({
  creativeId,
  imagem,
  produto,
  textos,
  boards,
  podeEditar,
  pinterestConectado,
  aoRecomecar,
}: {
  creativeId: string;
  imagem: string;
  produto: ProdutoEscolhido;
  textos: TextosIniciais;
  boards: BoardEstudio[];
  podeEditar: boolean;
  pinterestConectado: boolean;
  aoRecomecar: () => void;
}) {
  const [titulo, setTitulo] = useState(textos.titulo);
  const [descricao, setDescricao] = useState(textos.descricao);
  const [alt, setAlt] = useState(textos.altText);
  const [boardId, setBoardId] = useState(textos.boardId ?? boards.find((b) => b.padrao)?.id ?? boards[0]?.id ?? "");
  const [link, setLink] = useState(produto.linkAfiliado ?? "");
  const [pinId, setPinId] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ status: string; erro: string | null; url: string | null } | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!pinId || estado?.status === "published" || estado?.status === "failed" || estado?.status === "blocked") return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await statusPin(pinId);
      if (vivo && !("error" in r)) setEstado(r);
    }, 3000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [pinId, estado?.status]);

  const enviar = () =>
    iniciar(async () => {
      const r = await publicar({ creativeId, titulo, descricao, altText: alt, boardId, linkAfiliado: link });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setPinId(r.pinId);
      setEstado({ status: "scheduled", erro: null, url: null });
    });

  const publicando = !!pinId && !["published", "failed", "blocked"].includes(estado?.status ?? "");

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element -- Storage do app */}
      <img src={imagem} alt={alt} className="aspect-[2/3] w-full max-w-[280px] rounded-xl border border-border object-cover" />
      <div className="space-y-4">
        <fieldset disabled={!podeEditar || pendente || !!pinId} className="space-y-4">
          <Campo label={`Título (${titulo.length}/100)`}>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={100} />
          </Campo>
          <Campo label={`Descrição (${descricao.length}/800)`} dica="O aviso de link de afiliado fica no fim.">
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={800} rows={5} />
          </Campo>
          <Campo label={`Texto alternativo (${alt.length}/500)`} dica="Descreve a imagem (acessibilidade e busca do Pinterest).">
            <Textarea value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} rows={2} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Board">
              <NativeSelect className="w-full" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                    {b.id === textos.boardId ? " (sugerido)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            <Campo
              label="Link de afiliado"
              dica={
                <>
                  Gere no Mercado Livre (botão “Compartilhar” do anúncio, logado como afiliado).{" "}
                  {produto.linkProduto && (
                    <a href={produto.linkProduto} target="_blank" rel="noopener noreferrer" className="underline">
                      Abrir anúncio
                    </a>
                  )}
                </>
              }
            >
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meli.la/…" inputMode="url" />
            </Campo>
          </div>
        </fieldset>

        {!pinId ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={enviar} disabled={!podeEditar || !pinterestConectado || pendente || !boardId || !link.trim() || titulo.trim().length < 5}>
              {pendente ? <Loader2 className="animate-spin" /> : <Send />} Publicar no Pinterest
            </Button>
            {!pinterestConectado && <span className="text-caption text-warning">Conecte o Pinterest em Avançado › Integrações.</span>}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border p-4">
            {publicando && (
              <p className="flex items-center gap-2 text-body-sm">
                <Loader2 className="size-4 animate-spin" /> Publicando no Pinterest…
              </p>
            )}
            {estado?.status === "published" && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-body-sm font-medium">
                  <CheckCircle2 className="size-5 text-success" /> Publicado!
                </p>
                <div className="flex flex-wrap gap-2">
                  {estado.url && (
                    <Button asChild size="sm" variant="secondary">
                      <a href={estado.url} target="_blank" rel="noopener noreferrer">
                        Ver o Pin <ExternalLink />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" onClick={aoRecomecar}>
                    Criar outro Pin
                  </Button>
                </div>
              </div>
            )}
            {(estado?.status === "failed" || estado?.status === "blocked") && (
              <div className="space-y-2">
                <p className="flex items-start gap-2 text-body-sm text-destructive">
                  <XCircle className="mt-0.5 size-5 shrink-0" /> Não publicou: {estado.erro ?? "erro desconhecido"}
                </p>
                <p className="text-caption text-muted-foreground">Veja e tente de novo em Pins publicados.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
