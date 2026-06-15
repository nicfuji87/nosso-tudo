import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-9 text-base rounded-[10px]",
  md: "size-12 text-xl rounded-[14px]",
  lg: "size-14 text-2xl rounded-[16px]",
} as const;

interface CategoryIconProps {
  /** Emoji ou caractere do ícone (schema: categorias.icone). */
  icone?: string | null;
  /** Cor da categoria em hex (schema: categorias.cor). */
  cor?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Ícone de categoria: fundo pastel derivado da cor da categoria + glifo.
 * A cor vem de dado do usuário (arbitrária), por isso usa style inline —
 * não é um token de design hardcoded.
 */
export function CategoryIcon({ icone, cor, size = "md", className }: CategoryIconProps) {
  const tint = cor ?? "#8FA993";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center leading-none", SIZES[size], className)}
      style={{ backgroundColor: `${tint}22`, color: tint }}
      aria-hidden
    >
      <span className="grayscale-0">{icone ?? "📦"}</span>
    </span>
  );
}
