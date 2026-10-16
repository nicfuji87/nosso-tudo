"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Search, SlidersHorizontal, Star, Truck, BadgeCheck, Globe } from "lucide-react";
import { buscarProdutos, lerBusca } from "@/app/ml/(painel)/estudio/actions";
import { filtrarResultados, formatarVendidos, type FiltrosBusca } from "@/lib/ml/estudio/busca";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, Checkbox, NativeSelect } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import { brl, type ProdutoRef, type ResultadoBusca } from "./tipos";

const VENDIDOS = [
  { v: "", l: "Qualquer" },
  { v: "100", l: "+100" },
  { v: "500", l: "+500" },
  { v: "1000", l: "+1 mil" },
  { v: "5000", l: "+5 mil" },
  { v: "10000", l: "+10 mil" },
  { v: "50000", l: "+50 mil" },
];
const AVALIACAO = [
  { v: "", l: "Qualquer" },
  { v: "4", l: "4,0 ou mais" },
  { v: "4.5", l: "4,5 ou mais" },
  { v: "4.8", l: "4,8 ou mais" },
];
const ORDENS: { v: NonNullable<FiltrosBusca["ordem"]>; l: string }[] = [
  { v: "vendidos", l: "Mais vendidos" },
  { v: "avaliacao", l: "Melhor avaliados" },
  { v: "desconto", l: "Maior desconto" },
  { v: "menor_preco", l: "Menor preço" },
  { v: "relevancia", l: "Relevância do ML" },
];

const palavras = (s: string) => s.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);

