"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlugZap, ShieldAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { salvarAsaas, testarConexaoAsaas } from "@/app/app/admin/actions";
import type { AsaasPublic, AsaasEnvironment } from "@/lib/admin/settings";
import { CopyField } from "./copy-field";

export function AsaasForm({
  initial,
  canEditSecrets,
}: {
  initial: AsaasPublic;
  canEditSecrets: boolean;
}) {
  const router = useRouter();
  const [environment, setEnvironment] = useState<AsaasEnvironment>(initial.environment);
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const webhookEndpoint = `${supabaseUrl}/functions/v1/asaas-webhook`;

  function salvar() {
    startSave(async () => {
      const res = await salvarAsaas({
        environment,
        apiKey: apiKey || undefined,
        webhookToken: webhookToken || undefined,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success("Configuração do Asaas salva");
      setApiKey("");
      setWebhookToken("");
      router.refresh();
    });
  }

  async function testar() {
    setTesting(true);
    const res = await testarConexaoAsaas();
    setTesting(false);
    if (res.error) toast.error("Conexão falhou", { description: res.error });
    else
      toast.success("Conectado ao Asaas", {
        description: `Conta: ${res.name ?? "—"} · ambiente ${res.environment}`,
      });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Asaas
            <Badge variant={environment === "production" ? "accent" : "default"} size="sm">
              {environment === "production" ? "Produção" : "Sandbox"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Cobrança via Pix, Boleto e Cartão. As Edge Functions leem estas credenciais com
            service_role — nunca expostas ao navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditSecrets && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-caption text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Você pode visualizar, mas só um admin de plataforma altera estes segredos.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as AsaasEnvironment)}
              disabled={!canEditSecrets}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asaas-key">API key</Label>
            <Input
              id="asaas-key"
              type="password"
              autoComplete="off"
              placeholder={initial.apiKeyHint ? `Salva: ${initial.apiKeyHint}` : "$aact_..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={!canEditSecrets}
            />
            <p className="text-caption text-muted-foreground">
              Deixe em branco para manter a chave atual. Cole em Asaas → Configurações → Integrações.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asaas-wh">Token do webhook (asaas-access-token)</Label>
            <Input
              id="asaas-wh"
              type="password"
              autoComplete="off"
              placeholder={initial.hasWebhookToken ? "Salvo ••••" : "defina um token forte"}
              value={webhookToken}
              onChange={(e) => setWebhookToken(e.target.value)}
              disabled={!canEditSecrets}
            />
            <p className="text-caption text-muted-foreground">
              O mesmo valor configurado no painel Asaas em Webhooks → Token de autenticação.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={!canEditSecrets || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
            <Button variant="secondary" onClick={testar} disabled={!canEditSecrets || testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              Testar conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook do Asaas</CardTitle>
          <CardDescription>
            Cadastre esta URL no painel Asaas (Webhooks). Use o mesmo token acima e marque os
            eventos de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyField label="URL do webhook" value={webhookEndpoint} />
        </CardContent>
      </Card>
    </div>
  );
}
