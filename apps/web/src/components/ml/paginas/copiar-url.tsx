"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** URL da página com "Copiar" (para colar no campo Link do Pin) e "Abrir". */
export function CopiarUrl({ url, className, destaque }: { url: string; className?: string; destaque?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <code className={cn("min-w-0 flex-1 truncate rounded-lg bg-secondary/60 px-2.5 py-1.5 font-mono text-caption", destaque && "text-body-sm")} title={url}>
        {url}
      </code>
      <Button
        type="button"
        size="sm"
        variant={destaque ? "default" : "secondary"}
        onClick={() =>
          void navigator.clipboard.writeText(url).then(
            () => toast.success("URL copiada — cole no campo Link do Pin."),
            () => toast.error("Não foi possível copiar."),
          )
        }
      >
        <Copy /> Copiar
      </Button>
      <Button type="button" size="sm" variant="ghost" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir a página">
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}
