import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NivelConfirmacao } from "@/lib/nia/schemas";

/**
 * Persistência da Nia sob o RLS do usuário (cliente de sessão, nunca service_role).
 * Reutiliza conversas_ia / mensagens_ia e grava a auditoria em nia_acoes.
 */

/** Garante uma conversa: usa a informada (se pertencer ao workspace) ou cria nova. */
export async function getOrCreateConversa(
  workspaceId: string,
  profileId: string,
  conversaId?: string,
): Promise<string | null> {
  const supabase = createClient();
  if (conversaId) {
    const { data } = await supabase
      .from("conversas_ia")
      .select("id")
      .eq("id", conversaId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  const { data: nova } = await supabase
    .from("conversas_ia")
    .insert({ workspace_id: workspaceId, profile_id: profileId })
    .select("id")
    .maybeSingle();
  return (nova as { id: string } | null)?.id ?? null;
}

export interface SalvarMensagemInput {
  conversaId: string;
  workspaceId: string;
  papel: "user" | "assistant" | "tool" | "system";
  conteudo: string;
  ferramentas?: unknown[];
  widgets?: unknown[];
  tokensInput?: number | null;
  tokensOutput?: number | null;
  tokensCache?: number | null;
  provedor?: string | null;
  modelo?: string | null;
  custo?: number | null;
  latenciaMs?: number | null;
}

export async function salvarMensagem(input: SalvarMensagemInput): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("mensagens_ia")
    .insert({
      conversa_id: input.conversaId,
      workspace_id: input.workspaceId,
      papel: input.papel,
      conteudo: input.conteudo,
      ferramentas_usadas: input.ferramentas ?? [],
      widgets: input.widgets ?? [],
      tokens_input: input.tokensInput ?? null,
      tokens_output: input.tokensOutput ?? null,
      tokens_cache: input.tokensCache ?? null,
      provedor: input.provedor ?? null,
      modelo: input.modelo ?? null,
      custo_estimado: input.custo ?? null,
      latencia_ms: input.latenciaMs ?? null,
    })
    .select("id")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export interface RegistrarAcaoInput {
  workspaceId: string;
  profileId: string;
  conversaId: string;
  ferramenta: string;
  nivel: NivelConfirmacao;
  payloadProposto: unknown;
  confianca?: number | null;
}

/** Registra uma proposta da Nia (status 'proposta'); a execução vem na confirmação. */
export async function registrarAcao(input: RegistrarAcaoInput): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("nia_acoes")
    .insert({
      workspace_id: input.workspaceId,
      profile_id: input.profileId,
      conversa_id: input.conversaId,
      ferramenta: input.ferramenta,
      nivel_confirmacao: input.nivel,
      payload_proposto: input.payloadProposto,
      status: "proposta",
      confianca: input.confianca ?? null,
    })
    .select("id")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export interface AtualizarAcaoInput {
  status: "confirmada" | "executada" | "rejeitada" | "desfeita";
  resultado?: unknown;
  registroId?: string | null;
}

export async function atualizarAcao(acaoId: string, input: AtualizarAcaoInput): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("nia_acoes")
    .update({
      status: input.status,
      resultado: input.resultado ?? null,
      registro_id: input.registroId ?? null,
      confirmado_em: new Date().toISOString(),
    })
    .eq("id", acaoId);
}

/** Registra/atualiza o voto 👍/👎 de uma mensagem da Nia (1 por usuário). */
export async function votar(
  mensagemId: string,
  workspaceId: string,
  profileId: string,
  voto: "positivo" | "negativo",
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("nia_feedback")
    .upsert(
      { mensagem_id: mensagemId, workspace_id: workspaceId, profile_id: profileId, voto },
      { onConflict: "mensagem_id,profile_id" },
    );
}