export function PassoBusca({
  podeEditar,
  apifyConectado,
  buscaInicial,
  aoEscolher,
  escolhendo,
}: {
  podeEditar: boolean;
  apifyConectado: boolean;
  buscaInicial: string | null;
  aoEscolher: (r: ResultadoBusca) => void;
  escolhendo: string | null;
}) {
  const [entrada, setEntrada] = useState(buscaInicial ?? "");
  const [buscaId, setBuscaId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [termo, setTermo] = useState<string | null>(null);
  const [ref, setRef] = useState<ProdutoRef | null>(null);
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [pendente, iniciar] = useTransition();
  const [verFiltros, setVerFiltros] = useState(false);
  const [f, setF] = useState({ precoMin: "", precoMax: "", vendidosMin: "1000", avaliacaoMin: "", freteGratis: false, lojaOficial: false, semInternacional: true, semPatrocinado: false, incluir: "", excluir: "", ordem: "vendidos" as NonNullable<FiltrosBusca["ordem"]> });
  const disparou = useRef(false);

  const buscar = (texto = entrada) => {
    if (!texto.trim()) return;
    iniciar(async () => {
      setErro(null);
      setResultados([]);
      setRef(null);
      const r = await buscarProdutos(texto);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setBuscaId(r.buscaId);
      setStatus("queued");
    });
  };

  useEffect(() => {
    if (buscaInicial && !disparou.current && podeEditar) {
      disparou.current = true;
      buscar(buscaInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só uma vez com o ?q= da URL
  }, []);

  // Acompanha a busca (o Apify leva ~20–60 s).
  useEffect(() => {
    if (!buscaId || status === "done" || status === "error") return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await lerBusca(buscaId);
      if (!vivo || "error" in r) return;
      setStatus(r.status);
      setTermo(r.termo);
      setRef((r.produto_ref as ProdutoRef | null) ?? null);
      if (r.status === "done") setResultados(r.resultados);
      if (r.status === "error") setErro(r.erro ?? "A busca falhou.");
    }, 3000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [buscaId, status]);

  const filtrados = useMemo(
    () =>
      filtrarResultados(resultados, {
        precoMin: f.precoMin ? Number(f.precoMin) : null,
        precoMax: f.precoMax ? Number(f.precoMax) : null,
        vendidosMin: f.vendidosMin ? Number(f.vendidosMin) : null,
        avaliacaoMin: f.avaliacaoMin ? Number(f.avaliacaoMin) : null,
        freteGratis: f.freteGratis,
        lojaOficial: f.lojaOficial,
        semInternacional: f.semInternacional,
        semPatrocinado: f.semPatrocinado,
        incluir: palavras(f.incluir),
        excluir: palavras(f.excluir),
        ordem: f.ordem,
      }),
    [resultados, f],
  );
  const buscando = pendente || status === "queued" || status === "running";

  return (
    <div className="space-y-4">
      {!apifyConectado && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-caption text-foreground">
          A busca com vendidos e avaliações usa o Apify. Conecte-o em Avançado › Integrações.
        </p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <Input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Palavra-chave (ex.: pote de vidro hermético) ou link de um produto do Mercado Livre"
          className="h-11 flex-1"
          disabled={!podeEditar || buscando}
          aria-label="Palavra-chave ou link do produto"
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1 sm:flex-none" disabled={!podeEditar || buscando || !entrada.trim()}>
            {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar
          </Button>
          <Button type="button" variant="secondary" className="h-11" onClick={() => setVerFiltros((v) => !v)} aria-expanded={verFiltros}>
            <SlidersHorizontal /> Filtros
          </Button>
        </div>
      </form>

      {verFiltros && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Preço (R$)">
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder="mín." value={f.precoMin} onChange={(e) => setF({ ...f, precoMin: e.target.value.replace(/[^\d.]/g, "") })} />
              <Input inputMode="decimal" placeholder="máx." value={f.precoMax} onChange={(e) => setF({ ...f, precoMax: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
          </Campo>
          <Campo label="Vendidos">
            <NativeSelect className="w-full" value={f.vendidosMin} onChange={(e) => setF({ ...f, vendidosMin: e.target.value })}>
              {VENDIDOS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Avaliação">
            <NativeSelect className="w-full" value={f.avaliacaoMin} onChange={(e) => setF({ ...f, avaliacaoMin: e.target.value })}>
              {AVALIACAO.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Ordenar por">
            <NativeSelect className="w-full" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as typeof f.ordem })}>
              {ORDENS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Título precisa ter" dica="Palavras separadas por espaço ou vírgula.">
            <Input placeholder="ex.: vidro 10" value={f.incluir} onChange={(e) => setF({ ...f, incluir: e.target.value })} />
          </Campo>
          <Campo label="Excluir se tiver">
            <Input placeholder="ex.: plástico infantil" value={f.excluir} onChange={(e) => setF({ ...f, excluir: e.target.value })} />
          </Campo>
          <div className="space-y-2 text-body-sm sm:col-span-2">
            {(
              [
                ["freteGratis", "Só frete grátis"],
                ["lojaOficial", "Só lojas oficiais"],
                ["semInternacional", "Sem compra internacional"],
                ["semPatrocinado", "Sem anúncios patrocinados"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <Checkbox checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {l}
              </label>
            ))}
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-caption text-destructive">
          {erro}
        </p>
      )}
      {buscando && (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Buscando no Mercado Livre{termo ? ` por “${termo}”` : ""}… leva uns 30 segundos.
        </p>
      )}

      {ref && status === "done" && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN do ML */}
          {ref.imagem && <img src={ref.imagem} alt="" className="size-14 rounded-lg bg-white object-contain" />}
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">Produto do link · buscando semelhantes por “{termo}”</p>
            <p className="truncate text-body-sm font-medium">{ref.titulo}</p>
          </div>
          {ref.resultado ? (
            <Button size="sm" variant="secondary" disabled={!podeEditar || !!escolhendo} onClick={() => aoEscolher(ref.resultado!)}>
              {escolhendo === ref.resultado.id && <Loader2 className="animate-spin" />} Usar este
            </Button>
          ) : (
            <span className="max-w-40 text-right text-caption text-muted-foreground">Não apareceu na busca — escolha um semelhante abaixo.</span>
          )}
        </div>
      )}

      {status === "done" && (
        <p className="text-caption text-muted-foreground">
          {filtrados.length} de {resultados.length} produtos{resultados.length !== filtrados.length ? " (filtros aplicados)" : ""}.
        </p>
      )}

      {filtrados.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtrados.map((r) => (
            <li key={r.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              {r.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN do ML
                <img src={r.imagem} alt="" loading="lazy" className="aspect-square w-full bg-white object-contain p-2" />
              ) : (
                <div className="aspect-square w-full bg-secondary" />
              )}
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <p className="line-clamp-2 text-caption font-medium leading-snug" title={r.titulo}>
                  {r.titulo}
                </p>
                <p className="text-body-sm font-semibold tabular">
                  {brl(r.preco)}
                  {r.descontoPct ? <span className="ml-1.5 text-caption font-normal text-success">{r.descontoPct}% off</span> : null}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={(r.vendidos ?? 0) >= 1000 ? "success" : "default"}>{formatarVendidos(r.vendidos)}</Badge>
                  {r.avaliacao != null && (
                    <Badge variant="outline">
                      <Star className="size-3" aria-hidden /> {r.avaliacao.toLocaleString("pt-BR")}
                      {r.numAvaliacoes ? ` (${r.numAvaliacoes.toLocaleString("pt-BR")})` : ""}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-caption text-muted-foreground">
                  {r.freteGratis && (
                    <span className="flex items-center gap-1">
                      <Truck className="size-3" aria-hidden /> Frete grátis
                    </span>
                  )}
                  {r.lojaOficial && (
                    <span className="flex items-center gap-1">
                      <BadgeCheck className="size-3" aria-hidden /> Oficial
                    </span>
                  )}
                  {r.internacional && (
                    <span className="flex items-center gap-1">
                      <Globe className="size-3" aria-hidden /> Internacional
                    </span>
                  )}
                  {r.patrocinado && <span>Patrocinado</span>}
                </div>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" disabled={!podeEditar || !!escolhendo} onClick={() => aoEscolher(r)}>
                    {escolhendo === r.id && <Loader2 className="animate-spin" />} Escolher
                  </Button>
                  {r.link && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={r.link} target="_blank" rel="noopener noreferrer" aria-label="Ver no Mercado Livre">
                        Ver
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {status === "done" && resultados.length > 0 && filtrados.length === 0 && (
        <p className={cn("rounded-xl border border-dashed border-border px-4 py-6 text-center text-body-sm text-muted-foreground")}>
          Nenhum produto passa nos filtros. Afrouxe “Vendidos” ou a faixa de preço.
        </p>
      )}
    </div>
  );
}
