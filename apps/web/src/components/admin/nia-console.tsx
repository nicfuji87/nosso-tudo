"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { salvarNiaConfig } from "@/app/app/admin/actions";
import type { NiaConfigCompleta, OpcoesAgente } from "@/lib/nia/admin";

const inputCls =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-body-sm outline-none focus-visible:shadow-focus";

export function NiaConsoleForm({
  initial,
  opcoes,
  canEdit,
}: {
  initial: NiaConfigCompleta | null;
  opcoes: OpcoesAgente;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [provedor, setProvedor] = useState(initial?.provedor ?? opcoes.provedores[0] ?? "anthropic");
  const [modelo, setModelo] = useState(initial?.modelo ?? "");
  const [temperature, setTemperature] = useState(String(initial?.temperature ?? 0.3));
  const [maxTokens, setMaxTokens] = useState(String(initial?.maxTokens ?? 1024));
  const [saving, startSave] = useTransition();

  function salvar() {
    startSave(async () => {
      const res = await salvarNiaConfig({
        systemPrompt,
        provedor,
        modelo,
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success("Nova versão da config salva");
      router.refresh();
    });
  }

  const modelos = opcoes.modelosPorProvedor[provedor] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Agente
          {initial && <Badge size="sm">versão {initial.versao}</Badge>}
        </CardTitle>
        <CardDescription>
          Prompt, provedor e modelo da Nia. Cada salvamento cria uma nova versão (a anterior fica
          inativa, permitindo rollback). Trocar de LLM aqui é dado, não deploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit && (
          <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-caption text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            Só um admin de plataforma altera a config do agente.
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="nia-prompt">System prompt</Label>
          <textarea
            id="nia-prompt"
            rows={7}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={!canEdit}
            className={cn(inputCls, "h-auto resize-y py-2 leading-relaxed")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nia-provedor">Provedor</Label>
            <select
              id="nia-provedor"
              value={provedor}
              onChange={(e) => setProvedor(e.target.value)}
              disabled={!canEdit}
              className={inputCls}
            >
              {opcoes.provedores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nia-modelo">Modelo</Label>
            <input
              id="nia-modelo"
              list="nia-modelos"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              disabled={!canEdit}
              placeholder="claude-haiku-4-5"
              className={inputCls}
            />
            <datalist id="nia-modelos">
              {modelos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nia-temp">Temperature</Label>
            <Input
              id="nia-temp"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nia-maxtokens">Max tokens</Label>
            <Input
              id="nia-maxtokens"
              type="number"
              min="1"
              max="8192"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <Button onClick={salvar} disabled={!canEdit || saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Salvar nova versão
        </Button>
      </CardContent>
    </Card>
  );
}
