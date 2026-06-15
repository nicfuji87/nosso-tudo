"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { salvarPlano } from "@/app/app/admin/actions";
import type { Plan } from "@/lib/types/db";

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function PlanoForm({ plano }: { plano: Plan }) {
  const router = useRouter();
  const [mensal, setMensal] = useState(plano.preco_mensal_brl?.toString() ?? "");
  const [anual, setAnual] = useState(plano.preco_anual_brl?.toString() ?? "");
  const [exibeAnuncios, setExibeAnuncios] = useState(plano.exibe_anuncios);
  const [ativo, setAtivo] = useState(plano.ativo);
  const [saving, startSave] = useTransition();

  function salvar() {
    startSave(async () => {
      const res = await salvarPlano({
        id: plano.id,
        preco_mensal_brl: toNum(mensal),
        preco_anual_brl: toNum(anual),
        exibe_anuncios: exibeAnuncios,
        ativo,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success(`Plano ${plano.nome} salvo`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {plano.nome}
          <Badge variant={plano.slug === "pro" ? "accent" : "default"} size="sm">
            {plano.slug}
          </Badge>
        </CardTitle>
        <CardDescription>{plano.descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`m-${plano.id}`}>Mensal (R$)</Label>
            <Input
              id={`m-${plano.id}`}
              inputMode="decimal"
              value={mensal}
              onChange={(e) => setMensal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`a-${plano.id}`}>Anual (R$)</Label>
            <Input
              id={`a-${plano.id}`}
              inputMode="decimal"
              value={anual}
              onChange={(e) => setAnual(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
          <span className="text-body-sm">Exibe anúncios</span>
          <Switch checked={exibeAnuncios} onCheckedChange={setExibeAnuncios} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
          <span className="text-body-sm">Plano ativo</span>
          <Switch checked={ativo} onCheckedChange={setAtivo} />
        </label>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
