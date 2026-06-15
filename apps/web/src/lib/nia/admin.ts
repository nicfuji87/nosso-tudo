import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { provedoresDisponiveis } from "@/lib/nia/provider";

/**
 * Leituras do console super admin da Nia (uso de tokens + config do agente).
 * Tudo via service_role (enxerga todos os workspaces) — a página gateia a
 * platform admin, então nunca vaza dado entre famílias.
 */

export interface UsoLinha {
  profileId: string;
  nome: string;
  email: string | null;
  workspaceNome: string;
  tokensEntrada: number;
  tokensSaida: number;
  custo: number;
  mensagens: number;
}

export interface UsoNia {
  periodoDias: number;
  totalTokens: number;
  totalCusto: number;
  totalMensagens: number;
  linhas: UsoLinha[];
}

interface UsoRow {
  workspace_id: string;
  profile_id: string;
  tokens_entrada: number;
  tokens_saida: number;
  custo: number;
  mensagens: number;
}

export async function getUsoNia(periodoDias = 30): Promise<UsoNia> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - periodoDias * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("v_nia_uso_usuario")
    .select("workspace_id, profile_id, tokens_entrada, tokens_saida, custo, mensagens")
    .gte("dia", desde);
  const rows = (data as UsoRow[] | null) ?? [];

  const mapa = new Map<
    string,
    { workspaceId: string; profileId: string; te: number; ts: number; custo: number; msgs: number }
  >();
  for (const r of rows) {
    const k = `${r.workspace_id}|${r.profile_id}`;
    const cur = mapa.get(k) ?? {
      workspaceId: r.workspace_id,
      profileId: r.profile_id,
      te: 0,
      ts: 0,
      custo: 0,
      msgs: 0,
    };
    cur.te += Number(r.tokens_entrada);
    cur.ts += Number(r.tokens_saida);
    cur.custo += Number(r.custo);
    cur.msgs += Number(r.mensagens);
    mapa.set(k, cur);
  }
  const agreg = [...mapa.values()];

  const profileIds = [...new Set(agreg.map((a) => a.profileId))];
  const workspaceIds = [...new Set(agreg.map((a) => a.workspaceId))];

  const profMap = new Map<string, { nome: string; email: string | null }>();
  const wsMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id, nome, email").in("id", profileIds);
    for (const p of (profs as { id: string; nome: string; email: string | null }[] | null) ?? []) {
      profMap.set(p.id, { nome: p.nome, email: p.email });
    }
  }
  if (workspaceIds.length > 0) {
    const { data: wss } = await admin.from("workspaces").select("id, nome").in("id", workspaceIds);
    for (const w of (wss as { id: string; nome: string }[] | null) ?? []) {
      wsMap.set(w.id, w.nome);
    }
  }

  const linhas: UsoLinha[] = agreg
    .map((a) => ({
      profileId: a.profileId,
      nome: profMap.get(a.profileId)?.nome ?? "—",
      email: profMap.get(a.profileId)?.email ?? null,
      workspaceNome: wsMap.get(a.workspaceId) ?? "—",
      tokensEntrada: a.te,
      tokensSaida: a.ts,
      custo: a.custo,
      mensagens: a.msgs,
    }))
    .sort((x, y) => y.custo - x.custo);

  return {
    periodoDias,
    totalTokens: linhas.reduce((s, l) => s + l.tokensEntrada + l.tokensSaida, 0),
    totalCusto: linhas.reduce((s, l) => s + l.custo, 0),
    totalMensagens: linhas.reduce((s, l) => s + l.mensagens, 0),
    linhas,
  };
}

export interface NiaConfigCompleta {
  id: string;
  systemPrompt: string;
  provedor: string;
  modelo: string;
  temperature: number;
  maxTokens: number;
  versao: number;
}

export async function getNiaConfigCompleta(): Promise<NiaConfigCompleta | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("nia_config")
    .select("id, system_prompt, provedor, modelo, parametros, versao")
    .eq("escopo", "global")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string;
    system_prompt: string;
    provedor: string;
    modelo: string;
    parametros: { temperature?: number; max_tokens?: number } | null;
    versao: number;
  };
  return {
    id: r.id,
    systemPrompt: r.system_prompt,
    provedor: r.provedor,
    modelo: r.modelo,
    temperature: r.parametros?.temperature ?? 0.3,
    maxTokens: r.parametros?.max_tokens ?? 1024,
    versao: r.versao,
  };
}

export interface OpcoesAgente {
  /** Provedores com adaptador implementado (selecionáveis hoje). */
  provedores: string[];
  /** Modelos conhecidos por provedor (de nia_precos). */
  modelosPorProvedor: Record<string, string[]>;
}

export async function getOpcoesAgente(): Promise<OpcoesAgente> {
  const admin = createAdminClient();
  const { data } = await admin.from("nia_precos").select("provedor, modelo");
  const rows = (data as { provedor: string; modelo: string }[] | null) ?? [];
  const modelosPorProvedor: Record<string, string[]> = {};
  for (const r of rows) {
    (modelosPorProvedor[r.provedor] ??= []).push(r.modelo);
  }
  return { provedores: provedoresDisponiveis(), modelosPorProvedor };
}

/** Salva uma NOVA versão da config global (versionado; rollback futuro). */
export async function saveNiaConfig(
  input: { systemPrompt: string; provedor: string; modelo: string; temperature: number; maxTokens: number },
  userId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("nia_config")
    .select("versao")
    .eq("escopo", "global")
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  const novaVersao = ((maxRow as { versao: number } | null)?.versao ?? 0) + 1;

  await admin.from("nia_config").update({ ativo: false }).eq("escopo", "global").eq("ativo", true);
  await admin.from("nia_config").insert({
    escopo: "global",
    system_prompt: input.systemPrompt,
    provedor: input.provedor,
    modelo: input.modelo,
    parametros: { temperature: input.temperature, max_tokens: input.maxTokens },
    ativo: true,
    versao: novaVersao,
    criado_por: userId,
  });
}
