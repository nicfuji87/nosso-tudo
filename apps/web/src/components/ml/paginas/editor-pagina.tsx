"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { mudarStatusPagina, salvarPagina } from "@/app/ml/(painel)/paginas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, Secao, Textarea } from "@/components/ml/campos";
import { LIMITES_PAGINA } from "@/lib/ml/paginas/regras";
import { cn } from "@/lib/utils";
import { CopiarUrl } from "./copiar-url";
import { STATUS_PAGINA } from "./rotulos";

interface PaginaEdicao {
  id: string;
  titulo: string;
  resumo: string | null;
  destaques: string[];
  imagens: { url: string; alt: string }[];
  cta: string;
  status: "draft" | "published" | "paused";
  affiliateUrl: string;
  productId: string | null;
  visitas: number;
  cliques: number;
}

export function EditorPagina({ pagina, url, fotosProduto, podeEditar }: { pagina: PaginaEdicao; url: string; fotosProduto: string[]; podeEditar: boolean }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(pagina.titulo);
  const [resumo, setResumo] = useState(pagina.resumo ?? "");
  const [destaques, setDestaques] = useState(pagina.destaques.join("\n"));
  const [cta, setCta] = useState(pagina.cta);
  const [fotos, setFotos] = useState<string[]>(pagina.imagens.map((i) => i.url));
  const [pendente, iniciar] = useTransition();

  // Ordem: as escolhidas primeiro (na ordem de escolha), depois as demais do anúncio.
  const disponiveis = Array.from(new Set([...pagina.imagens.map((i) => i.url), ...fotosProduto]));
  const listaDestaques = destaques.split("\n").map((d) => d.trim()).filter(Boolean);
  const destaqueLongo = listaDestaques.some((d) => d.length > LIMITES_PAGINA.destaque);
  const s = STATUS_PAGINA[pagina.status];

  const alternarFoto = (u: string) =>
    setFotos((atual) => (atual.includes(u) ? atual.filter((x) => x !== u) : atual.length >= LIMITES_PAGINA.imagens ? atual : [...atual, u]));

  const salvar = () =>
    iniciar(async () => {
      const r = await salvarPagina(pagina.id, {
        titulo,
        resumo: resumo.trim() || null,
        destaques: listaDestaques,
        imagens: fotos.map((u, i) => ({ url: u, alt: i === 0 ? titulo : `${titulo} — foto ${i + 1}` })),
        cta,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Secao titulo="Conteúdo" descricao="Texto curto e honesto. Não prometa preço nem prazo: eles mudam no Mercado Livre.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <fieldset disabled={!podeEditar || pendente} className="space-y-4">
            <Campo label={`Título (${titulo.length}/${LIMITES_PAGINA.titulo})`}>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={LIMITES_PAGINA.titulo} />
            </Campo>
            <Campo label={`Resumo (${resumo.length}/${LIMITES_PAGINA.resumo})`} dica="Opcional. Para que serve e por que vale a pena, em 1–3 frases.">
              <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} maxLength={LIMITES_PAGINA.resumo} rows={3} />
            </Campo>
            <Campo
              label={`Destaques (${listaDestaques.length}/${LIMITES_PAGINA.destaques})`}
              dica={destaqueLongo ? `Cada destaque tem até ${LIMITES_PAGINA.destaque} caracteres.` : "Um por linha. Vieram das características do anúncio."}
            >
              <Textarea value={destaques} onChange={(e) => setDestaques(e.target.value)} rows={5} aria-invalid={destaqueLongo} />
            </Campo>
            <Campo label={`Texto do botão (${cta.length}/${LIMITES_PAGINA.cta})`}>
              <Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={LIMITES_PAGINA.cta} />
            </Campo>
            <div className="space-y-2">
              <p className="text-body-sm font-medium">
                Fotos ({fotos.length}/{LIMITES_PAGINA.imagens}) <span className="font-normal text-muted-foreground">— a primeira escolhida é a capa</span>
              </p>
              {disponiveis.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {disponiveis.map((u) => {
                    const pos = fotos.indexOf(u);
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => alternarFoto(u)}
                        aria-pressed={pos >= 0}
                        className={cn("relative overflow-hidden rounded-lg border-2 bg-white", pos >= 0 ? "border-primary" : "border-border opacity-60 hover:opacity-100")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- CDN do ML */}
                        <img src={u} alt="" className="aspect-square w-full object-contain" />
                        {pos >= 0 && (
                          <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                            {pos + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-caption text-muted-foreground">O anúncio não tem fotos disponíveis.</p>
              )}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" disabled={!podeEditar || pendente || destaqueLongo || titulo.trim().length < 3}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        </form>
      </Secao>

      <div className="space-y-4">
        <Secao titulo="Publicação">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={s.variante}>{s.label}</Badge>
              <span className="text-caption text-muted-foreground tabular">
                {pagina.visitas} visitas · {pagina.cliques} cliques
              </span>
            </div>
            <CopiarUrl url={url} />
            <p className="text-caption text-muted-foreground">Cole esta URL no campo Link do Pin. Ela só funciona com a página publicada.</p>
            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                {pagina.status !== "published" && (
                  <AcaoBotao size="sm" acao={() => mudarStatusPagina(pagina.id, "published")}>
                    <Check /> Publicar
                  </AcaoBotao>
                )}
                {pagina.status === "published" && (
                  <AcaoBotao size="sm" variant="secondary" acao={() => mudarStatusPagina(pagina.id, "paused")} confirmar="Pausar? Quem abrir o Pin verá “não disponível”, sem o botão.">
                    Pausar
                  </AcaoBotao>
                )}
              </div>
            )}
          </div>
        </Secao>
        <Secao titulo="Destino do botão">
          <p className="break-all font-mono text-caption text-muted-foreground">{pagina.affiliateUrl}</p>
          <p className="mt-2 text-caption text-muted-foreground">
            O link de afiliado fica gravado no servidor; a página nunca aceita outro destino.
            {pagina.productId && (
              <>
                {" "}
                <Link href={`/ml/produtos/${pagina.productId}`} className="underline">
                  Ver produto
                </Link>
              </>
            )}
          </p>
        </Secao>
      </div>
    </div>
  );
}
