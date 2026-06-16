import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { canUseFeature, getWorkspaceContext, isPlatformAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NiaChat } from "@/components/nia/nia-chat";
import { NIA_FEATURE } from "@/lib/nia/schemas";

export const metadata: Metadata = { title: "Nia · Nosso Tudo" };

export default async function NiaPage() {
  const ctx = await getWorkspaceContext();
  const admin = await isPlatformAdmin();
  const liberado = admin || ctx.plan.slug === "pro" || canUseFeature(ctx.plan, NIA_FEATURE);

  if (!liberado) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="size-7" />
        </span>
        <h1 className="text-h3 font-semibold">A Nia é exclusiva do Pro</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Sua assistente que entende a rotina da família, lança gastos e organiza tudo pelo chat —
          sempre pedindo sua confirmação.
        </p>
        <Button asChild className="mt-6">
          <Link href="/app/perfil">Conhecer o Pro</Link>
        </Button>
      </div>
    );
  }

  const primeiroNome = ctx.profile.nome.split(" ")[0] ?? ctx.profile.nome;
  return <NiaChat nome={primeiroNome} workspaceId={ctx.workspace.id} />;
}
