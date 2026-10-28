import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rodarBatida } from "@/lib/viagens/rotina";

/**
 * Batida da rotina diária de viagens. Chamada pelo pg_cron (`viagem_cron_disparar`,
 * a cada 5 min entre 09h e 11h UTC). Autenticada pelo segredo gerado no Vault
 * (header x-viagens-cron-secret). Cada batida só faz o que está pendente no dia.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

let cache: { valor: string; em: number } | null = null;

async function segredo(): Promise<string | null> {
  if (cache && Date.now() - cache.em < 300_000) return cache.valor;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("viagem_secret_get", { p_name: "viagens/cron/secret" });
  if (error) throw new Error(error.message);
  const v = (data as string | null) ?? null;
  if (v) cache = { valor: v, em: Date.now() };
  return v;
}

function autorizado(req: NextRequest, esperado: string | null): boolean {
  const enviado = req.headers.get("x-viagens-cron-secret");
  if (!esperado || !enviado) return false;
  const a = Buffer.from(enviado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let esperado: string | null = null;
  try {
    esperado = await segredo();
  } catch (e) {
    console.error("[viagens/cron] falha ao ler segredo", e);
    return NextResponse.json({ error: "indisponível" }, { status: 503 });
  }
  if (!autorizado(req, esperado)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  try {
    const resumo = await rodarBatida({ orcamentoMs: 240_000, origem: "pg_cron" });
    return NextResponse.json(resumo);
  } catch (e) {
    console.error("[viagens/cron] erro não tratado", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
