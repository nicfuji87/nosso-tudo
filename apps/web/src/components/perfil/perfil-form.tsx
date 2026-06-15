"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { FieldError } from "@/components/auth/field-error";
import { atualizarPerfil } from "@/app/app/perfil/actions";
import type { Profile } from "@/lib/types/db";

interface FormValues {
  nome: string;
  telefone: string;
}

export function PerfilForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues: { nome: profile.nome, telefone: profile.telefone ?? "" },
  });

  async function onSubmit(values: FormValues) {
    const res = await atualizarPerfil(values);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    toast.success("Perfil atualizado");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" {...register("nome", { required: true })} />
        <FieldError message={errors.nome?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" value={profile.email ?? ""} disabled />
        <p className="text-caption text-muted-foreground">
          O e-mail é gerenciado pela sua conta de acesso.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
        <Input id="telefone" placeholder="+55 11 90000-0000" {...register("telefone")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
