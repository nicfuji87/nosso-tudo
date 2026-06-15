import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZES = { sm: 24, md: 32, lg: 44 } as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  showWordmark?: boolean;
  inverted?: boolean;
  className?: string;
}

/**
 * Lockup oficial: símbolo modular + wordmark "Nosso Tudo".
 * O símbolo (PNG colorido) é usado em fundos claros e escuros; apenas a
 * cor do wordmark inverte. Nunca aplicar glow/gradiente (identidade-visual §12).
 */
export function Logo({ size = "md", showWordmark = true, inverted = false, className }: LogoProps) {
  const px = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/assets/logo/icone_nt.png"
        alt="Nosso Tudo"
        width={px}
        height={px}
        priority
        className="shrink-0"
      />
      {showWordmark && (
        <span
          className={cn(
            "font-semibold leading-none tracking-tight",
            size === "lg" ? "text-h3" : "text-h4",
            inverted ? "text-brand-offwhite" : "text-foreground",
          )}
        >
          Nosso Tudo
        </span>
      )}
    </span>
  );
}
