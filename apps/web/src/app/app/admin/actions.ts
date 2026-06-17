"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getUser, isPlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAsaasConfig, saveAsaas, saveNia, saveWhatsapp } from "@/lib/admin/settings";
import { rodarRecorrenciasAgora, setRecorrenciasCronAtivo } from "@/lib/admin/recorrencias";
import { deletePreco, savePreco, saveNiaConfig } from "@/lib/nia/admin";
import {
  saveAlerta,
  deleteAlerta,
  toggleAlerta,
  dispararAlertas,
  enviarTesteWhatsapp,
  type DisparoResultado,
} from "@/lib/admin/alertas";
import {
  asaasConfigSchema,
  whatsappConfigSchema,
  niaConfigSchema,
  niaAgentConfigSchema,
  niaPrecoSchema,
  planoSchema,
  anuncioSchema,
  alertaSchema,
  testeWhatsappSchema,
} from "@/lib/schemas/admin";
import { ASAAS_BASE_URL } from "@/lib/asaas/constants";

type ActionResult<T = unknown> = { error?: string } & T;

/** Segredos globais: apenas platform admin. */
async function requirePlatformAdmin(): Promise<{ userId: string } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  if (!(await isPlatformAdmin())) {
    return { error: "Apenas um admin de plataforma pode alterar segredos de integração." };
  }
  return { userId: user.id };
}

/** Owner do workspace ativo (planos, anúncios). */
async function requireOwner(): Promise<{ userId: string } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const supabase = createClient();
  const [{ data: member }, admin] = await Promise.all([
    supabase.from("workspace_members").select("role").eq("profile_id", user.id).eq("role", "owner").maybeSingle(),
    isPlatformAdmin(),
  ]);
  if (!member && !admin) return { error: "Sem permissão." };
  return { userId: user.id };
}

// ---- Recorrências (cron de contas fixas) -----------------------------------

/** Liga/desliga o job pg_cron que gera as contas fixas. */
export async function alternarCronRecorrencias(ativo: boolean): Promise<{ error?: string; ok?: boolean }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    await setRecorrenciasCronAtivo(ativo);
  } catch {
    return { error: "Não foi possível alterar o agendamento." };
  }
  revalidatePath("/app/admin/recorrencias");
  return { ok: true };
}

/** Roda a geração das contas fixas na hora (fora do horário do cron). */
export async function executarRecorrenciasAgora(): Promise<{ error?: string; geradas?: number }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    const geradas = await rodarRecorrenciasAgora();
    revalidatePath("/app/admin/recorrencias");
    revalidatePath("/app/transacoes");
    revalidatePath("/app");
    return { geradas };
  } catch {
    return { error: "Não foi possível rodar a geração agora." };
  }
}

// ---- Asaas -----------------------------------------------------------------

export async function salvarAsaas(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = asaasConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await saveAsaas(
      {
        environment: parsed.data.environment,
        apiKey: parsed.data.apiKey || undefined,
        webhookToken: parsed.data.webhookToken || undefined,
      },
      gate.userId,
    );
  } catch {
    return { error: "Não foi possível salvar a configuração do Asaas." };
  }
  revalidatePath("/app/admin/integracoes");
  return {};
}

/** Testa a conexão Asaas (GET /myAccount). Não persiste nada. */
export async function testarConexaoAsaas(): Promise<ActionResult<{ name?: string; environment?: string }>> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const cfg = await getAsaasConfig();
  if (!cfg.apiKey) return { error: "Salve a API key do Asaas antes de testar." };

  try {
    const res = await fetch(`${ASAAS_BASE_URL[cfg.environment]}/myAccount`, {
      headers: { access_token: cfg.apiKey, "User-Agent": "NossoTudo" },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401) return { error: "Chave inválida para este ambiente." };
      return { error: `Asaas respondeu ${res.status}: ${body.slice(0, 120)}` };
    }
    const data = (await res.json()) as { name?: string; email?: string };
    return { name: data.name ?? data.email, environment: cfg.environment };
  } catch {
    return { error: "Falha de rede ao contatar o Asaas." };
  }
}

// ---- WhatsApp / uazapi + n8n ------------------------------------------------

export async function salvarWhatsapp(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = whatsappConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await saveWhatsapp(
      {
        uazapiUrl: parsed.data.uazapiUrl || undefined,
        n8nWebhookUrl: parsed.data.n8nWebhookUrl || undefined,
        uazapiToken: parsed.data.uazapiToken || undefined,
      },
      gate.userId,
    );
  } catch {
    return { error: "Não foi possível salvar a configuração do WhatsApp." };
  }
  revalidatePath("/app/admin/integracoes");
  return {};
}

/** Gera (ou regenera) o secret compartilhado n8n→Supabase. Retorna em claro 1x. */
export async function gerarIngestSecret(): Promise<ActionResult<{ secret?: string }>> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const secret = `nt_whatsapp_${randomBytes(24).toString("hex")}`;
  try {
    await saveWhatsapp({ ingestSecret: secret }, gate.userId);
  } catch {
    return { error: "Não foi possível gerar o secret." };
  }
  revalidatePath("/app/admin/integracoes");
  return { secret };
}

