"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ROTULO_VALIDACAO, type ItemValidacao } from "./tipos";

function tom(i: ItemValidacao) {
  if (i.ok) return { cls: "bg-success/10 text-success", Icon: CheckCircle2, estado: "ok" };
  if (i.bloqueia) return { cls: "bg-destructive/10 text-destructive", Icon: XCircle, estado: "bloqueia" };
  return { cls: "bg-warning/15 text-warning", Icon: AlertTriangle, estado: "atenção" };
}

/** Checagens pré-publicação em chips compactos (texto + ícone; detalhe no tooltip). */
export function ValidacaoBadges({ itens, soProblemas, className }: { itens: ItemValidacao[]; soProblemas?: boolean; className?: string }) {
  const lista = soProblemas ? itens.filter((i) => !i.ok) : itens;
  if (!lista.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Checagens pré-publicação">
      {lista.map((i) => {
        const t = tom(i);
        return (
          <li key={i.chave}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className={cn("inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-overline font-medium", t.cls)}
                >
                  <t.Icon className="size-3" aria-hidden />
                  {ROTULO_VALIDACAO[i.chave] ?? i.chave}
                  <span className="sr-only">
                    ({t.estado}): {i.detalhe}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{i.detalhe || "Sem detalhe"}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** Lista completa (detalhe visível) — usada no detalhe do Pin e no resultado do "Revalidar agora". */
export function ValidacaoLista({ itens }: { itens: ItemValidacao[] }) {
  if (!itens.length) return <p className="text-body-sm text-muted-foreground">Ainda não validado.</p>;
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
      {itens.map((i) => {
        const t = tom(i);
        return (
          <li key={i.chave} className="flex items-start gap-2.5 px-3 py-2">
            <t.Icon className={cn("mt-0.5 size-4 shrink-0", t.cls.split(" ").find((c) => c.startsWith("text-")))} aria-hidden />
            <div className="min-w-0">
              <p className="text-body-sm font-medium">
                {ROTULO_VALIDACAO[i.chave] ?? i.chave}
                <span className="sr-only"> — {t.estado}</span>
              </p>
              <p className="text-caption text-muted-foreground">{i.detalhe}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
