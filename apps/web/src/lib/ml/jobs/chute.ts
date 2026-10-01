import "server-only";
import { headers } from "next/headers";
import { segredoWorker } from "../segredos";
import { lerConfig } from "../config";

/**
 * "Chute" no worker logo após uma ação do usuário — o job começa em segundos
 * em vez de esperar a próxima batida do pg_cron. Fire-and-forget: só espera o
 * request sair (o worker segue rodando na própria função).
 */
export async function chutarWorker(): Promise<void> {
  try {
    const segredo = await segredoWorker();
    if (!segredo) return;
    let base: string | null = null;
    try {
      const h = headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
      if (host) base = `${proto}://${host}`;
    } catch {
      /* fora de request (job) */
    }
    base ??= (await lerConfig("runtime")).app_url;
    if (!base) return;
    await fetch(`${base.replace(/\/$/, "")}/api/ml/worker`, {
      method: "POST",
      headers: { "x-ml-worker-secret": segredo, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "kick" }),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    }).catch(() => undefined);
  } catch {
    /* o pg_cron cobre em até 1 min */
  }
}
