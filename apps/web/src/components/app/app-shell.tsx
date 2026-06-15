"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Inbox, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav-config";
import { UserMenu } from "./user-menu";
import { NovaTransacaoDialog } from "@/components/transacoes/nova-transacao-dialog";
import type { Plan, Profile, Workspace } from "@/lib/types/db";

function active(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function AppShell({
  profile,
  workspace,
  plan,
  isAdmin = false,
  inboxCount = 0,
  children,
}: {
  profile: Profile;
  workspace: Workspace;
  plan: Plan;
  isAdmin?: boolean;
  inboxCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inboxActive = pathname.startsWith("/app/inbox");
  const niaActive = pathname.startsWith("/app/nia");
  const niaLiberado = isAdmin || plan.slug === "pro";

  return (
    <div className="min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/app" aria-label="Início">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = active(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-[18px]", isActive && "text-accent")} />
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/app/inbox"
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors",
              inboxActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-3">
              <Inbox className={cn("size-[18px]", inboxActive && "text-accent")} />
              Pré-conferência
            </span>
            {inboxCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-overline font-semibold text-accent-foreground">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </Link>

          {niaLiberado && (
            <Link
              href="/app/nia"
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors",
                niaActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Sparkles className={cn("size-[18px]", niaActive && "text-accent")} />
              Nia
            </Link>
          )}
        </nav>
        <div className="px-3 pb-3">
          <NovaTransacaoDialog
            trigger={
              <Button className="w-full">
                <Plus className="size-4" /> Nova transação
              </Button>
            }
          />
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-medium">{workspace.nome}</p>
              <p className="text-caption text-muted-foreground">Plano {plan.nome}</p>
            </div>
            <UserMenu profile={profile} plan={plan} isAdmin={isAdmin} />
          </div>
        </div>
      </aside>

      {/* Topbar (mobile) */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/app" aria-label="Início">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          {niaLiberado && (
            <Link
              href="/app/nia"
              aria-label="Nia"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Sparkles className="size-5" />
            </Link>
          )}
          <Link
            href="/app/inbox"
            aria-label="Pré-conferência"
            className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Inbox className="size-5" />
            {inboxCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Link>
          <UserMenu profile={profile} plan={plan} isAdmin={isAdmin} />
        </div>
      </header>

      {/* Conteúdo */}
      <main className="lg:pl-64">
        <div className="container max-w-5xl px-4 py-6 pb-28 lg:px-8 lg:py-10">{children}</div>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <BottomLink key={item.href} item={item} isActive={active(pathname, item)} />
          ))}
          <div className="flex justify-center">
            <NovaTransacaoDialog
              trigger={
                <button
                  aria-label="Nova transação"
                  className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated transition-transform active:scale-95"
                >
                  <Plus className="size-6" />
                </button>
              }
            />
          </div>
          {NAV_ITEMS.slice(2).map((item) => (
            <BottomLink key={item.href} item={item} isActive={active(pathname, item)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function BottomLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-col items-center gap-1 py-3 text-overline font-medium transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <item.icon className={cn("size-5", isActive && "text-accent")} />
      {item.label}
    </Link>
  );
}
