"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { esqueciSenhaSchema, type EsqueciSenhaInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./field-error";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EsqueciSenhaInput>({ resolver: zodResolver(esqueciSenhaSchema) });

  async function onSubmit(values: EsqueciSenhaInput) {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    // Sempre mostra sucesso (não revelar se o e-mail existe)
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <MailCheck className="size-6" />
        </div>
        <h2 className="mt-4 text-h4 font-semibold">Verifique seu e-mail</h2>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="voce@email.com" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        Enviar link de redefinição
      </Button>
    </form>
  );
}
