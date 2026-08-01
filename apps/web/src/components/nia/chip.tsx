"use client";

import { cn } from "@/lib/utils";

/** Pílula de resposta rápida usada no compositor e nos cards da Nia. */
export function Chip({
  ativo,
  onClick,
  disabled,
  children,
}: {
  ativo?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-caption transition-colors disabled:opacity-50",
        ativo
          ? "border-accent bg-accent/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

/** Fileira de chips que rola na horizontal, para caber no celular. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
