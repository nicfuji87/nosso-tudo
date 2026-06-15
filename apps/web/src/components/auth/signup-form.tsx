"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { cadastroSchema, type CadastroInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";
import { traduzErroAuth } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { GoogleButton } from "./oauth-buttons";
import { FieldError } from "./field-error";

export function SignupForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CadastroInput>({ resolver: zodResolver(cadastroSchema) });

  async function onSubmit(values: CadastroInput) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.senha,
      options: {
        data: { nome: values.nome },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      toast.error("Não foi possível criar a conta", { description: traduzErroAuth(error.message) });
      return;
    }
    // Sessão imediata (confirmação desativada) → vai pro onboarding
    if (data.session) {
      window.location.href = "/onboarding";
      return;
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <MailCheck className="size-6" />
        </div>
        <h2 className="mt-4 text-h4 font-semibold">Confirme seu e-mail</h2>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Enviamos um link de confirmação para <strong className="text-foreground">{sentTo}</strong>.
          Clique nele para ativar sua conta e começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <GoogleButton next="/onboarding" />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-caption text-muted-foreground">ou com e-mail</span>
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" autoComplete="name" placeholder="Seu nome" {...register("nome")} />
          <FieldError message={errors.nome?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="voce@email.com" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="new-password" placeholder="••••••••" {...register("senha")} />
            <FieldError message={errors.senha?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmarSenha">Confirmar</Label>
            <Input id="confirmarSenha" type="password" autoComplete="new-password" placeholder="••••••••" {...register("confirmarSenha")} />
            <FieldError message={errors.confirmarSenha?.message} />
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-body-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[rgb(var(--accent))]"
            {...register("aceiteTermos")}
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" className="font-medium text-foreground underline-offset-2 hover:underline">
              Termos
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="font-medium text-foreground underline-offset-2 hover:underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        <FieldError message={errors.aceiteTermos?.message} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Criar conta grátis
        </Button>
      </form>
    </div>
  );
}
