"use client";

import {
  BadgeCheck,
  Bot,
  CircleDashed,
  Hourglass,
  Loader2,
  MousePointerClick,
  Package,
  PackageCheck,
  PackageX,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Type,
  type LucideIcon,
  Archive,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODO_FIDELIDADE_LABEL, TIPO_VISUAL_LABEL } from "@/lib/ml/familias/plano";
import { cn } from "@/lib/utils";
import {
  FAMILIA_STATUS_LABEL,
  FIDELIDADE_LABEL,
  PACOTE_LABEL,
  ctrSaida,
  labelModo,
  type CriativoView,
  type ErroPacote,
  type MetricasView,
} from "./rotulos";

type Tom = "default" | "tech" | "success" | "warning" | "destructive" | "accent" | "outline";

export function labelTipoVisual(v: string): string {
  return (TIPO_VISUAL_LABEL as Record<string, string>)[v] ?? v;
}

export function labelModoFidelidade(v: string): string {
  return (MODO_FIDELIDADE_LABEL as Record<string, string>)[v] ?? v;
}

/** "Composição exata · IA" — modo de fidelidade + origem dos pixels. */
export function labelMetodo(c: Pick<CriativoView, "fidelity_mode" | "image_mode">): string {
  return `${labelModoFidelidade(c.fidelity_mode)} · ${labelModo(c.image_mode)}`;
}

const FIDELIDADE: Record<string, { tom: Tom; icon: LucideIcon }> = {
  not_required: { tom: "success", icon: ShieldCheck },
  pending: { tom: "warning", icon: Hourglass },
  ok: { tom: "tech", icon: ShieldCheck },
  warning: { tom: "warning", icon: ShieldAlert },
  failed: { tom: "destructive", icon: ShieldX },
  human_ok: { tom: "success", icon: BadgeCheck },
};

export function FidelidadeBadge({ status, score, className }: { status: string; score?: number | null; className?: string }) {
  const d = FIDELIDADE[status] ?? { tom: "default" as Tom, icon: CircleDashed };
  return (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)} title="Fidelidade do produto (§5.2)">
      <d.icon className="size-3.5" aria-hidden />
      {FIDELIDADE_LABEL[status] ?? status}
      {score != null && <span className="tabular opacity-80">· {Math.round(score)}</span>}
    </Badge>
  );
}

const PACOTE: Record<string, { tom: Tom; icon: LucideIcon }> = {
  missing: { tom: "default", icon: Package },
  incomplete: { tom: "warning", icon: Package },
  ready: { tom: "success", icon: PackageCheck },
  invalid: { tom: "destructive", icon: PackageX },
};

export function PacoteBadge({ status, erros, className }: { status: string; erros: ErroPacote[]; className?: string }) {
  const d = PACOTE[status] ?? { tom: "default" as Tom, icon: Package };
  const badge = (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)}>
      <d.icon className="size-3.5" aria-hidden />
      {PACOTE_LABEL[status] ?? status}
      {erros.length > 0 && <span className="tabular opacity-80">· {erros.length}</span>}
    </Badge>
  );
  if (!erros.length) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full focus-visible:outline-none focus-visible:shadow-focus" aria-label={`${PACOTE_LABEL[status] ?? status}: ${erros.map((e) => e.mensagem).join(" ")}`}>
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="space-y-0.5">
          {erros.map((e, i) => (
            <li key={`${e.campo}-${i}`}>• {e.mensagem}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

const FAMILIA: Record<string, { tom: Tom; icon: LucideIcon; spin?: boolean }> = {
  planning: { tom: "default", icon: CircleDashed },
  generating: { tom: "tech", icon: Loader2, spin: true },
  active: { tom: "success", icon: CheckCircle2 },
  archived: { tom: "outline", icon: Archive },
};

export function FamiliaStatusBadge({ status, className }: { status: string; className?: string }) {
  const d = FAMILIA[status] ?? { tom: "default" as Tom, icon: CircleDashed };
  return (
    <Badge variant={d.tom} className={cn("whitespace-nowrap", className)}>
      <d.icon className={cn("size-3.5", d.spin && "animate-spin")} aria-hidden />
      {FAMILIA_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function IaBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", className)} title="Imagem gerada ou modificada por IA (AI disclosure)">
      <Bot className="size-3.5" aria-hidden /> IA
    </Badge>
  );
}

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function formatarNumero(n: number): string {
  return compacto.format(n);
}

/** "12 cliques de saída · 3,4 mil impressões · CTR 0,35%". */
export function Metricas({ m, className }: { m: MetricasView | null; className?: string }) {
  if (!m) return null;
  const ctr = ctrSaida(m);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted-foreground tabular", className)}>
      <span className="inline-flex items-center gap-1" title="Cliques de saída (para o link de afiliado)">
        <MousePointerClick className="size-3.5" aria-hidden /> {formatarNumero(m.outbound)}
      </span>
      <span className="inline-flex items-center gap-1" title="Impressões">
        <Eye className="size-3.5" aria-hidden /> {formatarNumero(m.impressoes)}
      </span>
      {ctr != null && <span title="Cliques de saída ÷ impressões">CTR {ctr.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>}
    </p>
  );
}

/**
 * Bloco de informações da variante V2 (§11.5): tipo visual, cena, texto, fidelidade,
 * pacote, método, IA, título Pinterest, board e métricas.
 */
export function DetalhesV2({ c, mostrarTitulo = true, className }: { c: CriativoView; mostrarTitulo?: boolean; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap gap-1">
        <FidelidadeBadge status={c.fidelity_status} score={c.fidelity_score} className="px-2 py-0.5" />
        <PacoteBadge status={c.package_status} erros={c.package_errors} className="px-2 py-0.5" />
        {c.ai_modified && <IaBadge className="px-2 py-0.5" />}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
        <span className="font-medium text-foreground">{labelTipoVisual(c.visual_type)}</span>
        {c.cena && <span>· {c.cena}</span>}
        <span className="inline-flex items-center gap-0.5">
          · <Type className="size-3" aria-hidden /> {c.has_text_overlay ? "Com texto" : "Sem texto"}
        </span>
      </p>
      <p className="text-caption text-muted-foreground" title="Método de geração">
        {labelMetodo(c)}
        {c.board ? ` · ${c.board}` : ""}
      </p>
      {mostrarTitulo && c.title && (
        <p className="line-clamp-2 text-caption" title="Título do Pin">
          {c.title}
        </p>
      )}
      <Metricas m={c.metricas} />
    </div>
  );
}
