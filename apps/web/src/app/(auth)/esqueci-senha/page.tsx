import Link from "next/link";
import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function EsqueciSenhaPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">Recuperar acesso</h1>
        <p className="text-body-sm text-muted-foreground">
          Enviaremos um link para você criar uma nova senha.
        </p>
      </div>
      <ForgotForm />
      <p className="text-center text-body-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-foreground underline-offset-2 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
