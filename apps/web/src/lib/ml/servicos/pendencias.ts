import "server-only";
import { mlDb } from "../db";
import { redigir, redigirTexto, truncar } from "../redacao";

/**
 * Pendências EXCEPCIONAIS (ADR-ML-008). As de fluxo (link, aprovação,
 * imagem manual, revisão) vêm do status das entidades — ver queries da Central.
 */
export type TipoPendencia =
  | "publish_blocked"
  | "integration_auth"
  | "config_incomplete"
  | "job_failed"
  | "product_changed"
  | "other";

export async function abrirPendencia(p: {
  tipo: TipoPendencia;
  titulo: string;
  detalhe?: string;
  entidade?: { tipo: string; id: string } | null;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  prioridade?: number;
}): Promise<void> {
  const linha = {
    type: p.tipo,
    title: truncar(p.titulo, 200),
    detail: p.detalhe ? truncar(redigirTexto(p.detalhe), 2000) : null,
    entity_type: p.entidade?.tipo ?? null,
    entity_id: p.entidade?.id ?? null,
    dedupe_key: p.dedupeKey ?? null,
    payload: redigir(p.payload ?? {}),
    priority: p.prioridade ?? 50,
  };
  const { error } = await mlDb().from("ml_tasks").insert(linha);
  if (error?.code === "23505" && p.dedupeKey) {
    // Já existe aberta: atualiza o detalhe (última ocorrência) sem duplicar.
    await mlDb()
      .from("ml_tasks")
      .update({ detail: linha.detail, payload: linha.payload, title: linha.title })
      .eq("dedupe_key", p.dedupeKey)
      .in("status", ["open", "snoozed"]);
  } else if (error) {
    console.error("[ml] falha ao abrir pendência", error.message);
  }
}

/** Fecha pendências abertas por chave (ex.: reconectou a integração). */
export async function resolverPendenciasPorChave(dedupeKey: string, userId: string | null = null): Promise<void> {
  await mlDb()
    .from("ml_tasks")
    .update({ status: "done", resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("dedupe_key", dedupeKey)
    .in("status", ["open", "snoozed"]);
}

export async function resolverPendenciasDaEntidade(tipo: string, id: string, tipos?: TipoPendencia[]): Promise<void> {
  let q = mlDb()
    .from("ml_tasks")
    .update({ status: "done", resolved_at: new Date().toISOString() })
    .eq("entity_type", tipo)
    .eq("entity_id", id)
    .in("status", ["open", "snoozed"]);
  if (tipos?.length) q = q.in("type", tipos);
  await q;
}
