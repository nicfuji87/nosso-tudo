import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="text-h4 font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-body-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
