"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { redefinirSenhaSchema, type RedefinirSenhaInput } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/client";
import { traduzErroAuth } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { FieldError } from "./field-error";

export function ResetForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RedefinirSenhaInput>({ resolver: zodResolver(redefinirSenhaSchema) });

  async function onSubmit(values: RedefinirSenhaInput) {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.senha });
    if (error) {
      toast.error("Não foi possível redefinir", { description: traduzErroAuth(error.message) });
      return;
    }
    toast.success("Senha atualizada!", { description: "Você já está conectado." });
    router.refresh();
    router.push("/app");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" type="password" autoComplete="new-password" placeholder="••••••••" {...register("senha")} />
        <FieldError message={errors.senha?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmarSenha">Confirmar nova senha</Label>
        <Input id="confirmarSenha" type="password" autoComplete="new-password" placeholder="••••••••" {...register("confirmarSenha")} />
        <FieldError message={errors.confirmarSenha?.message} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        Redefinir senha
      </Button>
    </form>
  );
}
