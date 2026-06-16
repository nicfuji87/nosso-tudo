import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsappDispatch } from "@/lib/admin/settings";

/**
 * Admin dos alertas proativos da Nia (push WhatsApp via uazapi).
 * Tabelas têm RLS deny-all; só este módulo (service_role) e a Edge Function leem/escrevem.
 * Ver migration 0011 e supabase/functions/nia-alertas-cron.
 */

export const TIPOS_ALERTA = [
  "saldo_negativo",
  "orcamento_estourado",
  "orcamento_perto",
  "cartao_limite",
  "resumo_semanal",
  "resumo_mensal",
  "personalizado",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const FREQUENCIAS_ALERTA = ["imediato", "diario", "semanal", "mensal"] as const;
export type FrequenciaAlerta = (typeof FREQUENCIAS_ALERTA)[number];

export const PUBLICOS_ALERTA = ["todos_pro", "especificos"] as const;
export type PublicoAlerta = (typeof PUBLICOS_ALERTA)[number];

/** Tipos que aceitam um limiar de % (orçamento perto, cartão perto do limite). */
export const TIPOS_COM_LIMIAR: TipoAlerta[] = ["orcamento_perto", "cartao_limite"];
/** Tipo cujo conteúdo é a própria mensagem escrita pelo admin. */
export const TIPO_PERSONALIZADO: TipoAlerta = "personalizado";

export interface AlvoRef {
  workspaceId: string;
  profileId: string | null;
}

export interface AlertaAdmin {
  id: string;
  nome: string;
  tipo: TipoAlerta;
  ativo: boolean;
  parametros: Record<string, unknown>;
  template: string | null;
  frequencia: FrequenciaAlerta;
  diaSemana: number | null;
  diaMes: number | null;
  hora: number;
  publicoAlvo: PublicoAlerta;
  totalAlvos: number;
  updatedAt: string;
}

export interface AlertaDetalhe extends AlertaAdmin {
  alvos: AlvoRef[];
}

export interface DestinatarioVerificado {
  workspaceId: string;
  workspaceNome: string;
  profileId: string;
  nome: string;
  telefoneHint: string;
}

export interface EnvioRecente {
  id: string;
  data: string;
  alertaNome: string | null;
  telefoneHint: string | null;
  status: string;
  mensagem: string | null;
  erro: string | null;
}

/** Mascara um telefone deixando os 4 últimos dígitos. */
function maskTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const d = tel.replace(/\D/g, "");
  if (d.length <= 4) return `••${d}`;
  return `••••${d.slice(-4)}`;
}

interface AlertaRow {
  id: string;
  nome: string;
  tipo: TipoAlerta;
  ativo: boolean;
  parametros: Record<string, unknown> | null;
  template: string | null;
  frequencia: FrequenciaAlerta;
  dia_semana: number | null;
  dia_mes: number | null;
  hora: number;
  publico_alvo: PublicoAlerta;
  updated_at: string;
}

function mapAlerta(r: AlertaRow, totalAlvos: number): AlertaAdmin {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    ativo: r.ativo,
    parametros: r.parametros ?? {},
    template: r.template,
    frequencia: r.frequencia,
    diaSemana: r.dia_semana,
    diaMes: r.dia_mes,
    hora: r.hora,
    publicoAlvo: r.publico_alvo,
    totalAlvos,
    updatedAt: r.updated_at,
  };
}

export async function listAlertas(): Promise<AlertaDetalhe[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("nia_alertas")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = (data as AlertaRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: alvos } = await admin
    .from("nia_alertas_alvos")
    .select("alerta_id, workspace_id, profile_id");
  const porAlerta = new Map<string, AlvoRef[]>();
  for (const a of (alvos as
    | { alerta_id: string; workspace_id: string; profile_id: string | null }[]
    | null) ?? []) {
    const lista = porAlerta.get(a.alerta_id) ?? [];
    lista.push({ workspaceId: a.workspace_id, profileId: a.profile_id });
    porAlerta.set(a.alerta_id, lista);
  }
  return rows.map((r) => {
    const refs = porAlerta.get(r.id) ?? [];
    return { ...mapAlerta(r, refs.length), alvos: refs };
  });
}

export async function getAlerta(id: string): Promise<AlertaDetalhe | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("nia_alertas").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as AlertaRow;
  const { data: alvos } = await admin
    .from("nia_alertas_alvos")
    .select("workspace_id, profile_id")
    .eq("alerta_id", id);
  const refs =
    (alvos as { workspace_id: string; profile_id: string | null }[] | null)?.map((a) => ({
      workspaceId: a.workspace_id,
      profileId: a.profile_id,
    })) ?? [];
  return { ...mapAlerta(r, refs.length), alvos: refs };
}

export interface SaveAlertaInput {
  id?: string;
  nome: string;
  tipo: TipoAlerta;
  ativo: boolean;
  frequencia: FrequenciaAlerta;
  hora: number;
  diaSemana?: number | null;
  diaMes?: number | null;
  limiarPct?: number | null;
  template?: string | null;
  publicoAlvo: PublicoAlerta;
  alvos?: AlvoRef[];
}

