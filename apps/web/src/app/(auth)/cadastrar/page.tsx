import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastrarPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">Crie sua conta</h1>
        <p className="text-body-sm text-muted-foreground">
          Grátis para começar. 14 dias de Pro inclusos.
        </p>
      </div>
      <SignupForm />
      <p className="text-center text-body-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-foreground underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
