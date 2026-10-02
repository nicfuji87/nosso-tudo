"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, CheckCheck, Columns2, Layers, Loader2, Palette, Send, Sparkles, X, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Checkbox } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { aprovarComFalhas, type FalhaAprovacao } from "./aprovar-lote";
import { CardCriativo, MiniaturaCriativo, Qualidade } from "./card-criativo";
import { CriarPinDialog } from "./criar-pin-dialog";
import { DetalhesV2 } from "./detalhes-v2";
import { DialogosV2, FalhasAprovacaoDialog, type DialogoV2 } from "./dialogos-v2";
import { EditorCriativo } from "./editor-criativo";
import { VistaFamilias } from "./familias";
import type { Vista } from "./filtros";
import { MenuCriativo, type HandlersCriativo } from "./menu-criativo";
import { RejeitarDialog } from "./rejeitar-dialog";
import { RevisaoRapida } from "./revisao-rapida";
import { COLUNAS_KANBAN, labelModo, podeRejeitar, type BoardOpcao, type CriativoView, type FamiliaView, type PresetOpcao } from "./rotulos";

export function PainelCriativos({
  criativos,
  extras,
  boards,
  tz,
  vista,
  podeOperar,
  criativoInicial,
  acaoInicial = null,
  filtrado,
  familias = [],
  presets = [],
  openai = false,
  semFamilia = 0,
}: {
  criativos: CriativoView[];
  /** Criativos fora do filtro atual, carregados só para abrir o editor (?criativo=). */
  extras: CriativoView[];
  boards: BoardOpcao[];
  tz: string;
  vista: Vista;
  podeOperar: boolean;
  criativoInicial: string | null;
  /** ?acao= junto com ?criativo= abre um diálogo V2 em vez do editor (links da Central). */
  acaoInicial?: DialogoV2 | null;
  filtrado: boolean;
  /** Vista "Por família" (V2). */
  familias?: FamiliaView[];
  presets?: PresetOpcao[];
  openai?: boolean;
  /** Criativos legados (sem família), que não aparecem na vista por família. */
  semFamilia?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(acaoInicial ? null : criativoInicial);
  const [rejeitando, setRejeitando] = useState<string[] | null>(null);
  const [pinPara, setPinPara] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ id: string; d: DialogoV2 } | null>(
    acaoInicial && criativoInicial ? { id: criativoInicial, d: acaoInicial } : null,
  );
  const [jobs, setJobs] = useState<{ id: string; rotulo: string }[]>([]);
  const [errosAprovacao, setErrosAprovacao] = useState<Map<string, string>>(new Map());
  const [resultado, setResultado] = useState<{ feitos: number; falhas: FalhaAprovacao[] } | null>(null);
  const [aprovando, iniciarAprovacao] = useTransition();

  // Navegação para outro ?criativo= (ex.: link da Central) abre o editor — ou o diálogo pedido em ?acao=.
  useEffect(() => {
    if (acaoInicial && criativoInicial) {
      setEditando(null);
      setDialogo({ id: criativoInicial, d: acaoInicial });
    } else setEditando(criativoInicial);
  }, [criativoInicial, acaoInicial]);

  const porId = useMemo(() => new Map([...extras, ...criativos].map((c) => [c.id, c])), [criativos, extras]);
  const emEdicao = editando ? porId.get(editando) ?? null : null;
  const criativoPin = pinPara ? porId.get(pinPara) ?? null : null;
  const criativoDialogo = dialogo ? porId.get(dialogo.id) ?? null : null;

  // Só a URL muda (link compartilhável) — sem nova renderização no servidor.
  const sincronizarUrl = useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(window.location.search);
      if (id) p.set("criativo", id);
      else p.delete("criativo");
      p.delete("acao");
      const s = p.toString();
      window.history.replaceState(null, "", s ? `${pathname}?${s}` : pathname);
    },
    [pathname],
  );

  const acompanharJob = useCallback((id: string, rotulo: string) => {
    setJobs((j) => [{ id, rotulo }, ...j.filter((x) => x.id !== id)].slice(0, 5));
  }, []);

  /** Aprova mostrando o motivo de cada falha (V2: fidelidade não liberada / pacote não pronto). */
  function aprovar(ids: string[]) {
    if (!ids.length) return;
    iniciarAprovacao(async () => {
      const r = await aprovarComFalhas(ids);
      setErrosAprovacao((m) => {
        const n = new Map(m);
        r.feitos.forEach((id) => n.delete(id));
        r.falhas.forEach((f) => n.set(f.id, f.mensagem));
        return n;
      });
      setSelecionados((s) => {
        const n = new Set(s);
        r.feitos.forEach((id) => n.delete(id));
        return n;
      });
      if (!r.falhas.length) toast.success(r.feitos.length === 1 ? "Aprovado." : `${r.feitos.length} aprovados.`);
      else if (ids.length === 1) toast.error(r.falhas[0]!.mensagem);
      else {
        if (r.feitos.length) toast.success(`${r.feitos.length} aprovado(s).`);
        setResultado({ feitos: r.feitos.length, falhas: r.falhas });
      }
      router.refresh();
    });
  }

  const handlers: HandlersCriativo = {
    aoEditar: (id) => {
      setEditando(id);
      sincronizarUrl(id);
    },
    aoRejeitar: (ids) => setRejeitando(ids),
    aoCriarPin: (id) => setPinPara(id),
    aoFiltrarProduto: (productId) => {
      const p = new URLSearchParams(sp.toString());
      p.set("produto", productId);
      p.delete("criativo");
      p.delete("acao");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    aoDialogoV2: (id, d) => setDialogo({ id, d }),
    aoJob: acompanharJob,
    aoAprovar: aprovar,
    openai,
  };

  function selecionar(id: string, v: boolean) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function selecionarVarios(ids: string[], v: boolean) {
    setSelecionados((s) => {
      const n = new Set(s);
      ids.forEach((i) => (v ? n.add(i) : n.delete(i)));
      return n;
    });
  }

  // Seleção só vale para o que está na tela.
  const selecao = criativos.filter((c) => selecionados.has(c.id));
  const aprovaveis = selecao.filter((c) => c.status === "review").map((c) => c.id);
  const rejeitaveis = selecao.filter((c) => podeRejeitar(c.status)).map((c) => c.id);

  const conteudo = (() => {
    if (vista === "familias") {
      const avisoLegado =
        semFamilia > 0 ? (
          <p className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-secondary/40 px-4 py-2.5 text-body-sm text-muted-foreground">
            <Layers className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="font-medium text-foreground tabular">{semFamilia}</span> criativo(s) sem família (fluxo anterior) não aparecem nesta vista.
            </span>
            <Link href={`${pathname}?vista=kanban`} className="font-medium text-tech hover:underline">
              Ver todas as variantes
            </Link>
          </p>
        ) : null;
      if (!familias.length) {
        return (
          <div className="space-y-4">
            <EmptyState
              icon={Layers}
              title={filtrado ? "Nenhuma família com esses filtros" : "Nenhuma família de criativos ainda"}
              description={
                filtrado
                  ? "Ajuste ou limpe os filtros para ver mais."
                  : "Cada produto aprovado vira uma família: escolha as imagens de referência do anúncio e use “Gerar lote” para criar as variantes."
              }
              action={
                filtrado ? (
                  <Button asChild variant="secondary">
                    <Link href={pathname}>Limpar filtros</Link>
                  </Button>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild variant="tech">
                      <Link href="/ml/produtos">
                        <Sparkles /> Escolher produto e gerar lote
                      </Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href={`${pathname}?vista=kanban`}>Ver todas as variantes</Link>
                    </Button>
                  </div>
                )
              }
            />
            {avisoLegado}
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <VistaFamilias
            familias={familias}
            criativos={criativos}
            tz={tz}
            podeOperar={podeOperar}
            handlers={handlers}
            selecionados={selecionados}
            aoSelecionar={selecionar}
            aoSelecionarVarios={selecionarVarios}
            presets={presets}
            openai={openai}
            errosAprovacao={errosAprovacao}
            statusFiltro={sp.get("status")}
          />
          {avisoLegado}
        </div>
      );
    }

    if (!criativos.length) {
      return (
        <EmptyState
          icon={Palette}
          title={vista === "revisao" ? "Nada aguardando revisão" : filtrado ? "Nenhum criativo com esses filtros" : "Nenhum criativo ainda"}
          description={
            vista === "revisao"
              ? "Quando novos criativos ficarem prontos eles aparecem aqui para aprovação rápida."
              : filtrado
                ? "Ajuste ou limpe os filtros para ver mais."
                : "Aprove produtos e adicione o link de afiliado — os criativos são gerados a partir deles."
          }
          action={
            vista === "revisao" ? (
              <Button asChild variant="secondary">
                <Link href="/ml/criativos">Ver todos os criativos</Link>
              </Button>
            ) : filtrado ? (
              <Button asChild variant="secondary">
                <Link href={`${pathname}?vista=${vista}`}>Limpar filtros</Link>
              </Button>
            ) : (
              <Button asChild variant="tech">
                <Link href="/ml/produtos">Ir para Produtos</Link>
              </Button>
            )
          }
        />
      );
    }

    if (vista === "revisao") {
      return <RevisaoRapida criativos={criativos} podeOperar={podeOperar} aoEditar={handlers.aoEditar} />;
    }

    if (vista === "lista") {
      const todos = criativos.map((c) => c.id);
      const todosMarcados = todos.length > 0 && todos.every((i) => selecionados.has(i));
      return (
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-card">
          <table className="w-full min-w-[760px] text-body-sm">
            <thead className="border-b border-border text-left text-caption text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  {podeOperar && (
                    <Checkbox checked={todosMarcados} onChange={(e) => selecionarVarios(todos, e.target.checked)} aria-label="Selecionar todos" />
                  )}
                </th>
                <th className="px-2 py-2.5 font-medium">Criativo</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="px-2 py-2.5 font-medium">Ângulo · modo</th>
                <th className="px-2 py-2.5 font-medium">Board</th>
                <th className="px-2 py-2.5 font-medium">Qualidade</th>
                <th className="px-2 py-2.5 font-medium">Data</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {criativos.map((c) => (
                <tr key={c.id} className={cn("align-middle", selecionados.has(c.id) && "bg-tech/5")}>
                  <td className="px-3 py-2">
                    {podeOperar && (
                      <Checkbox checked={selecionados.has(c.id)} onChange={(e) => selecionar(c.id, e.target.checked)} aria-label="Selecionar criativo" />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => handlers.aoEditar(c.id)} className="flex items-center gap-3 text-left">
                      <MiniaturaCriativo c={c} className="aspect-[2/3] w-12 shrink-0 rounded-md" />
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium">{c.headline || c.title || "Sem headline"}</span>
                        <span className="line-clamp-1 text-caption text-muted-foreground">{c.produto?.title}</span>
                        {errosAprovacao.get(c.id) && <span className="line-clamp-2 text-caption text-warning">{errosAprovacao.get(c.id)}</span>}
                      </span>
                    </button>
                    {c.family_id && <DetalhesV2 c={c} mostrarTitulo={false} className="mt-1.5 sm:pl-[60px]" />}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge tipo="creative" status={c.status} />
                  </td>
                  <td className="px-2 py-2 text-caption text-muted-foreground">
                    {c.angulo ? labelAngulo(c.angulo) : "—"} · {labelModo(c.image_mode)}
                  </td>
                  <td className="px-2 py-2 text-caption">{c.board ?? <span className="text-muted-foreground">Automático</span>}</td>
                  <td className="px-2 py-2">
                    <Qualidade score={c.quality_score} notas={c.quality_notes} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-caption text-muted-foreground tabular">{formatarNoFuso(c.created_at, tz)}</td>
                  <td className="px-2 py-2">
                    <MenuCriativo c={c} podeOperar={podeOperar} handlers={handlers} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Kanban
    const porStatus = new Map<string, CriativoView[]>();
    for (const c of criativos) porStatus.set(c.status, [...(porStatus.get(c.status) ?? []), c]);
    const filtroStatus = sp.get("status");
    const colunas: { status: string; label: string }[] = !filtroStatus
      ? [...COLUNAS_KANBAN]
      : filtroStatus === "archived"
        ? [{ status: "archived", label: "Arquivado" }]
        : COLUNAS_KANBAN.filter((k) => k.status === filtroStatus);
    return (
      <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-4">
          {colunas.map((col) => {
            const itens = porStatus.get(col.status) ?? [];
            const ids = itens.map((c) => c.id);
            const todos = ids.length > 0 && ids.every((i) => selecionados.has(i));
            return (
              <section key={col.status} className="flex w-64 shrink-0 flex-col rounded-xl bg-secondary/40 p-2.5 sm:w-72" aria-label={col.label}>
                <header className="mb-2.5 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge tipo="creative" status={col.status} className="px-2 py-0.5" />
                    <span className="text-caption font-medium text-muted-foreground tabular">{itens.length}</span>
                  </div>
                  {podeOperar && itens.length > 0 && (
                    <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <Checkbox checked={todos} onChange={(e) => selecionarVarios(ids, e.target.checked)} aria-label={`Selecionar todos em ${col.label}`} />
                      todos
                    </label>
                  )}
                </header>
                <div className="flex flex-col gap-3">
                  {itens.length ? (
                    itens.map((c) => (
                      <CardCriativo
                        key={c.id}
                        c={c}
                        tz={tz}
                        selecionado={selecionados.has(c.id)}
                        aoSelecionar={selecionar}
                        podeOperar={podeOperar}
                        handlers={handlers}
                        erroAprovacao={errosAprovacao.get(c.id) ?? null}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-caption text-muted-foreground">Vazio</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  })();

  return (
    <>
      {conteudo}

      {/* Barra de lote */}
      {podeOperar && selecao.length > 0 && vista !== "revisao" && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-60">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-2.5 shadow-elevated">
            <span className="text-body-sm font-medium tabular">{selecao.length} selecionado(s)</span>
            <Button
              size="sm"
              variant="tech"
              disabled={!aprovaveis.length || aprovando}
              title={aprovaveis.length ? undefined : "Só criativos em revisão podem ser aprovados"}
              onClick={() => aprovar(aprovaveis)}
            >
              {aprovando ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Aprovar{aprovaveis.length !== selecao.length ? ` (${aprovaveis.length})` : ""}
            </Button>
            <Button size="sm" variant="outline" disabled={!rejeitaveis.length} onClick={() => setRejeitando(rejeitaveis)}>
              <XCircle /> Rejeitar{rejeitaveis.length !== selecao.length ? ` (${rejeitaveis.length})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
              <X /> Limpar
            </Button>
          </div>
        </div>
      )}

      {emEdicao && (
        <EditorCriativo
          key={emEdicao.id}
          criativo={emEdicao}
          boards={boards}
          tz={tz}
          podeOperar={podeOperar}
          erroAprovacao={errosAprovacao.get(emEdicao.id) ?? null}
          aoJob={acompanharJob}
          aberto
          aoMudar={(v) => {
            if (!v) {
              setEditando(null);
              sincronizarUrl(null);
            }
          }}
          acoes={
            podeOperar ? (
              <>
                {emEdicao.status === "review" && (
                  <Button size="sm" variant="tech" disabled={aprovando} onClick={() => aprovar([emEdicao.id])}>
                    {aprovando ? <Loader2 className="animate-spin" /> : <CheckCheck />} Aprovar
                  </Button>
                )}
                {emEdicao.status === "approved" && (
                  <Button size="sm" variant="tech" onClick={() => setPinPara(emEdicao.id)}>
                    <Send /> Criar Pin
                  </Button>
                )}
                {emEdicao.family_id && (
                  <Button size="sm" variant="secondary" onClick={() => setDialogo({ id: emEdicao.id, d: "lado" })}>
                    <Columns2 /> Lado a lado
                  </Button>
                )}
                {emEdicao.family_id && emEdicao.asset && !["published", "archived"].includes(emEdicao.status) && (
                  <Button size="sm" variant="secondary" onClick={() => setDialogo({ id: emEdicao.id, d: "fidelidade" })}>
                    <BadgeCheck /> Revisar fidelidade
                  </Button>
                )}
                {podeRejeitar(emEdicao.status) && (
                  <Button size="sm" variant="outline" onClick={() => setRejeitando([emEdicao.id])}>
                    <XCircle /> Rejeitar
                  </Button>
                )}
                {emEdicao.status === "published" && <Badge variant="success">Já publicado</Badge>}
              </>
            ) : emEdicao.family_id ? (
              <Button size="sm" variant="secondary" onClick={() => setDialogo({ id: emEdicao.id, d: "lado" })}>
                <Columns2 /> Lado a lado
              </Button>
            ) : null
          }
        />
      )}

      <RejeitarDialog
        ids={rejeitando ?? []}
        aberto={rejeitando !== null}
        aoMudar={(v) => !v && setRejeitando(null)}
        aoConcluir={() => setSelecionados(new Set())}
      />

      {criativoDialogo && dialogo && (
        <DialogosV2
          key={`${criativoDialogo.id}-${dialogo.d}`}
          c={criativoDialogo}
          dialogo={dialogo.d}
          aoFechar={() => {
            setDialogo(null);
            if (new URLSearchParams(window.location.search).get("acao")) sincronizarUrl(editando);
          }}
          aoTrocar={(d) => setDialogo({ id: criativoDialogo.id, d })}
          podeOperar={podeOperar}
        />
      )}

      {resultado && (
        <FalhasAprovacaoDialog
          feitos={resultado.feitos}
          falhas={resultado.falhas}
          titulos={new Map([...porId].map(([id, c]) => [id, c.headline || c.title || c.produto?.title || "Criativo"]))}
          aberto
          aoMudar={(v) => !v && setResultado(null)}
          aoAbrir={handlers.aoEditar}
        />
      )}

      {/* Jobs disparados nesta tela (regerar copy, checar fidelidade, lote…) */}
      {jobs.length > 0 && (
        <div className="fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-2" aria-label="Tarefas em andamento">
          {jobs.map((j) => (
            <div key={j.id} className="flex items-start gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 shadow-elevated">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-tech" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-caption font-medium">{j.rotulo}</p>
                <JobStatus jobId={j.id} compacto />
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Dispensar"
                onClick={() => setJobs((l) => l.filter((x) => x.id !== j.id))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {criativoPin && <CriarPinDialog key={criativoPin.id} criativo={criativoPin} boards={boards} aberto aoMudar={(v) => !v && setPinPara(null)} />}
    </>
  );
}
