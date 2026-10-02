"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarPlus, CheckCheck, Copy, Layers, Loader2, Package, Plus, Sparkles, Trophy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { agendarAprovadosFamilia, arquivarFamilia, duplicarHipotese, gerarLoteFamilia } from "@/app/ml/(painel)/criativos/actions-v2";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Checkbox } from "@/components/ml/campos";
import { Button } from "@/components/ui/button";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { CardCriativo } from "./card-criativo";
import { FamiliaStatusBadge, formatarNumero } from "./detalhes-v2";
import { AdicionarVarianteDialog } from "./dialogos-v2";
import type { HandlersCriativo } from "./menu-criativo";
import { ctrSaida, type CriativoView, type FamiliaView, type PresetOpcao } from "./rotulos";

interface Props {
  familias: FamiliaView[];
  criativos: CriativoView[];
  tz: string;
  podeOperar: boolean;
  handlers: HandlersCriativo;
  selecionados: Set<string>;
  aoSelecionar: (id: string, v: boolean) => void;
  aoSelecionarVarios: (ids: string[], v: boolean) => void;
  presets: PresetOpcao[];
  openai: boolean;
  errosAprovacao: Map<string, string>;
  statusFiltro: string | null;
}

/** Vista "Por família" (§11.5): um card por família com as variantes dentro. */
export function VistaFamilias(p: Props) {
  const porFamilia = new Map<string, CriativoView[]>();
  for (const c of p.criativos) if (c.family_id) porFamilia.set(c.family_id, [...(porFamilia.get(c.family_id) ?? []), c]);
  return (
    <div className="space-y-5">
      {p.familias.map((f) => (
        <CardFamilia key={f.id} f={f} variantes={porFamilia.get(f.id) ?? []} {...p} />
      ))}
    </div>
  );
}

function melhorMetrica(variantes: CriativoView[]) {
  let melhor: CriativoView | null = null;
  for (const v of variantes) {
    if (!v.metricas) continue;
    if (
      !melhor?.metricas ||
      v.metricas.outbound > melhor.metricas.outbound ||
      (v.metricas.outbound === melhor.metricas.outbound && v.metricas.impressoes > melhor.metricas.impressoes)
    )
      melhor = v;
  }
  return melhor;
}

