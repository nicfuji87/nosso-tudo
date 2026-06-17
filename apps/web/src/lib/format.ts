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
  if (typeof input !== "string") return input;
  // Data só-data (YYYY-MM-DD) deve ser lida como LOCAL, não UTC — senão no fuso
  // de Brasília (-3) ela "volta" um dia (vira ontem). Acrescenta a hora local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00`);
  return new Date(input);
}

/** Data curta: "17/06/2026". */
export function formatDate(input: Date | string, pattern = "dd/MM/yyyy"): string {
  return format(toDate(input), pattern, { locale: ptBR });
}

/** Rótulo humano: "Hoje", "Ontem" ou data curta (dd/MM/yyyy). */
export function formatDayLabel(input: Date | string): string {
  const d = toDate(input);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM/yyyy", { locale: ptBR });
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

/** Saudação conforme a hora em Brasília (o servidor roda em UTC). */
export function greeting(date = new Date()): string {
  const h =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false,
      }).format(date),
    ) % 24;
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
