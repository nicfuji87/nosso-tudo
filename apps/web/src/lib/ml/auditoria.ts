import "server-only";
import { mlDb } from "./db";
import { contextoAtual } from "./contexto";
import { redigir } from "./redacao";
import type { Entidade } from "./estados";

/**
 * Auditoria (spec §1.1/§24/§28): alterações administrativas, publicações e
 * TODA decisão automática com motivo e metadados. Nunca derruba a operação.
 */
export interface EntradaAuditoria {
  acao: string;
  entidade?: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
  actorType?: "user" | "system" | "automation";
}

export async function auditar(e: EntradaAuditoria): Promise<void> {
  const ctx = contextoAtual();
  try {
    await mlDb()
      .from("ml_audit_log")
      .insert({
        action: e.acao,
        entity_type: e.entidade ?? null,
        entity_id: e.entidadeId ?? null,
        before: e.antes === undefined ? null : redigir(e.antes),
        after: e.depois === undefined ? null : redigir(e.depois),
        metadata: redigir({ ...(e.metadata ?? {}), ...(ctx.jobId ? { job_id: ctx.jobId } : {}) }),
        actor_id: e.actorId ?? ctx.actorId ?? null,
        actor_type: e.actorType ?? ctx.actorType,
      });
  } catch (err) {
    console.error("[ml] falha ao auditar", e.acao, err);
  }
}

export async function registrarTransicao(p: {
  entidade: Entidade;
  id: string;
  de: string | null;
  para: string;
  motivo?: string | null;
  actorId?: string | null;
  actorType?: "user" | "system" | "automation";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (p.de === p.para) return;
  const ctx = contextoAtual();
  try {
    await mlDb()
      .from("ml_status_history")
      .insert({
        entity_type: p.entidade,
        entity_id: p.id,
        from_status: p.de,
        to_status: p.para,
        reason: p.motivo ?? null,
        actor_type: p.actorType ?? ctx.actorType,
        actor_id: p.actorId ?? ctx.actorId ?? null,
        metadata: p.metadata ? redigir(p.metadata) : null,
      });
  } catch (err) {
    console.error("[ml] falha ao registrar transição", err);
  }
}