// ---- Nia (assistente de IA) ------------------------------------------------

export async function salvarNia(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = niaConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await saveNia(
      {
        anthropicApiKey: parsed.data.anthropicApiKey || undefined,
        openaiApiKey: parsed.data.openaiApiKey || undefined,
      },
      gate.userId,
    );
  } catch {
    return { error: "Não foi possível salvar a configuração da Nia." };
  }
  revalidatePath("/app/admin/integracoes");
  return {};
}

/** Salva uma nova versão da config do agente Nia (prompt/provedor/modelo). */
export async function salvarNiaConfig(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = niaAgentConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await saveNiaConfig(parsed.data, gate.userId);
  } catch {
    return { error: "Não foi possível salvar a configuração do agente." };
  }
  revalidatePath("/app/admin/nia");
  return {};
}

/** Cadastra/atualiza o preço de um modelo (USD por 1M tokens). */
export async function salvarPreco(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = niaPrecoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await savePreco({
      provedor: parsed.data.provedor,
      modelo: parsed.data.modelo,
      precoEntrada: parsed.data.precoEntrada,
      precoSaida: parsed.data.precoSaida,
      precoEntradaCache: parsed.data.precoEntradaCache ?? null,
    });
  } catch {
    return { error: "Não foi possível salvar o preço." };
  }
  revalidatePath("/app/admin/nia");
  return {};
}

/** Remove o preço de um modelo. */
export async function excluirPreco(provedor: string, modelo: string): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  try {
    await deletePreco(provedor, modelo);
  } catch {
    return { error: "Não foi possível remover o preço." };
  }
  revalidatePath("/app/admin/nia");
  return {};
}

// ---- Alertas proativos da Nia (push WhatsApp) ------------------------------

export async function salvarAlerta(input: unknown): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };

  const parsed = alertaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  try {
    await saveAlerta(
      {
        id: d.id,
        nome: d.nome,
        tipo: d.tipo,
        ativo: d.ativo,
        frequencia: d.frequencia,
        hora: d.hora,
        diaSemana: d.diaSemana ?? null,
        diaMes: d.diaMes ?? null,
        limiarPct: d.limiarPct ?? null,
        template: d.template || null,
        publicoAlvo: d.publicoAlvo,
        alvos: d.alvos,
      },
      gate.userId,
    );
  } catch {
    return { error: "Não foi possível salvar o alerta." };
  }
  revalidatePath("/app/admin/alertas");
  return {};
}

export async function excluirAlerta(id: string): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    await deleteAlerta(id);
  } catch {
    return { error: "Não foi possível excluir o alerta." };
  }
  revalidatePath("/app/admin/alertas");
  return {};
}

export async function alternarAlerta(id: string, ativo: boolean): Promise<{ error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    await toggleAlerta(id, ativo);
  } catch {
    return { error: "Não foi possível alterar o alerta." };
  }
  revalidatePath("/app/admin/alertas");
  return {};
}

/** Roda a avaliação agora (ignora a janela de horário; respeita a deduplicação). */
export async function dispararAlertasAgora(
  alertaId?: string,
): Promise<DisparoResultado & { error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const res = await dispararAlertas({ alertaId, forcar: true });
  revalidatePath("/app/admin/alertas");
  return res;
}

/** Envia uma mensagem de teste para validar a credencial uazapi. */
export async function testarEnvioWhatsapp(
  input: unknown,
): Promise<DisparoResultado & { error?: string }> {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = testeWhatsappSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return enviarTesteWhatsapp(parsed.data.telefone, parsed.data.mensagem || undefined);
}

// ---- Planos ----------------------------------------------------------------

export async function salvarPlano(input: unknown): Promise<{ error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  const parsed = planoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from("plans")
    .update({
      preco_mensal_brl: d.preco_mensal_brl,
      preco_anual_brl: d.preco_anual_brl,
      exibe_anuncios: d.exibe_anuncios,
      ativo: d.ativo,
    })
    .eq("id", d.id);
  if (error) return { error: "Não foi possível salvar o plano." };
  revalidatePath("/app/admin/planos");
  return {};
}

// ---- Anúncios --------------------------------------------------------------

export async function salvarAnuncio(input: unknown): Promise<{ error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };

  const parsed = anuncioSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  const admin = createAdminClient();
  const row = {
    posicao: d.posicao,
    titulo: d.titulo,
    texto: d.texto || null,
    url_destino: d.url_destino || null,
    imagem_url: d.imagem_url || null,
    prioridade: d.prioridade,
    ativo: d.ativo,
  };
  const { error } = d.id
    ? await admin.from("anuncios").update(row).eq("id", d.id)
    : await admin.from("anuncios").insert(row);
  if (error) return { error: "Não foi possível salvar o anúncio." };
  revalidatePath("/app/admin/anuncios");
  return {};
}

export async function excluirAnuncio(id: string): Promise<{ error?: string }> {
  const gate = await requireOwner();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();
  const { error } = await admin.from("anuncios").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir o anúncio." };
  revalidatePath("/app/admin/anuncios");
  return {};
}
