"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, CheckCircle2, ImageOff, Keyboard, Loader2, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { aprovarCriativos } from "@/app/ml/(painel)/criativos/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { cn } from "@/lib/utils";
import { RejeitarDialog } from "./rejeitar-dialog";
import { labelModo, type CriativoView } from "./rotulos";

/**
 * Revisão rápida (spec §17: 5–15 s por criativo): imagens grandes lado a lado,
 * Aprovar/Rejeitar por item e "Aprovar todos visíveis". Atalhos no card focado:
 * A aprova, R rejeita, E edita.
 */
export function RevisaoRapida({
  criativos,
  podeOperar,
  aoEditar,
  colunas = 3,
}: {
  criativos: CriativoView[];
  podeOperar: boolean;
  aoEditar?: (id: string) => void;
  colunas?: 2 | 3 | 4;
}) {
  const router = useRouter();
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [emAndamento, setEmAndamento] = useState<Set<string>>(new Set());
  const [rejeitando, setRejeitando] = useState<string[] | null>(null);
  const [pendenteLote, iniciarLote] = useTransition();

  const visiveis = criativos.filter((c) => !ocultos.has(c.id));

  async function aprovar(ids: string[]) {
    if (!podeOperar || !ids.length) return;
    setEmAndamento((s) => new Set([...s, ...ids]));
    const r = await aprovarCriativos(ids);
    setEmAndamento((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (r.falhas.length) toast.warning(r.mensagem);
    else toast.success(r.mensagem);
    // Esconde já os aprovados com sucesso (o refresh confirma).
    if (r.feitos === ids.length) setOcultos((s) => new Set([...s, ...ids]));
    router.refresh();
  }

  const gridCols = colunas === 2 ? "sm:grid-cols-2" : colunas === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-4">
      {visiveis.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Keyboard className="size-3.5" aria-hidden />
            Foque um card (Tab) e use <kbd className="rounded border border-border px-1">A</kbd> aprovar ·{" "}
            <kbd className="rounded border border-border px-1">R</kbd> rejeitar
            {aoEditar && (
              <>
                {" "}
                · <kbd className="rounded border border-border px-1">E</kbd> editar
              </>
            )}
          </p>
          <Button
            size="sm"
            variant="tech"
            disabled={!podeOperar || pendenteLote}
            onClick={() => iniciarLote(() => aprovar(visiveis.map((c) => c.id)))}
          >
            {pendenteLote ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            Aprovar todos visíveis ({visiveis.length})
          </Button>
        </div>
      )}

      <ul className={cn("grid grid-cols-1 gap-4", gridCols)}>
        {visiveis.map((c) => {
          const ocupado = emAndamento.has(c.id);
          return (
            <li
              key={c.id}
              tabIndex={0}
              aria-label={`Criativo: ${c.headline ?? c.title ?? "sem título"}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === "a" && !ocupado) {
                  e.preventDefault();
                  void aprovar([c.id]);
                } else if (k === "r" && podeOperar) {
                  e.preventDefault();
                  setRejeitando([c.id]);
                } else if (k === "e" && aoEditar) {
                  e.preventDefault();
                  aoEditar(c.id);
                }
              }}
              className={cn(
                "flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-card outline-none transition-shadow focus-visible:shadow-focus",
                ocupado && "opacity-60",
              )}
            >
              <div className="relative aspect-[2/3] w-full bg-secondary/50">
                {c.asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.asset.public_url}
                    alt={c.alt_text ?? c.headline ?? "Imagem do criativo"}
                    loading="lazy"
                    className="absolute inset-0 size-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-caption text-muted-foreground">
                    <ImageOff className="size-6" aria-hidden /> Sem imagem
                  </div>
                )}
                {c.quality_score != null && (
                  <Badge
                    variant={c.quality_score >= 80 ? "success" : c.quality_score >= 60 ? "tech" : "warning"}
                    className="absolute left-2 top-2 tabular shadow-card"
                    title={c.quality_notes.length ? c.quality_notes.join(" · ") : "Qualidade"}
                  >
                    Qualidade {Math.round(c.quality_score)}
                  </Badge>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="truncate text-caption text-muted-foreground" title={c.produto?.title}>
                  {c.produto?.title ?? "Produto"}
                </p>
                {c.headline && <p className="text-body font-semibold leading-snug">{c.headline}</p>}
                {c.title && <p className="line-clamp-2 text-body-sm">{c.title}</p>}
                {c.description && <p className="line-clamp-3 text-caption text-muted-foreground">{c.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {c.angulo && <Badge variant="outline">{labelAngulo(c.angulo)}</Badge>}
                  <Badge variant="default">{labelModo(c.image_mode)}</Badge>
                  {c.board && <Badge variant="default">{c.board}</Badge>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="tech" className="flex-1" disabled={!podeOperar || ocupado} onClick={() => void aprovar([c.id])}>
                    {ocupado ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={!podeOperar || ocupado} onClick={() => setRejeitando([c.id])}>
                    <XCircle /> Rejeitar
                  </Button>
                  {aoEditar && (
                    <Button size="icon-sm" variant="ghost" onClick={() => aoEditar(c.id)} aria-label="Editar criativo" title="Editar">
                      <Pencil />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <RejeitarDialog
        ids={rejeitando ?? []}
        aberto={rejeitando !== null}
        aoMudar={(v) => !v && setRejeitando(null)}
        aoConcluir={() => rejeitando && setOcultos((s) => new Set([...s, ...rejeitando]))}
      />
    </div>
  );
}
