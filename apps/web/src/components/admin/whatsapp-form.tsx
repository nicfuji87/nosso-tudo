"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, ShieldAlert, AlertTriangle } from "lucide-react";
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
import { salvarWhatsapp, gerarIngestSecret } from "@/app/app/admin/actions";
import type { WhatsappPublic } from "@/lib/admin/settings";
import { CopyField } from "./copy-field";

const CONTRACT_EXAMPLE = `{
  "idempotency_key": "uazapi-msg-id-abc123",
  "telefone": "5511999998888",
  "transacao": {
    "tipo": "despesa",
    "descricao": "Compra no mercado",
    "valor": 287.40,
    "data_transacao": "2026-06-14",
    "categoria": "Mercado",
    "estabelecimento": "Pão de Açúcar",
    "meio_pagamento": "cartao_credito",
    "cartao": { "nome": "Nubank", "final": "1234" },
    "pagador": "Bruna",
    "tags": ["supermercado"]
  },
  "midias": [
    { "tipo": "imagem", "url": "https://.../nota.jpg", "mime_type": "image/jpeg" }
  ],
  "texto_original": "gastei 287,40 no pão de açúcar no nubank"
}`;

export function WhatsappForm({
  initial,
  canEditSecrets,
  ingestEndpoint,
}: {
  initial: WhatsappPublic;
  canEditSecrets: boolean;
  ingestEndpoint: string;
}) {
  const router = useRouter();
  const [uazapiUrl, setUazapiUrl] = useState(initial.uazapiUrl ?? "");
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(initial.n8nWebhookUrl ?? "");
  const [uazapiToken, setUazapiToken] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [generating, setGenerating] = useState(false);

  function salvar() {
    startSave(async () => {
      const res = await salvarWhatsapp({
        uazapiUrl: uazapiUrl || undefined,
        n8nWebhookUrl: n8nWebhookUrl || undefined,
        uazapiToken: uazapiToken || undefined,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success("Configuração do WhatsApp salva");
      setUazapiToken("");
      router.refresh();
    });
  }

  async function gerar() {
    setGenerating(true);
    const res = await gerarIngestSecret();
    setGenerating(false);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    setRevealedSecret(res.secret ?? null);
    toast.success("Secret gerado", { description: "Copie agora — não será exibido de novo." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WhatsApp via uazapi + n8n
            <Badge size="sm">orquestrado no n8n</Badge>
          </CardTitle>
          <CardDescription>
            O fluxo (receber → IA → gravar → responder) vive no n8n. Aqui ficam as credenciais que o
            n8n usa e o contrato de ingestão que o Supabase expõe.
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
            <Label htmlFor="uazapi-url">URL do servidor uazapi</Label>
            <Input
              id="uazapi-url"
              placeholder="https://seu-servidor.uazapi.com"
              value={uazapiUrl}
              onChange={(e) => setUazapiUrl(e.target.value)}
              disabled={!canEditSecrets}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="uazapi-token">Token da instância uazapi</Label>
            <Input
              id="uazapi-token"
              type="password"
              autoComplete="off"
              placeholder={initial.uazapiTokenHint ? `Salvo: ${initial.uazapiTokenHint}` : "token"}
              value={uazapiToken}
              onChange={(e) => setUazapiToken(e.target.value)}
              disabled={!canEditSecrets}
            />
            <p className="text-caption text-muted-foreground">
              Deixe em branco para manter. Usado pelo n8n para enviar mensagens de confirmação.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n8n-url">URL do webhook n8n (uazapi → n8n)</Label>
            <Input
              id="n8n-url"
              placeholder="https://editori.infusecomunicacao.online/webhook/..."
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              disabled={!canEditSecrets}
            />
            <p className="text-caption text-muted-foreground">
              Referência: aponte o webhook da instância uazapi para esta URL no n8n.
            </p>
          </div>

          <Button onClick={salvar} disabled={!canEditSecrets || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contrato de ingestão (n8n → Supabase)</CardTitle>
          <CardDescription>
            O n8n faz <span className="font-medium text-foreground">um POST</span> nesta Edge
            Function com o header <code className="font-mono">x-webhook-secret</code> e o corpo
            abaixo. A função resolve o telefone, faz o matching e devolve a confirmação pronta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="Endpoint (POST)" value={ingestEndpoint} />

          <div className="space-y-1.5">
            <Label>Secret compartilhado (header x-webhook-secret)</Label>
            {revealedSecret ? (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-caption">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
                  Copie agora — por segurança, não será exibido novamente.
                </div>
                <div className="mt-2">
                  <CopyField value={revealedSecret} />
                </div>
              </>
            ) : (
              <p className="text-caption text-muted-foreground">
                {initial.hasIngestSecret
                  ? `Configurado: ${initial.ingestSecretHint}. Regenere se precisar rotacionar (invalida o anterior).`
                  : "Nenhum secret ainda. Gere um para autenticar as chamadas do n8n."}
              </p>
            )}
            <div className="pt-1">
              <Button variant="secondary" onClick={gerar} disabled={!canEditSecrets || generating}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {initial.hasIngestSecret ? "Regenerar secret" : "Gerar secret"}
              </Button>
            </div>
          </div>

          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer list-none px-4 py-3 text-body-sm font-medium">
              Ver corpo JSON de exemplo
            </summary>
            <div className="border-t border-border p-4">
              <pre className="overflow-x-auto rounded-md bg-secondary/40 p-3 text-caption">
                <code className="font-mono">{CONTRACT_EXAMPLE}</code>
              </pre>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
