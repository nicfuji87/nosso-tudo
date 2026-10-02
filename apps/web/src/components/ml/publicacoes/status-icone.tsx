import { Ban, CalendarClock, CircleDashed, Hourglass, Loader2, PauseCircle, Send, XCircle, type LucideIcon } from "lucide-react";
import { PIN_STATUS_LABEL } from "@/lib/ml/estados";
import { cn } from "@/lib/utils";

const ICONES: Record<string, { icon: LucideIcon; cls: string; spin?: boolean }> = {
  draft: { icon: CircleDashed, cls: "text-muted-foreground" },
  pending_approval: { icon: Hourglass, cls: "text-warning" },
  scheduled: { icon: CalendarClock, cls: "text-tech" },
  publishing: { icon: Loader2, cls: "text-tech", spin: true },
  published: { icon: Send, cls: "text-success" },
  failed: { icon: XCircle, cls: "text-destructive" },
  blocked: { icon: Ban, cls: "text-destructive" },
  canceled: { icon: Ban, cls: "text-muted-foreground" },
  paused: { icon: PauseCircle, cls: "text-muted-foreground" },
};

export function rotuloStatusPin(status: string): string {
  return (PIN_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

/** Ícone de status para espaços apertados (calendário); o texto vai em sr-only + title. */
export function StatusIcone({ status, className }: { status: string; className?: string }) {
  const d = ICONES[status] ?? { icon: CircleDashed, cls: "text-muted-foreground" };
  const rotulo = rotuloStatusPin(status);
  return (
    <span title={rotulo} className="inline-flex">
      <d.icon className={cn("size-3.5 shrink-0", d.cls, d.spin && "animate-spin", className)} aria-hidden />
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}
