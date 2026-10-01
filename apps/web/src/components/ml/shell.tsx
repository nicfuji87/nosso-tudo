"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Menu, PauseCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ML_NAV, type MlNavItem } from "./nav";

function ativo(pathname: string, item: MlNavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ pendencias, onNavigate }: { pendencias: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Navegação da área ML">
      {ML_NAV.map((item) => {
        const isAtivo = ativo(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isAtivo ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-body-sm font-medium transition-colors",
              isAtivo ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-3">
              <item.icon className={cn("size-[18px]", isAtivo && "text-tech")} />
              {item.label}
            </span>
            {item.badge === "pendencias" && pendencias > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-tech px-1.5 text-overline font-semibold text-tech-foreground">
                {pendencias > 99 ? "99+" : pendencias}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function MlShell({
  children,
  pendencias,
  pausado,
  email,
  papel,
}: {
  children: React.ReactNode;
  pendencias: number;
  pausado: boolean;
  email: string | null;
  papel: string;
}) {
  const [aberto, setAberto] = useState(false);
  const marca = (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-tech text-caption font-bold text-tech-foreground">ML</span>
      <div className="leading-tight">
        <p className="text-body-sm font-semibold">Afiliados</p>
        <p className="text-caption text-muted-foreground">Mercado Livre × Pinterest</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/ml" aria-label="Dashboard ML">
            {marca}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks pendencias={pendencias} />
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-caption text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao Nosso Tudo
          </Link>
          <p className="truncate px-3 text-caption text-muted-foreground" title={email ?? undefined}>
            {email} · <span className="capitalize">{papel}</span>
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/ml">{marca}</Link>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <Menu className="size-5" />
          {pendencias > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-tech" aria-hidden />}
        </button>
      </header>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="left" className="w-72 lg:hidden">
          <SheetHeader>
            <SheetTitle>Afiliados ML</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <NavLinks pendencias={pendencias} onNavigate={() => setAberto(false)} />
          </div>
          <Link href="/app" className="mt-6 flex items-center gap-2 px-3 text-caption text-muted-foreground">
            <ArrowLeft className="size-3.5" /> Voltar ao Nosso Tudo
          </Link>
        </SheetContent>
      </Sheet>

      <main className="lg:pl-60">
        {pausado && (
          <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-caption font-medium text-warning">
            <PauseCircle className="size-4" /> Automações pausadas — nada roda sozinho até você retomar no Dashboard.
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