export async function saveAlerta(input: SaveAlertaInput, userId: string): Promise<string> {
  const admin = createAdminClient();

  const parametros: Record<string, unknown> = {};
  if (TIPOS_COM_LIMIAR.includes(input.tipo)) {
    parametros.limiar_pct = input.limiarPct ?? 80;
  }
  if (input.tipo === "resumo_semanal") parametros.dias = 7;

  const row = {
    nome: input.nome,
    tipo: input.tipo,
    ativo: input.ativo,
    parametros,
    template: input.template?.trim() ? input.template.trim() : null,
    frequencia: input.frequencia,
    dia_semana: input.frequencia === "semanal" ? input.diaSemana ?? 1 : null,
    dia_mes: input.frequencia === "mensal" ? input.diaMes ?? 1 : null,
    hora: input.hora,
    publico_alvo: input.publicoAlvo,
  };

  let alertaId = input.id ?? null;
  if (alertaId) {
    const { error } = await admin.from("nia_alertas").update(row).eq("id", alertaId);
    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("nia_alertas")
      .insert({ ...row, created_by: userId })
      .select("id")
      .single();
    if (error) throw error;
    alertaId = (data as { id: string }).id;
  }

  // Alvos: substitui o conjunto quando "especificos"; limpa quando "todos_pro".
  await admin.from("nia_alertas_alvos").delete().eq("alerta_id", alertaId);
  if (input.publicoAlvo === "especificos" && input.alvos && input.alvos.length > 0) {
    const linhas = input.alvos.map((a) => ({
      alerta_id: alertaId,
      workspace_id: a.workspaceId,
      profile_id: a.profileId,
    }));
    const { error } = await admin.from("nia_alertas_alvos").insert(linhas);
    if (error) throw error;
  }

  return alertaId!;
}

export async function deleteAlerta(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("nia_alertas").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleAlerta(id: string, ativo: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("nia_alertas").update({ ativo }).eq("id", id);
  if (error) throw error;
}

/** Números verificados (whatsapp_routing) — base para o público "específicos". */
export async function listDestinatariosVerificados(): Promise<DestinatarioVerificado[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_routing")
    .select("telefone, workspace_id, profile_id, verificado, workspaces(nome), profiles(nome)")
    .eq("verificado", true);
  const rows =
    (data as
      | {
          telefone: string;
          workspace_id: string;
          profile_id: string;
          workspaces: { nome: string } | null;
          profiles: { nome: string } | null;
        }[]
      | null) ?? [];
  return rows.map((r) => ({
    workspaceId: r.workspace_id,
    workspaceNome: r.workspaces?.nome ?? "—",
    profileId: r.profile_id,
    nome: r.profiles?.nome ?? "—",
    telefoneHint: maskTelefone(r.telefone) ?? "—",
  }));
}

export async function listEnviosRecentes(limite = 20): Promise<EnvioRecente[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("nia_alertas_envios")
    .select("id, enviado_em, telefone, status, mensagem, erro, nia_alertas(nome)")
    .order("enviado_em", { ascending: false })
    .limit(limite);
  const rows =
    (data as
      | {
          id: string;
          enviado_em: string;
          telefone: string | null;
          status: string;
          mensagem: string | null;
          erro: string | null;
          nia_alertas: { nome: string } | null;
        }[]
      | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    data: r.enviado_em,
    alertaNome: r.nia_alertas?.nome ?? null,
    telefoneHint: maskTelefone(r.telefone),
    status: r.status,
    mensagem: r.mensagem,
    erro: r.erro,
  }));
}

export interface DisparoResultado {
  ok: boolean;
  avaliados?: number;
  enviados?: number;
  falhas?: number;
  pulados?: number;
  status?: number;
  detalhe?: string | null;
  error?: string;
}

/** Chama a Edge Function nia-alertas-cron. `forcar` ignora a janela de horário. */
export async function dispararAlertas(opts: {
  alertaId?: string;
  forcar?: boolean;
}): Promise<DisparoResultado> {
  const cfg = await getWhatsappDispatch();
  if (!cfg.baseUrl || !cfg.cronSecret) {
    return { ok: false, error: "Disparo não configurado (base URL ou secret ausente)." };
  }
  try {
    const res = await fetch(`${cfg.baseUrl}/nia-alertas-cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cfg.cronSecret },
      body: JSON.stringify({ forcar: opts.forcar ?? false, alertaId: opts.alertaId }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as DisparoResultado;
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ...data, ok: true };
  } catch (e) {
    return { ok: false, error: `Falha de rede: ${String(e).slice(0, 120)}` };
  }
}

/** Envia uma mensagem de teste para um número via a mesma Edge Function. */
export async function enviarTesteWhatsapp(
  telefone: string,
  mensagem?: string,
): Promise<DisparoResultado> {
  const cfg = await getWhatsappDispatch();
  if (!cfg.baseUrl || !cfg.cronSecret) {
    return { ok: false, error: "Disparo não configurado (base URL ou secret ausente)." };
  }
  if (!cfg.uazapiPronto) {
    return { ok: false, error: "uazapi sem URL/token. Configure em Integrações → WhatsApp." };
  }
  try {
    const res = await fetch(`${cfg.baseUrl}/nia-alertas-cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cfg.cronSecret },
      body: JSON.stringify({ teste: { telefone, mensagem } }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as DisparoResultado;
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.detalhe || data.error || `HTTP ${res.status}` };
    }
    return { ...data, ok: true };
  } catch (e) {
    return { ok: false, error: `Falha de rede: ${String(e).slice(0, 120)}` };
  }
}
