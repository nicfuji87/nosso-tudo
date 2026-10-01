"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, Palette, Send, X, XCircle } from "lucide-react";
import Link from "next/link";
import { aprovarCriativos } from "@/app/ml/(painel)/criativos/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Checkbox } from "@/components/ml/campos";
import { StatusBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { CardCriativo, MiniaturaCriativo, Qualidade } from "./card-criativo";
import { CriarPinDialog } from "./criar-pin-dialog";
import { EditorCriativo } from "./editor-criativo";
import type { Vista } from "./filtros";
import { MenuCriativo, type HandlersCriativo } from "./menu-criativo";
import { RejeitarDialog } from "./rejeitar-dialog";
import { RevisaoRapida } from "./revisao-rapida";
import { COLUNAS_KANBAN, labelModo, podeRejeitar, type BoardOpcao, type CriativoView } from "./rotulos";

export function PainelCriativos({
  criativos,
  extras,
  boards,
  tz,
  vista,
  podeOperar,
  criativoInicial,
  filtrado,
}: {
  criativos: CriativoView[];
  /** Criativos fora do filtro atual, carregados só para abrir o editor (?criativo=). */
  extras: CriativoView[];
  boards: BoardOpcao[];
  tz: string;
  vista: Vista;
  podeOperar: boolean;
  criativoInicial: string | null;
  filtrado: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(criativoInicial);
  const [rejeitando, setRejeitando] = useState<string[] | null>(null);
  const [pinPara, setPinPara] = useState<string | null>(null);

  // Navegação para outro ?criativo= (ex.: link da Central) abre o editor certo.
  useEffect(() => setEditando(criativoInicial), [criativoInicial]);

  const porId = useMemo(() => new Map([...extras, ...criativos].map((c) => [c.id, c])), [criativos, extras]);
  const emEdicao = editando ? porId.get(editando) ?? null : null;
  const criativoPin = pinPara ? porId.get(pinPara) ?? null : null;

  // Só a URL muda (link compartilhável) — sem nova renderização no servidor.
  const sincronizarUrl = useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(window.location.search);
      if (id) p.set("criativo", id);
      else p.delete("criativo");
      const s = p.toString();
      window.history.replaceState(null, "", s ? `${pathname}?${s}` : pathname);
    },
    [pathname],
  );

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
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
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
                <Link href={pathname}>Limpar filtros</Link>
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
                      </span>
                    </button>
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
            <AcaoBotao
              size="sm"
              variant="tech"
              disabled={!aprovaveis.length}
              title={aprovaveis.length ? undefined : "Só criativos em revisão podem ser aprovados"}
              acao={() => aprovarCriativos(aprovaveis)}
              aoConcluir={() => setSelecionados(new Set())}
            >
              <CheckCheck /> Aprovar{aprovaveis.length !== selecao.length ? ` (${aprovaveis.length})` : ""}
            </AcaoBotao>
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
                  <AcaoBotao size="sm" variant="tech" acao={() => aprovarCriativos([emEdicao.id])}>
                    <CheckCheck /> Aprovar
                  </AcaoBotao>
                )}
                {emEdicao.status === "approved" && (
                  <Button size="sm" variant="tech" onClick={() => setPinPara(emEdicao.id)}>
                    <Send /> Criar Pin
                  </Button>
                )}
                {podeRejeitar(emEdicao.status) && (
                  <Button size="sm" variant="outline" onClick={() => setRejeitando([emEdicao.id])}>
                    <XCircle /> Rejeitar
                  </Button>
                )}
                {emEdicao.status === "published" && <Badge variant="success">Já publicado</Badge>}
              </>
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

      {criativoPin && <CriarPinDialog key={criativoPin.id} criativo={criativoPin} boards={boards} aberto aoMudar={(v) => !v && setPinPara(null)} />}
    </>
  );
}
