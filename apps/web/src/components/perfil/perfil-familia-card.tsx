"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { salvarPerfilFamilia, type PerfilFamilia } from "@/app/app/perfil/actions";

const CAMPOS: { chave: keyof PerfilFamilia; label: string; placeholder: string }[] = [
  {
    chave: "sobre",
    label: "Sobre a família",
    placeholder: "Quem é a família — pessoas, papéis, idades dos filhos…",
  },
  {
    chave: "financas",
    label: "Finanças",
    placeholder: "Quem sustenta a casa, como vocês dividem as contas…",
  },
  {
    chave: "objetivos",
    label: "Objetivos e valores",
    placeholder: "As metas grandes e o que importa pra vocês…",
  },
  {
    chave: "observacoes",
    label: "Observações importantes",
    placeholder: "Contexto que a Nia deve sempre ter em mente (saúde, situação especial…)",
  },
];

const textareaCls = cn(
  "flex min-h-[72px] w-full rounded-md border border-input bg-card px-4 py-2.5 text-body-sm text-foreground transition-shadow duration-fast ease-smooth",
  "placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:border-foreground/40 focus-visible:shadow-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

/** Edita o perfil estável da família — o "básico" que a Nia sempre recebe. */
export function PerfilFamiliaCard({ perfilInicial }: { perfilInicial: PerfilFamilia }) {
  const [perfil, setPerfil] = useState<PerfilFamilia>(perfilInicial);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  function editar(chave: keyof PerfilFamilia, v: string) {
    setPerfil((p) => ({ ...p, [chave]: v }));
    setSujo(true);
  }

  async function salvar() {
    setSalvando(true);
    const r = await salvarPerfilFamilia(perfil);
    setSalvando(false);
    if (r.error) {
      toast.error("Erro ao salvar", { description: r.error });
      return;
    }
    setSujo(false);
    toast.success("Perfil atualizado");
  }

  return (
    <div className="space-y-4">
      {CAMPOS.map(({ chave, label, placeholder }) => (
        <div key={chave} className="space-y-1.5">
          <Label htmlFor={`perfil-${chave}`}>{label}</Label>
          <textarea
            id={`perfil-${chave}`}
            value={perfil[chave]}
            onChange={(e) => editar(chave, e.target.value)}
            placeholder={placeholder}
            maxLength={800}
            rows={2}
            className={textareaCls}
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button type="button" onClick={salvar} disabled={!sujo || salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
