import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "dark";
  className?: string;
}

/** Card de número grande (design-system §6.7). */
export function StatTile({ label, value, hint, tone = "default", className }: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-5 shadow-card",
        tone === "dark"
          ? "bg-brand-graphite text-brand-offwhite"
          : "border border-border/70 bg-card text-card-foreground",
        className,
      )}
    >
      <p
        className={cn(
          "text-overline uppercase tracking-wide",
          tone === "dark" ? "text-brand-offwhite/60" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="tabular mt-2 text-h2 font-semibold tracking-tight">{value}</p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-caption",
            tone === "dark" ? "text-brand-offwhite/60" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
