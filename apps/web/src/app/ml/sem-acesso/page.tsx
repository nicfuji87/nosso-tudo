import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sem acesso" };

export default function SemAcesso() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-xl border border-border/70 bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-tech/15 text-tech">
          <Lock className="size-5" />
        </div>
        <h1 className="text-h4 font-semibold">Área de afiliados restrita</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Sua conta não tem acesso à operação de afiliados. Peça a um administrador para adicionar você em
          Configurações › Segurança.
        </p>
        <Button asChild className="mt-6">
          <Link href="/app">Voltar ao Nosso Tudo</Link>
        </Button>
      </div>
    </div>
  );
}
