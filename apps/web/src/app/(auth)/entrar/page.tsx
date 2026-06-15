import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="text-body-sm text-muted-foreground">
          Entre para continuar organizando as finanças da casa.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-center text-body-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="font-medium text-foreground underline-offset-2 hover:underline">
          Criar grátis
        </Link>
      </p>
    </div>
  );
}
