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
const userClient = (auth: string): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

type AsaasEnv = "sandbox" | "production";
const ASAAS_BASE: Record<AsaasEnv, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};
interface AsaasConfig {
  environment: AsaasEnv;
  apiKey: string;
  webhookToken: string | null;
}
async function loadAsaasConfig(admin: SupabaseClient): Promise<AsaasConfig | null> {
  const { data } = await admin
    .from("integration_settings")
    .select("valor, secrets")
    .eq("key", "asaas")
    .maybeSingle();
  const apiKey = data?.secrets?.api_key as string | undefined;
  if (!apiKey) return null;
  return {
    environment: data?.valor?.environment === "production" ? "production" : "sandbox",
    apiKey,
    webhookToken: (data?.secrets?.webhook_token as string | undefined) ?? null,
  };
}
const asaasFetch = (cfg: AsaasConfig, path: string, init?: RequestInit) =>
  fetch(`${ASAAS_BASE[cfg.environment]}${path}`, {
    ...init,
    headers: {
      access_token: cfg.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "NossoTudo",
      ...(init?.headers ?? {}),
    },
  });

// ---- função ----------------------------------------------------------------
interface Body {
  ciclo?: "mensal" | "anual";
  metodo?: "PIX" | "BOLETO" | "CREDIT_CARD";
  cpfCnpj?: string;
  creditCardToken?: string;
  creditCard?: Record<string, unknown>;
  creditCardHolderInfo?: Record<string, unknown>;
}
const dataFutura = (offsetDias = 1): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "nao_autenticado" }, 401);

  const { data: userData } = await userClient(auth).auth.getUser();
  const user = userData.user;
  if (!user) return json({ ok: false, error: "nao_autenticado" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "payload_invalido" }, 400);
  }
  const ciclo = body.ciclo === "anual" ? "anual" : "mensal";
  const metodo = body.metodo ?? "PIX";
  if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(metodo)) {
    return json({ ok: false, error: "metodo_invalido" }, 400);
  }
  if (!body.cpfCnpj) return json({ ok: false, error: "cpf_obrigatorio" }, 400);

  const admin = serviceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("nome, email, default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = profile?.default_workspace_id;
  if (!workspaceId) return json({ ok: false, error: "sem_workspace" }, 400);

  const { data: workspace } = await admin
    .from("workspaces")
    .select("id, owner_id, asaas_customer_id, nome")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!workspace || workspace.owner_id !== user.id) {
    return json({ ok: false, error: "apenas_owner" }, 403);
  }

  const cfg = await loadAsaasConfig(admin);
  if (!cfg) return json({ ok: false, error: "asaas_nao_configurado" }, 400);

  const { data: plan } = await admin
    .from("plans")
    .select("preco_mensal_brl, preco_anual_brl")
    .eq("slug", "pro")
    .maybeSingle();
  const mensal = Number(plan?.preco_mensal_brl ?? 19.9);
  const value = ciclo === "anual" ? Number(plan?.preco_anual_brl ?? mensal * 12) : mensal;
  const cycle = ciclo === "anual" ? "YEARLY" : "MONTHLY";

  try {
    let customerId = workspace.asaas_customer_id as string | null;
    if (!customerId) {
      const cRes = await asaasFetch(cfg, "/customers", {
        method: "POST",
        body: JSON.stringify({
          name: profile?.nome ?? workspace.nome,
          email: profile?.email ?? undefined,
          cpfCnpj: body.cpfCnpj,
        }),
      });
      const cData = await cRes.json();
      if (!cRes.ok) {
        return json({ ok: false, error: "asaas_customer", detalhe: cData?.errors ?? cData }, 400);
      }
      customerId = cData.id;
      await admin.from("workspaces").update({ asaas_customer_id: customerId }).eq("id", workspaceId);
    }

    const subBody: Record<string, unknown> = {
      customer: customerId,
      billingType: metodo,
      value,
      nextDueDate: dataFutura(1),
      cycle,
      description: `Nosso Tudo Pro (${ciclo})`,
      externalReference: `ws_${workspaceId}`,
    };
    if (metodo === "CREDIT_CARD") {
      if (body.creditCardToken) subBody.creditCardToken = body.creditCardToken;
      else {
        subBody.creditCard = body.creditCard;
        subBody.creditCardHolderInfo = body.creditCardHolderInfo;
        subBody.remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined;
      }
    }
    const sRes = await asaasFetch(cfg, "/subscriptions", {
      method: "POST",
      body: JSON.stringify(subBody),
    });
    const sData = await sRes.json();
    if (!sRes.ok) {
      return json({ ok: false, error: "asaas_subscription", detalhe: sData?.errors ?? sData }, 400);
    }

    await admin.from("workspaces").update({ asaas_subscription_id: sData.id }).eq("id", workspaceId);

    const pRes = await asaasFetch(cfg, `/subscriptions/${sData.id}/payments?limit=1`, { method: "GET" });
    const pData = await pRes.json();
    const payment = pData?.data?.[0];

    let pix: { payload?: string; encodedImage?: string } | null = null;
    if (payment && metodo === "PIX") {
      const qrRes = await asaasFetch(cfg, `/payments/${payment.id}/pixQrCode`, { method: "GET" });
      if (qrRes.ok) {
        const qr = await qrRes.json();
        pix = { payload: qr.payload, encodedImage: qr.encodedImage };
      }
    }

    if (payment) {
      await admin.from("pagamentos").upsert(
        {
          workspace_id: workspaceId,
          asaas_payment_id: payment.id,
          asaas_subscription_id: sData.id,
          asaas_invoice_url: payment.invoiceUrl ?? null,
          asaas_bank_slip_url: payment.bankSlipUrl ?? null,
          asaas_pix_qr_code: pix?.payload ?? null,
          valor: payment.value ?? value,
          metodo,
          status: (payment.status ?? "PENDING").toLowerCase(),
          data_vencimento: payment.dueDate ?? dataFutura(1),
          descricao: `Nosso Tudo Pro (${ciclo})`,
          referencia_externa: `sub_${sData.id}`,
          metadados: payment,
        },
        { onConflict: "asaas_payment_id" },
      );
    }

    return json({
      ok: true,
      subscription_id: sData.id,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            value: payment.value ?? value,
            dueDate: payment.dueDate,
            invoiceUrl: payment.invoiceUrl ?? null,
            bankSlipUrl: payment.bankSlipUrl ?? null,
            pix,
          }
        : null,
    });
  } catch (e) {
    return json({ ok: false, error: "erro_interno", detalhe: String(e) }, 500);
  }
});