function CardFamilia({
  f,
  variantes,
  tz,
  podeOperar,
  handlers,
  selecionados,
  aoSelecionar,
  aoSelecionarVarios,
  presets,
  openai,
  errosAprovacao,
  statusFiltro,
}: Props & { f: FamiliaView; variantes: CriativoView[] }) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState(false);
  const [agendando, iniciarAgendar] = useTransition();
  const arquivada = f.status === "archived";
  const operar = podeOperar && !arquivada;

  const ids = variantes.map((c) => c.id);
  const marcados = variantes.filter((c) => selecionados.has(c.id));
  const aprovaveis = marcados.filter((c) => c.status === "review").map((c) => c.id);
  const todos = ids.length > 0 && ids.every((i) => selecionados.has(i));
  const melhor = melhorMetrica(variantes);
  const ctr = melhor ? ctrSaida(melhor.metricas) : null;
  const semVariantes = f.totais.variantes === 0;

  function agendar() {
    iniciarAgendar(async () => {
      const r = await agendarAprovadosFamilia(f.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.erros.length) toast.warning(r.mensagem);
      else if (r.agendados === 0) toast.info("Nenhuma variante aprovada sem Pin para agendar.");
      else toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby={`familia-${f.id}`}
      className={cn("rounded-xl border border-border/70 bg-card shadow-card", arquivada && "opacity-80")}
    >
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-card sm:size-24" title="Imagem de referência principal">
            {f.referencia || f.produto?.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.referencia ?? f.produto!.thumbnail!}
                alt={`Referência: ${f.produto?.title ?? "produto"}`}
                loading="lazy"
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              <Package className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
            )}
            {!f.referencia && (
              <span className="absolute inset-x-0 bottom-0 bg-warning/90 px-1 py-0.5 text-center text-overline text-warning-foreground">sem referência</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {f.produto && (
              <Link href={`/ml/produtos/${f.produto.id}`} className="flex items-center gap-1.5 text-caption text-muted-foreground hover:underline">
                {f.produto.thumbnail && f.referencia && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.produto.thumbnail} alt="" loading="lazy" className="size-5 shrink-0 rounded border border-border/70 object-contain" />
                )}
                <span className="line-clamp-1">{f.produto.title}</span>
              </Link>
            )}
            <h2 id={`familia-${f.id}`} className="flex flex-wrap items-center gap-2 text-h4 font-semibold tracking-tight">
              <span className="line-clamp-2">{f.name}</span>
              <FamiliaStatusBadge status={f.status} className="px-2 py-0.5" />
            </h2>
            {f.hypothesis && <p className="line-clamp-2 text-body-sm text-muted-foreground">Hipótese: {f.hypothesis}</p>}
            {f.objective && <p className="line-clamp-1 text-caption text-muted-foreground">Objetivo: {f.objective}</p>}
            <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-caption">
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Variantes</dt>
                <dd className="font-semibold tabular">{f.totais.variantes}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Aprovadas</dt>
                <dd className="font-semibold tabular text-success">{f.totais.aprovadas}</dd>
              </div>
              {f.totais.revisao > 0 && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">Em revisão</dt>
                  <dd className="font-semibold tabular">{f.totais.revisao}</dd>
                </div>
              )}
              {f.totais.publicadas > 0 && (
                <div className="flex gap-1">
                  <dt className="text-muted-foreground">Publicadas</dt>
                  <dd className="font-semibold tabular">{f.totais.publicadas}</dd>
                </div>
              )}
              <div className="flex gap-1">
                <dt className="text-muted-foreground">Board</dt>
                <dd className="font-medium">{f.board ?? "Automático"}</dd>
              </div>
              {melhor?.metricas && (
                <div className="flex items-center gap-1" title={`Melhor variante: ${melhor.headline ?? melhor.title ?? ""}`}>
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <Trophy className="size-3.5 text-accent-foreground" aria-hidden /> Melhor
                  </dt>
                  <dd className="font-medium tabular">
                    {formatarNumero(melhor.metricas.outbound)} cliques · {formatarNumero(melhor.metricas.impressoes)} impr.
                    {ctr != null && ` · CTR ${ctr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                  </dd>
                </div>
              )}
              <div className="flex gap-1 text-muted-foreground">
                <dt className="sr-only">Criada em</dt>
                <dd className="tabular">criada {formatarNoFuso(f.created_at, tz, { day: "2-digit", month: "2-digit", year: "2-digit" })}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Ações da família */}
        {podeOperar && (
          <div className="flex flex-wrap gap-2 lg:max-w-[22rem] lg:justify-end">
            {!arquivada && semVariantes && (
              <AcaoBotao
                size="sm"
                variant="tech"
                acao={() => gerarLoteFamilia(f.id)}
                aoConcluir={(r) => typeof r.jobId === "string" && handlers.aoJob?.(r.jobId, `Lote — ${f.name}`)}
              >
                <Wand2 /> Gerar lote da hipótese
              </AcaoBotao>
            )}
            {!arquivada && (
              <Button asChild size="sm" variant={semVariantes ? "secondary" : "tech"}>
                <Link href={`/ml/produtos/${f.product_id}?lote=1`}>
                  <Sparkles /> Gerar lote
                </Link>
              </Button>
            )}
            {operar && (
              <Button size="sm" variant="secondary" onClick={() => setAdicionando(true)}>
                <Plus /> Adicionar variante
              </Button>
            )}
            <AcaoBotao size="sm" variant="secondary" acao={() => duplicarHipotese(f.id)}>
              <Copy /> Duplicar hipótese
            </AcaoBotao>
            {operar && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!aprovaveis.length}
                title={aprovaveis.length ? undefined : "Selecione variantes em revisão"}
                onClick={() => handlers.aoAprovar?.(aprovaveis)}
              >
                <CheckCheck /> Aprovar selecionados{aprovaveis.length ? ` (${aprovaveis.length})` : ""}
              </Button>
            )}
            {operar && (
              <Button
                size="sm"
                variant="secondary"
                disabled={agendando || f.totais.aprovadas === 0}
                title={f.totais.aprovadas ? "Cada aprovada sem Pin entra na próxima janela livre (cooldown e anti-repetição)" : "Nenhuma variante aprovada"}
                onClick={agendar}
              >
                {agendando ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
                Agendar aprovados
              </Button>
            )}
            {!arquivada && (
              <AcaoBotao
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                confirmar={`Arquivar a família “${f.name}”? As variantes não publicadas são arquivadas e os Pins ainda não publicados são cancelados.`}
                acao={() => arquivarFamilia(f.id)}
              >
                <Archive /> Arquivar família
              </AcaoBotao>
            )}
          </div>
        )}
      </div>

      {/* Variantes */}
      <div className="border-t border-border/70 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
            <Layers className="size-3.5" aria-hidden />
            {statusFiltro ? `${variantes.length} variante(s) neste status` : `${variantes.length} variante(s)`}
          </p>
          {podeOperar && variantes.length > 1 && (
            <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Checkbox checked={todos} onChange={(e) => aoSelecionarVarios(ids, e.target.checked)} aria-label={`Selecionar todas as variantes de ${f.name}`} />
              Selecionar todas
            </label>
          )}
        </div>
        {variantes.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {variantes.map((c) => (
              <CardCriativo
                key={c.id}
                c={c}
                tz={tz}
                selecionado={selecionados.has(c.id)}
                aoSelecionar={aoSelecionar}
                podeOperar={podeOperar}
                handlers={handlers}
                ocultarProduto
                erroAprovacao={errosAprovacao.get(c.id) ?? null}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-caption text-muted-foreground">
            {semVariantes
              ? arquivada
                ? "Família arquivada sem variantes."
                : "Nenhuma variante ainda — gere o lote da hipótese ou adicione uma variante."
              : "Nenhuma variante com os filtros atuais."}
          </p>
        )}
      </div>

      {adicionando && (
        <AdicionarVarianteDialog familia={{ id: f.id, name: f.name }} presets={presets} openai={openai} aberto aoMudar={(v) => !v && setAdicionando(false)} />
      )}
    </section>
  );
}
