import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---- shared (inline para deploy self-contained) ----------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const serviceClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
async function loadAsaasConfig(
  admin: SupabaseClient,
): Promise<{ webhookToken: string | null } | null> {
  const { data } = await admin
    .from("integration_settings")
    .select("secrets")
    .eq("key", "asaas")
    .maybeSingle();
  if (!data) return null;
  return { webhookToken: (data?.secrets?.webhook_token as string | undefined) ?? null };
}

// Mapeia status Asaas (pagamento) -> efeito na assinatura do workspace.
function statusAssinatura(event: string): string | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "active";
    case "PAYMENT_OVERDUE":
      return "past_due";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_DELETED":
    case "SUBSCRIPTION_DELETED":
      return "canceled";
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = serviceClient();

  // 1. Autenticação do webhook (asaas-access-token configurado no painel Asaas)
  const cfg = await loadAsaasConfig(admin);
  const token = req.headers.get("asaas-access-token");
  if (!cfg?.webhookToken || token !== cfg.webhookToken) {
    return json({ ok: false, error: "token_invalido" }, 401);
  }

  let payload: { id?: string; event?: string; payment?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "payload_invalido" }, 400);
  }

  const event = payload.event ?? "UNKNOWN";
  const payment = payload.payment ?? {};
  const paymentId = (payment.id as string | undefined) ?? null;
  const eventId = payload.id ?? (paymentId ? `${event}:${paymentId}` : crypto.randomUUID());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // 2. Idempotência — registra o evento antes de processar
  const { error: insErr } = await admin.from("asaas_webhook_events").insert({
    asaas_event_id: eventId,
    event_type: event,
    payload,
    ip_origem: ip,
  });
  if (insErr) {
    // Violação de unique (asaas_event_id) => já processado. Idempotente.
    if (insErr.code === "23505") return json({ ok: true, duplicated: true });
    return json({ ok: false, error: "persist_evento" }, 500);
  }

  try {
    // 3. Resolve o workspace (pagamento existente -> assinatura -> customer)
    let workspaceId: string | null = null;
    if (paymentId) {
      const { data } = await admin
        .from("pagamentos")
        .select("workspace_id")
        .eq("asaas_payment_id", paymentId)
        .maybeSingle();
      workspaceId = data?.workspace_id ?? null;
    }
    const subId = (payment.subscription as string | undefined) ?? null;
    const customerId = (payment.customer as string | undefined) ?? null;
    if (!workspaceId && subId) {
      const { data } = await admin
        .from("workspaces")
        .select("id")
        .eq("asaas_subscription_id", subId)
        .maybeSingle();
      workspaceId = data?.id ?? null;
    }
    if (!workspaceId && customerId) {
      const { data } = await admin
        .from("workspaces")
        .select("id")
        .eq("asaas_customer_id", customerId)
        .maybeSingle();
      workspaceId = data?.id ?? null;
    }

    // 4. Sincroniza a cobrança (pagamentos)
    let pagamentoId: string | null = null;
    if (paymentId && workspaceId) {
      const { data: pag } = await admin
        .from("pagamentos")
        .upsert(
          {
            workspace_id: workspaceId,
            asaas_payment_id: paymentId,
            asaas_subscription_id: subId,
            asaas_invoice_url: (payment.invoiceUrl as string) ?? null,
            asaas_bank_slip_url: (payment.bankSlipUrl as string) ?? null,
            valor: (payment.value as number) ?? 0,
            valor_liquido: (payment.netValue as number) ?? null,
            status: ((payment.status as string) ?? "pending").toLowerCase(),
            data_vencimento: (payment.dueDate as string) ?? new Date().toISOString().slice(0, 10),
            data_pagamento: (payment.paymentDate as string) ?? null,
            descricao: (payment.description as string) ?? null,
            metadados: payment,
          },
          { onConflict: "asaas_payment_id" },
        )
        .select("id")
        .maybeSingle();
      pagamentoId = pag?.id ?? null;
    }

    // 5. Efeito na assinatura do workspace
    const novoStatus = statusAssinatura(event);
    if (workspaceId && novoStatus) {
      const patch: Record<string, unknown> = { subscription_status: novoStatus };
      if (novoStatus === "active" && payment.dueDate) {
        patch.current_period_end = new Date(`${payment.dueDate}T00:00:00Z`).toISOString();
      }
      await admin.from("workspaces").update(patch).eq("id", workspaceId);
    }

    // 6. Marca o evento como processado
    await admin
      .from("asaas_webhook_events")
      .update({
        processado: true,
        processado_em: new Date().toISOString(),
        workspace_id: workspaceId,
        pagamento_id: pagamentoId,
      })
      .eq("asaas_event_id", eventId);

    return json({ ok: true });
  } catch (e) {
    await admin
      .from("asaas_webhook_events")
      .update({ erro: String(e), tentativas: 1 })
      .eq("asaas_event_id", eventId);
    return json({ ok: false, error: "erro_processamento" }, 500);
  }
});
