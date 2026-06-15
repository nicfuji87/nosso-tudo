import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Nova senha" };

export default function RedefinirSenhaPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">Defina uma nova senha</h1>
        <p className="text-body-sm text-muted-foreground">
          Escolha uma senha forte — ao menos 10 caracteres.
        </p>
      </div>
      <ResetForm />
    </div>
  );
}
