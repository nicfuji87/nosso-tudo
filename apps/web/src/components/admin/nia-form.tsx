"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { salvarNia } from "@/app/app/admin/actions";
import type { NiaPublic } from "@/lib/admin/settings";

export function NiaForm({
  initial,
  canEditSecrets,
}: {
  initial: NiaPublic;
  canEditSecrets: boolean;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [saving, startSave] = useTransition();

  function salvar() {
    startSave(async () => {
      const res = await salvarNia({ anthropicApiKey: apiKey || undefined });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success("Configuração da Nia salva");
      setApiKey("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" /> Nia (assistente de IA)
          <Badge size="sm">provedor: {initial.provider}</Badge>
        </CardTitle>
        <CardDescription>
          A chave de API do provedor de LLM que a Nia usa. O prompt, o modelo e a escolha do provedor
          ficam em <code className="font-mono">nia_config</code> (console da Nia, em breve).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEditSecrets && (
          <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-caption text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            Você pode visualizar, mas só um admin de plataforma altera esta chave.
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="nia-anthropic-key">Anthropic API key</Label>
          <Input
            id="nia-anthropic-key"
            type="password"
            autoComplete="off"
            placeholder={initial.anthropicKeyHint ? `Salvo: ${initial.anthropicKeyHint}` : "sk-ant-..."}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={!canEditSecrets}
          />
          <p className="text-caption text-muted-foreground">
            Deixe em branco para manter a atual. Guardada em <code className="font-mono">secrets</code>{" "}
            (deny-all; nunca enviada ao navegador).
          </p>
        </div>

        <Button onClick={salvar} disabled={!canEditSecrets || saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
