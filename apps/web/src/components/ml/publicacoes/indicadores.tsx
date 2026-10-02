"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Hourglass,
  Layers,
  Link2,
  Repeat,
  ShieldCheck,
  Shapes,
  Timer,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TIPO_VISUAL_LABEL } from "@/lib/ml/familias/plano";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { REDIRECT_STATUS, type PinView } from "./tipos";

const TONS = {
  tech: "bg-tech/10 text-tech",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-secondary text-muted-foreground",
} as const;
type Tom = keyof typeof TONS;

const fmtHoras = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`);

export function rotuloTipoVisual(t: string | null | undefined): string | null {
  if (!t) return null;
  return (TIPO_VISUAL_LABEL as Record<string, string>)[t] ?? t;
}

/** Chip compacto (texto + ícone; dica no tooltip). */
function Chip({ icon: Icon, tom, children, dica, href }: { icon: LucideIcon; tom: Tom; children: ReactNode; dica?: string; href?: string }) {
  const cls = cn("inline-flex max-w-[16rem] items-center gap-1 rounded-full px-2 py-0.5 text-overline font-medium", TONS[tom]);
  const corpo = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
      {dica && <span className="sr-only">: {dica}</span>}
    </>
  );
  const el = href ? (
    <Link href={href} className={cn(cls, "hover:underline")}>
      {corpo}
    </Link>
  ) : (
    <span tabIndex={dica ? 0 : undefined} className={cn(cls, "cursor-default")}>
      {corpo}
    </span>
  );
  if (!dica) return el;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{dica}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Dados derivados (reaproveitados pelo cartão e pelo detalhe)
// ---------------------------------------------------------------------------
export function infoRepeticao(pin: PinView): { texto: string; dica: string; tom: Tom } | null {
  const r = pin.repeticao;
  if (!r) return null;
  return {
    texto: `${r.ordem}º Pin do produto na semana`,
    dica: `${r.total - 1} outro(s) Pin(s) do mesmo produto agendado(s)/publicado(s) em ±7 dias deste.`,
    tom: r.total >= 3 ? "warning" : "muted",
  };
}

export function infoCooldown(pin: PinView, tz: string): { texto: string; dica: string; tom: Tom } | null {
  const c = pin.cooldown;
  if (!c) return null;
  if (c.regraHoras <= 0) return { texto: "Cooldown desligado", dica: "Sem cooldown entre variantes do mesmo produto (Configurações › Criativos V2).", tom: "muted" };
  if (c.faltamHoras <= 0)
    return {
      texto: "Cooldown: livre",
      dica: `Regra: ${c.regraHoras} h entre variantes do mesmo produto. O produto já pode receber outro Pin.`,
      tom: "success",
    };
  return {
    texto: `Cooldown: faltam ${fmtHoras(c.faltamHoras)}`,
    dica: `Regra: ${c.regraHoras} h entre variantes do mesmo produto. Próximo Pin do produto liberado em ${formatarNoFuso(c.liberaEm, tz, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}.`,
    tom: "warning",
  };
}

export function infoRedirect(pin: PinView, tz: string): { texto: string; dica: string; tom: Tom; icon: LucideIcon } {
  const l = pin.link;
  if (!l) {
    return pin.link_url
      ? { texto: "Destino não validado", dica: "O Pin não está associado a um link de afiliado cadastrado.", tom: "muted", icon: CircleDashed }
      : { texto: "Sem link", dica: "Sem link de afiliado.", tom: "warning", icon: AlertTriangle };
  }
  const s = REDIRECT_STATUS[l.redirect_status] ?? REDIRECT_STATUS.unchecked!;
  const icon = s.tom === "success" ? CheckCircle2 : s.tom === "destructive" ? XCircle : s.tom === "warning" ? AlertTriangle : CircleDashed;
  const partes = [s.dica];
  if (l.final_host) partes.push(`Host final: ${l.final_host}.`);
  if (l.last_checked_at) partes.push(`Verificado em ${formatarNoFuso(l.last_checked_at, tz, { dateStyle: "short", timeStyle: "short" })}.`);
  if (l.label) partes.push(`Etiqueta: ${l.label}.`);
  return { texto: s.label, dica: partes.join(" "), tom: s.tom, icon };
}

export function infoIa(pin: PinView): { texto: string; dica: string; tom: Tom } {
  if (!pin.ai_modified) return { texto: "Sem IA", dica: "A imagem não foi gerada nem modificada por IA.", tom: "muted" };
  if (pin.status !== "published")
    return { texto: "IA declarada", dica: "Conteúdo gerado/modificado por IA — será declarado ao publicar (flag interno).", tom: "tech" };
  return pin.ai_disclosure_sent
    ? { texto: "IA declarada · enviado ao Pinterest", dica: "A declaração de IA foi aceita pela API do Pinterest.", tom: "tech" }
    : {
        texto: "IA declarada · flag interno",
        dica: "A API do Pinterest não aceitou a declaração explícita; o flag fica registrado internamente (spec §9.3).",
        tom: "warning",
      };
}

// ---------------------------------------------------------------------------
// Faixa de chips V2 para o cartão do Pin
// ---------------------------------------------------------------------------
export function IndicadoresPin({ pin, tz, className }: { pin: PinView; tz: string; className?: string }) {
  const tipo = rotuloTipoVisual(pin.creative?.visual_type);
  const rep = infoRepeticao(pin);
  const cd = infoCooldown(pin, tz);
  const rd = infoRedirect(pin, tz);
  const ia = infoIa(pin);
  const mostrarCooldown = cd && pin.status !== "published" && pin.status !== "canceled";
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Indicadores do Pin">
      {pin.familia && (
        <li>
          <Chip icon={Layers} tom="tech" href={`/ml/criativos?familia=${pin.familia.id}`} dica="Abrir a família de criativos">
            {pin.familia.name}
          </Chip>
        </li>
      )}
      {tipo && (
        <li>
          <Chip icon={Shapes} tom="muted">
            {tipo}
          </Chip>
        </li>
      )}
      {rep && (
        <li>
          <Chip icon={Repeat} tom={rep.tom} dica={rep.dica}>
            {rep.texto}
          </Chip>
        </li>
      )}
      {mostrarCooldown && (
        <li>
          <Chip icon={cd.tom === "warning" ? Hourglass : Timer} tom={cd.tom} dica={cd.dica}>
            {cd.texto}
          </Chip>
        </li>
      )}
      {pin.link_url && (
        <li>
          <Chip icon={rd.tom === "success" ? Link2 : rd.icon} tom={rd.tom} dica={rd.dica}>
            {rd.texto}
          </Chip>
        </li>
      )}
      <li>
        <Chip icon={pin.ai_modified ? Bot : ShieldCheck} tom={ia.tom} dica={ia.dica}>
          {ia.texto}
        </Chip>
      </li>
    </ul>
  );
}

/** Linha rótulo/valor do painel de detalhe. */
export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-body-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Linhas de detalhe (V2) — usadas no painel lateral. */
export function DetalhesV2({ pin, tz }: { pin: PinView; tz: string }) {
  const tipo = rotuloTipoVisual(pin.creative?.visual_type);
  const rep = infoRepeticao(pin);
  const cd = infoCooldown(pin, tz);
  const rd = infoRedirect(pin, tz);
  const ia = infoIa(pin);
  const texto = pin.creative?.has_text_overlay;
  return (
    <>
      <Linha rotulo="Família">
        {pin.familia ? (
          <Link href={`/ml/criativos?familia=${pin.familia.id}`} className="inline-flex items-center gap-1 text-tech hover:underline">
            <Layers className="size-3.5" aria-hidden />
            {pin.familia.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">Sem família (criativo V1)</span>
        )}
      </Linha>
      <Linha rotulo="Tipo visual">
        {tipo ?? <span className="text-muted-foreground">—</span>}
        {texto != null && <span className="text-muted-foreground"> · {texto ? "com texto na imagem" : "sem texto na imagem"}</span>}
      </Linha>
      <Linha rotulo="Repetição">
        {rep ? (
          <span className={cn(rep.tom === "warning" && "text-warning")}>
            {rep.texto} <span className="text-caption text-muted-foreground">({rep.dica})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Único Pin do produto em ±7 dias</span>
        )}
      </Linha>
      {cd && (
        <Linha rotulo="Cooldown">
          <span className={cn(cd.tom === "warning" && "text-warning", cd.tom === "success" && "text-success")}>{cd.texto}</span>
          <span className="block text-caption text-muted-foreground">{cd.dica}</span>
        </Linha>
      )}
      <Linha rotulo="Destino do link">
        <span className={cn("inline-flex items-center gap-1", TONS[rd.tom].split(" ").find((c) => c.startsWith("text-")))}>
          <rd.icon className="size-3.5 shrink-0" aria-hidden />
          {rd.texto}
        </span>
        {pin.link?.final_url && (
          <span className="block break-all text-caption text-muted-foreground" title={pin.link.final_url}>
            → {pin.link.final_url.length > 90 ? `${pin.link.final_url.slice(0, 89)}…` : pin.link.final_url}
          </span>
        )}
        <span className="block text-caption text-muted-foreground">
          {pin.link?.last_checked_at
            ? `Verificado em ${formatarNoFuso(pin.link.last_checked_at, tz, { dateStyle: "short", timeStyle: "short" })}`
            : "Ainda não verificado"}
          {pin.link?.label ? ` · Etiqueta ${pin.link.label}` : ""}
        </span>
      </Linha>
      <Linha rotulo="IA">
        <span className={cn("inline-flex items-center gap-1", ia.tom === "warning" && "text-warning")}>
          {pin.ai_modified ? <Bot className="size-3.5" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
          {ia.texto}
        </span>
        <span className="block text-caption text-muted-foreground">{ia.dica}</span>
      </Linha>
    </>
  );
}
