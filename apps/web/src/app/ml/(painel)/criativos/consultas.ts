"use server";

import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { createClient } from "@/lib/supabase/server";

/**
 * Leituras sob demanda do editor de criativos (só leitura, cliente do usuário ⇒ RLS).
 * Ficam fora de `actions.ts` porque não alteram nada.
 */

export interface RevisaoHistorico {
  id: number;
  reason: string;
  created_at: string;
  headline: string | null;
  title: string | null;
}

export interface AssetHistorico {
  id: string;
  public_url: string;
  mode: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export async function historicoCriativo(creativeId: string) {
  return executarAcao("viewer", async () => {
    const id = z.string().uuid().parse(creativeId);
    const supabase = createClient();
    const [rev, ass] = await Promise.all([
      supabase
        .from("ml_creative_revisions")
        .select("id, reason, snapshot, created_at")
        .eq("creative_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ml_creative_assets")
        .select("id, public_url, mode, width, height, created_at")
        .eq("creative_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const revisoes: RevisaoHistorico[] = ((rev.data ?? []) as { id: number; reason: string; snapshot: unknown; created_at: string }[]).map((r) => {
      const s = (r.snapshot ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        reason: r.reason,
        created_at: r.created_at,
        headline: typeof s.headline === "string" ? s.headline : null,
        title: typeof s.title === "string" ? s.title : null,
      };
    });
    return { revisoes, assets: (ass.data ?? []) as AssetHistorico[] };
  });
}

export interface MidiaReferencia {
  id: string;
  public_url: string;
  media_role: string;
  reference_priority: number | null;
  sort_order: number;
  width: number | null;
  height: number | null;
  source_type: string;
}

/** Imagens do anúncio já no Storage (V2 — lado a lado e "Trocar referência"). */
export async function midiasProduto(productId: string) {
  return executarAcao("viewer", async () => {
    const id = z.string().uuid().parse(productId);
    const { data } = await createClient()
      .from("ml_product_media")
      .select("id, public_url, media_role, reference_priority, sort_order, width, height, source_type")
      .eq("product_id", id)
      .eq("status", "ready")
      .not("public_url", "is", null)
      .order("sort_order", { ascending: true })
      .limit(60);
    return { midias: (data ?? []) as MidiaReferencia[] };
  });
}

/** Tipo de cada asset do histórico (V2: base = sem texto, final, background = cenário). */
export async function tiposAssets(creativeId: string) {
  return executarAcao("viewer", async () => {
    const id = z.string().uuid().parse(creativeId);
    const { data } = await createClient().from("ml_creative_assets").select("id, kind").eq("creative_id", id).limit(100);
    return { tipos: Object.fromEntries(((data ?? []) as { id: string; kind: string }[]).map((a) => [a.id, a.kind])) as Record<string, string> };
  });
}
