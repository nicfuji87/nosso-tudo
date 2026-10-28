"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Radar, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/app/viagens", label: "Carteira", icon: Wallet, exato: true },
  { href: "/app/viagens/radar", label: "Radar de rotas", icon: Radar, exato: false },
  { href: "/app/viagens/promocoes", label: "Promoções", icon: BellRing, exato: false },
];

export function ViagensAbas() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border" aria-label="Seções de viagens">
      {ABAS.map((a) => {
        const ativo = a.exato ? pathname === a.href : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-body-sm font-medium transition-colors",
              ativo
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <a.icon className="size-4" />
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}
