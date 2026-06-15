"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Shield, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { Plan, Profile } from "@/lib/types/db";

export function UserMenu({
  profile,
  plan,
  isAdmin = false,
}: {
  profile: Profile;
  plan: Plan;
  isAdmin?: boolean;
}) {
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/entrar");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:shadow-focus">
        <Avatar className="size-9 border border-border">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.nome} />}
          <AvatarFallback>{initials(profile.nome)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <p className="truncate text-body-sm font-medium text-foreground">{profile.nome}</p>
          <p className="truncate text-caption font-normal text-muted-foreground">{profile.email}</p>
        </DropdownMenuLabel>
        <div className="px-3 py-1.5">
          <Badge variant={plan.slug === "pro" ? "accent" : "default"} size="sm">
            Plano {plan.nome}
          </Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/perfil">
            <UserIcon /> Perfil e conta
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/app/admin/integracoes">
              <Shield /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={sair}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
