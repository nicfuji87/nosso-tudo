"use client";

import { useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { escolherImagem, escolherProduto } from "@/app/ml/(painel)/estudio/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PassoBusca } from "./passo-busca";
import { PassoImagens } from "./passo-imagens";
import { PassoPublicar, type TextosIniciais } from "./passo-publicar";
import type { BoardEstudio, Integracoes, ProdutoEscolhido, PromptSalvo, ResultadoBusca } from "./tipos";

const ETAPAS = ["Produto", "Imagem", "Publicar"] as const;

/** Fluxo simples: buscar → escolher produto → foto + prompt → 3 imagens → textos → publicar. */
export function Estudio({
  prompts,
  boards,
  integracoes,
  podeEditar,
  buscaInicial,
}: {
  prompts: PromptSalvo[];
  boards: BoardEstudio[];
  integracoes: Integracoes;
  podeEditar: boolean;
  buscaInicial: string | null;
}) {
  const [produto, setProduto] = useState<ProdutoEscolhido | null>(null);
  const [selecao, setSelecao] = useState<{ creativeId: string; imagem: string; textos: TextosIniciais } | null>(null);
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [escolhendoImagem, setEscolhendoImagem] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const etapa = selecao ? 2 : produto ? 1 : 0;

  const escolher = (r: ResultadoBusca) => {
    setEscolhendo(r.id);
    iniciar(async () => {
      const res = await escolherProduto({ idCatalogo: r.idCatalogo, idAnuncio: r.idAnuncio, link: r.link, vendidos: r.vendidos, avaliacao: r.avaliacao, numAvaliacoes: r.numAvaliacoes });
      setEscolhendo(null);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (!res.fotos.length) {
        toast.error("Este produto não tem fotos disponíveis.");
        return;
      }
      setProduto(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const usarImagem = (creativeId: string, asset: { id: string; url: string }) => {
    setEscolhendoImagem(asset.id);
    iniciar(async () => {
      const r = await escolherImagem(creativeId, asset.id);
      setEscolhendoImagem(null);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setSelecao({ creativeId, imagem: asset.url, textos: r });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const recomecar = () => {
    setSelecao(null);
    setProduto(null);
  };

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-caption" aria-label="Etapas">
        {ETAPAS.map((e, i) => (
          <li key={e} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full font-semibold",
                i < etapa ? "bg-success/20 text-success" : i === etapa ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              )}
              aria-current={i === etapa ? "step" : undefined}
            >
              {i + 1}
            </span>
            <span className={cn(i === etapa ? "font-semibold text-foreground" : "text-muted-foreground")}>{e}</span>
            {i < ETAPAS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {produto && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN do ML */}
          <img src={produto.fotos[0]} alt="" className="size-12 rounded-lg bg-white object-contain" />
          <p className="min-w-0 flex-1 truncate text-body-sm font-medium">{produto.titulo}</p>
          <Button size="sm" variant="ghost" onClick={() => (selecao ? setSelecao(null) : recomecar())}>
            <ArrowLeft /> {selecao ? "Trocar imagem" : "Trocar produto"}
          </Button>
        </div>
      )}

      {/* A busca fica montada (escondida) para não perder resultados ao voltar. */}
      <div className={cn(etapa !== 0 && "hidden")}>
        <PassoBusca podeEditar={podeEditar} apifyConectado={integracoes.apify} buscaInicial={buscaInicial} aoEscolher={escolher} escolhendo={escolhendo} />
      </div>
      {produto && (
        <div className={cn(etapa !== 1 && "hidden")}>
          <PassoImagens
            key={produto.productId}
            produto={produto}
            prompts={prompts}
            podeEditar={podeEditar}
            openaiConectada={integracoes.openai}
            aoEscolherImagem={usarImagem}
            escolhendoImagem={escolhendoImagem}
          />
        </div>
      )}
      {produto && selecao && (
        <PassoPublicar
          key={selecao.creativeId + selecao.imagem}
          creativeId={selecao.creativeId}
          imagem={selecao.imagem}
          produto={produto}
          textos={selecao.textos}
          boards={boards}
          podeEditar={podeEditar}
          pinterestConectado={integracoes.pinterest}
          aoRecomecar={recomecar}
        />
      )}
    </div>
  );
}
