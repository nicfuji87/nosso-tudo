"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Ban, BellOff, Check, CircleAlert, KeyRound, PackageX, Settings2, Wrench, type LucideIcon } from "lucide-react";
import { resolverPendencia } from "@/app/ml/(painel)/pendencias/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Badge } from "@/components/ui/badge";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";

export interface Excecao {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  entity_type: string | null;
  entity_id: string | null;
  job_id: string | null;
  status: string;
  created_at: string;
}

const TIPOS: Record<string, { label: string; icon: LucideIcon; tom: "destructive" | "warning" | "default" }> = {
  publish_blocked: { label: "Publicação bloqueada", icon: Ban, tom: "destructive" },
  integration_auth: { label: "Reconectar integração", icon: KeyRound, tom: "destructive" },
  config_incomplete: { label: "Configuração incompleta", icon: Settings2, tom: "warning" },
  job_failed: { label: "Falha em tarefa automática", icon: AlertTriangle, tom: "warning" },
  product_changed: { label: "Produto mudou", icon: PackageX, tom: "warning" },
  other: { label: "Outro", icon: CircleAlert, tom: "default" },
};

/** Link para a entidade da pendência (ou para onde resolver). */
export function linkExcecao(e: Pick<Excecao, "type" | "entity_type" | "entity_id" | "job_id">): { href: string; rotulo: string } | null {
  if (e.type === "integration_auth") return { href: "/ml/integracoes", rotulo: "Abrir Integrações" };
  if (e.type === "config_incomplete" && !e.entity_id) return { href: "/ml/configuracoes", rotulo: "Abrir Configurações" };
  const id = e.entity_id ? encodeURIComponent(e.entity_id) : null;
  switch (e.entity_type) {
    case "pin":
      return id ? { href: `/ml/publicacoes?pin=${id}`, rotulo: "Ver publicação" } : null;
    case "product":
      return id ? { href: `/ml/produtos/${id}`, rotulo: "Ver produto" } : null;
    case "creative":
      return id ? { href: `/ml/criativos?criativo=${id}`, rotulo: "Ver criativo" } : null;
    case "job":
      return id ? { href: `/ml/logs?job=${id}`, rotulo: "Ver no log" } : null;
  }
  if (e.job_id) return { href: `/ml/logs?job=${encodeURIComponent(e.job_id)}`, rotulo: "Ver no log" };
  return null;
}

/** Exceções (`ml_tasks`): o que a automação não conseguiu resolver sozinha. */
export function Excecoes({ itens, tz, podeOperar }: { itens: Excecao[]; tz: string; podeOperar: boolean }) {
  return (
    <ul className="space-y-2.5">
      {itens.map((e) => {
        const t = TIPOS[e.type] ?? TIPOS.other!;
        const link = linkExcecao(e);
        return (
          <li key={e.id} className="rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-start gap-3">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  t.tom === "destructive" ? "bg-destructive/15 text-destructive" : t.tom === "warning" ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground",
                )}
              >
                <t.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={t.tom} size="sm">
                    {t.label}
                  </Badge>
                  {e.status === "snoozed" && (
                    <Badge variant="outline" size="sm">
                      <BellOff className="size-3" aria-hidden /> Adiada (venceu)
                    </Badge>
                  )}
                  <span className="text-caption text-muted-foreground tabular">{formatarNoFuso(e.created_at, tz)}</span>
                </div>
                <p className="mt-1 text-body-sm font-medium">{e.title}</p>
                {e.detail && <p className="mt-0.5 whitespace-pre-line break-words text-caption text-muted-foreground">{e.detail}</p>}
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:pl-11">
              {link && (
                <Link
                  href={link.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-tech px-4 text-body-sm font-medium text-tech-foreground shadow-card hover:shadow-card-hover"
                >
                  <Wrench className="size-4" aria-hidden /> {link.rotulo} <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              )}
              {podeOperar && (
                <>
                  <AcaoBotao size="sm" variant="secondary" acao={() => resolverPendencia(e.id, "done")}>
                    <Check /> Resolver
                  </AcaoBotao>
                  <AcaoBotao size="sm" variant="ghost" acao={() => resolverPendencia(e.id, "snoozed", 24)}>
                    <BellOff /> Adiar 24h
                  </AcaoBotao>
                  <AcaoBotao size="sm" variant="ghost" acao={() => resolverPendencia(e.id, "dismissed")} confirmar="Descartar esta pendência? Ela não volta, a menos que o problema ocorra de novo.">
                    <Ban /> Descartar
                  </AcaoBotao>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
