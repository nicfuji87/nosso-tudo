"use client";

import { useEffect } from "react";

/** Conta visita/clique sem cookie e sem dado pessoal (só incrementa um contador da página). */
function enviar(slug: string, tipo: "visita" | "clique") {
  const url = `/achados/${slug}/evento`;
  try {
    if (navigator.sendBeacon?.(url, tipo)) return;
  } catch {
    /* segue para o fetch */
  }
  void fetch(url, { method: "POST", body: tipo, keepalive: true }).catch(() => undefined);
}

export function ContarVisita({ slug }: { slug: string }) {
  useEffect(() => {
    enviar(slug, "visita");
  }, [slug]);
  return null;
}

/** Link comum (sem redirecionamento): a pessoa clica e vai direto ao Mercado Livre. */
export function BotaoOferta({ slug, href, children }: { slug: string; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={() => enviar(slug, "clique")}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </a>
  );
}
