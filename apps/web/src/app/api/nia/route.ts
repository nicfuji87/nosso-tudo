import { NextResponse } from "next/server";
import { getUser, isPlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calcularCusto, getApiKey, getNiaConfig } from "@/lib/nia/config";
import { getProvider } from "@/lib/nia/provider";
import { NIA_FEATURE, niaRequestSchema, type NiaResposta } from "@/lib/nia/schemas";
import { getOrCreateConversa, salvarMensagem } from "@/lib/nia/store";
import { NIA_TOOLS } from "@/lib/nia/tools";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = niaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  // Resolve workspace + plano sob o RLS do usuário.
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  const workspaceId = (profile as { default_workspace_id: string | null } | null)?.default_workspace_id;
  if (!workspaceId) return NextResponse.json({ error: "Workspace não encontrado." }, { status: 400 });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const { data: plan } = await supabase
    .from("plans")
    .select("slug, features")
    .eq("id", (ws as { plan_id: string } | null)?.plan_id ?? "")
    .maybeSingle();

  // Gating: Pro (ou feature 'nia'), com bypass para platform admin (fundador testar).
  const admin = await isPlatformAdmin();
  const planRow = plan as { slug: string; features: Record<string, boolean> | null } | null;
  const liberado =
    admin || planRow?.slug === "pro" || planRow?.features?.[NIA_FEATURE] === true;
  if (!liberado) {
    return NextResponse.json(
      { error: "A Nia é exclusiva do plano Pro." },
      { status: 403 },
    );
  }

  // Config do agente + credencial do provedor escolhido.
  const config = await getNiaConfig();
  const apiKey = await getApiKey(config.provedor);
  const provider = getProvider(config.provedor);
  if (!apiKey) {
    return NextResponse.json(
      { error: `A Nia ainda não foi configurada (falta a API key de ${config.provedor}).` },
      { status: 503 },
    );
  }
  if (!provider) {
    return NextResponse.json(
      { error: `Provedor '${config.provedor}' não suportado.` },
      { status: 503 },
    );
  }

  const conversaId = await getOrCreateConversa(workspaceId, user.id, parsed.data.conversaId);
  if (!conversaId) return NextResponse.json({ error: "Falha ao abrir a conversa." }, { status: 500 });

  await salvarMensagem({
    conversaId,
    workspaceId,
    papel: "user",
    conteudo: parsed.data.mensagem,
  });

  try {
    const t0 = Date.now();
    const result = await provider({
      apiKey,
      modelo: config.modelo,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      userMessage: parsed.data.mensagem,
      tools: NIA_TOOLS,
      ctx: { workspaceId, profileId: user.id, conversaId },
    });
    const latenciaMs = Date.now() - t0;
    const custo = await calcularCusto(
      config.provedor,
      config.modelo,
      result.tokensInput,
      result.tokensOutput,
    );

    await salvarMensagem({
      conversaId,
      workspaceId,
      papel: "assistant",
      conteudo: result.texto,
      widgets: result.widgets,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      provedor: config.provedor,
      modelo: config.modelo,
      custo,
      latenciaMs,
    });

    const resposta: NiaResposta = {
      conversaId,
      texto: result.texto,
      widgets: result.widgets,
    };
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json(
      { error: "A Nia teve um problema ao responder. Tente de novo." , detalhe: (e as Error).message },
      { status: 500 },
    );
  }
}
