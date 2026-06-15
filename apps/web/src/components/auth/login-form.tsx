"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";
import { traduzErroAuth } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { GoogleButton } from "./oauth-buttons";
import { FieldError } from "./field-error";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("redirect") || "/app";
  const [magicLoading, setMagicLoading] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.senha,
    });
    if (error) {
      toast.error("Não foi possível entrar", { description: traduzErroAuth(error.message) });
      return;
    }
    router.refresh();
    router.push(next);
  }

  async function magicLink() {
    const email = getValues("email");
    if (!email) {
      toast.error("Informe seu e-mail", { description: "Digite o e-mail para receber o link." });
      return;
    }
    setMagicLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setMagicLoading(false);
    if (error) {
      toast.error("Não foi possível enviar", { description: traduzErroAuth(error.message) });
      return;
    }
    toast.success("Link enviado!", { description: "Confira seu e-mail para entrar." });
  }

  return (
    <div className="space-y-5">
      <GoogleButton next={next} />
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="voce@email.com" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="senha">Senha</Label>
            <Link href="/esqueci-senha" className="text-caption text-muted-foreground hover:text-foreground">
              Esqueci a senha
            </Link>
          </div>
          <Input id="senha" type="password" autoComplete="current-password" placeholder="••••••••" {...register("senha")} />
          <FieldError message={errors.senha?.message} />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>
      <Button type="button" variant="ghost" className="w-full" onClick={magicLink} disabled={magicLoading}>
        {magicLoading && <Loader2 className="size-4 animate-spin" />}
        Entrar com link mágico
      </Button>
    </div>
  );
}

function Divider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 text-caption text-muted-foreground">ou com e-mail</span>
      </div>
    </div>
  );
}
