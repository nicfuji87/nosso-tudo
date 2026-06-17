"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plug, CreditCard, Megaphone, Sparkles, BellRing, Repeat, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: AdminTab[] = [
  { href: "/app/admin/integracoes", label: "Integrações", icon: Plug },
  { href: "/app/admin/nia", label: "Nia", icon: Sparkles },
  { href: "/app/admin/alertas", label: "Alertas", icon: BellRing },
  { href: "/app/admin/recorrencias", label: "Recorrências", icon: Repeat },
  { href: "/app/admin/planos", label: "Planos", icon: CreditCard },
  { href: "/app/admin/anuncios", label: "Anúncios", icon: Megaphone },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-full bg-secondary p-1 text-muted-foreground">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-body-sm font-medium transition-all",
              isActive
                ? "bg-card text-foreground shadow-card"
                : "hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
