import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { segredoWorker } from "@/lib/ml/segredos";
import { rodarBatida } from "@/lib/ml/jobs/worker";

/**
 * Batida do worker do ML. Chamado pelo pg_cron (1/min, `ml_cron_tick`), pelo
 * "chute" após ações do usuário e pelo `pnpm ml:worker` em dev. Autenticado
 * pelo segredo gerado no Vault (header x-ml-worker-secret).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(req: NextRequest, segredo: string | null): boolean {
  const enviado = req.headers.get("x-ml-worker-secret");
  if (!segredo || !enviado) return false;
  const a = Buffer.from(enviado);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let segredo: string | null = null;
  try {
    segredo = await segredoWorker();
  } catch (e) {
    console.error("[ml/worker] falha ao ler segredo", e);
    return NextResponse.json({ error: "indisponível" }, { status: 503 });
  }
  if (!autorizado(req, segredo)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  try {
    const resumo = await rodarBatida({ orcamentoMs: 50_000 });
    return NextResponse.json(resumo);
  } catch (e) {
    console.error("[ml/worker] erro não tratado", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
