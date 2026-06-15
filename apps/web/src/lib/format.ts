import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Formata valor em Reais. formatBRL(1234.5) => "R$ 1.234,50" */
export function formatBRL(value: number | null | undefined, opts?: { sign?: boolean }): string {
  const v = value ?? 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Math.abs(v));
  if (opts?.sign && v !== 0) return `${v > 0 ? "+" : "−"}${formatted}`;
  return v < 0 ? `−${formatted}` : formatted;
}

/** Número sem símbolo de moeda. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function toDate(input: Date | string): Date {
  return typeof input === "string" ? new Date(input) : input;
}

/** Data curta: "14 jun 2026". */
export function formatDate(input: Date | string, pattern = "dd MMM yyyy"): string {
  return format(toDate(input), pattern, { locale: ptBR });
}

/** Rótulo humano: "Hoje", "Ontem" ou data curta. */
export function formatDayLabel(input: Date | string): string {
  const d = toDate(input);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd 'de' MMMM", { locale: ptBR });
}

export function formatRelative(input: Date | string): string {
  return formatDistanceToNow(toDate(input), { locale: ptBR, addSuffix: true });
}

/** Iniciais para avatar fallback: "Nicolas Fujimoto" => "NF". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Saudação conforme a hora local. */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
