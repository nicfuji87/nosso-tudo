import * as React from "react";
import { cn } from "@/lib/utils";

/** Campos que faltam nos primitivos do projeto, no mesmo visual do Input. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[90px] w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-body-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("size-4 shrink-0 cursor-pointer rounded border-input accent-[rgb(var(--tech))]", className)}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 rounded-xl border border-input bg-card px-3 text-body-sm shadow-sm focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Campo({ label, dica, children, className }: { label: string; dica?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-body-sm font-medium">{label}</span>
      {children}
      {dica && <span className="block text-caption text-muted-foreground">{dica}</span>}
    </label>
  );
}

export function Secao({ titulo, descricao, acoes, children, className }: { titulo: string; descricao?: React.ReactNode; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border/70 bg-card p-5 shadow-card", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h4 font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-body-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}
