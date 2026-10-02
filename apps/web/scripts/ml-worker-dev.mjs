// Worker do módulo ML em DESENVOLVIMENTO: faz o papel do pg_cron (que só alcança
// o domínio publicado) chamando o /api/ml/worker local em intervalo fixo.
// Uso (com `pnpm dev` rodando): pnpm ml:worker [--url http://localhost:3000] [--intervalo 20]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(raiz, ".env.local");
if (existsSync(envFile)) {
  for (const linha of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};
const base = arg("url", "http://localhost:3000").replace(/\/$/, "");
const intervalo = Number(arg("intervalo", "20")) * 1000;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("[ml:worker] Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local");
  process.exit(1);
}

async function segredo() {
  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/ml_secret_get`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_name: "ml/worker/secret" }),
  });
  if (!r.ok) throw new Error(`Falha ao ler o segredo do worker (HTTP ${r.status})`);
  return r.json();
}

const s = await segredo();
console.log(`[ml:worker] batendo em ${base}/api/ml/worker a cada ${intervalo / 1000}s (Ctrl+C para parar)`);
for (;;) {
  const inicio = Date.now();
  try {
    const r = await fetch(`${base}/api/ml/worker`, {
      method: "POST",
      headers: { "x-ml-worker-secret": s, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "dev" }),
    });
    const corpo = await r.json().catch(() => ({}));
    const e = corpo.executados ?? {};
    const total = Object.values(e).reduce((a, b) => a + b, 0);
    console.log(
      `[${new Date().toLocaleTimeString("pt-BR")}] HTTP ${r.status} · jobs ${total} ${JSON.stringify(e)} · agendamentos ${corpo.agendamentos?.disparados ?? 0} · ${corpo.duracaoMs ?? "?"}ms${corpo.error ? ` · erro: ${corpo.error}` : ""}`,
    );
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString("pt-BR")}] app indisponível: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, Math.max(1000, intervalo - (Date.now() - inicio))));
}
