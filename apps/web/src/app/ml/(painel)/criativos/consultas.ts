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
