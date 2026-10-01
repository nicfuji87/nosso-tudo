import "server-only";
import { chamarApi } from "../http";
import { gravarSegredo, lerSegredo, mascarar } from "../segredos";
import { ErroAguardar, ErroPermanente } from "../jobs/erros";
import { atualizarIntegracao, lerIntegracao, mesclarHints } from "./estado";

/**
 * Adapter Apify (opcional, complementar — ADR-ML-009). Actors de terceiros têm
 * schema instável: o app guarda actor + template de input e lê a saída de forma
 * defensiva (campos comuns de rating/vendas/preço), sem nunca ser obrigatório.
 */
const PROVIDER = "apify";
const API = "https://api.apify.com/v2";

export const ACTOR_SUGERIDO = "karamelo~mercadolivre-scraper-brasil-portugues";
export const TEMPLATE_SUGERIDO = '{"keyword": "{{titulo}}", "maxPages": 1}';

export async function configurada(): Promise<boolean> {
  const integ = await lerIntegracao(PROVIDER);
  return integ.status === "connected" && Boolean(integ.config.actor_id) && Boolean(await lerSegredo(PROVIDER, "token"));
}

async function token(): Promise<string> {
  const t = await lerSegredo(PROVIDER, "token");
  if (!t) throw new ErroPermanente("Apify não configurado (Integrações › Apify).");
  return t;
}

export async function validarToken(t: string): Promise<{ ok: true; usuario: string } | { ok: false; erro: string }> {
  try {
    const { data } = await chamarApi<{ data?: { username?: string } }>({
      provider: PROVIDER,
      operation: "users.me",
      url: `${API}/users/me`,
      headers: { Authorization: `Bearer ${t}` },
      timeoutMs: 15_000,
    });
    return { ok: true, usuario: data.data?.username ?? "conta Apify" };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function salvarConfig(p: { token?: string | null; actorId?: string; inputTemplate?: string }): Promise<{ ok: boolean; erro?: string }> {
  if (p.inputTemplate) {
    try {
      JSON.parse(p.inputTemplate.replace(/\{\{\w+\}\}/g, "x"));
    } catch {
      return { ok: false, erro: "O template de input precisa ser um JSON válido." };
    }
  }
  if (p.token === null) {
    await gravarSegredo(PROVIDER, "token", null);
    await mesclarHints(PROVIDER, { token: null });
    await atualizarIntegracao(PROVIDER, { status: "disconnected", account_name: null, connected_at: null });
  } else if (p.token) {
    const v = await validarToken(p.token.trim());
    if (!v.ok) return { ok: false, erro: v.erro };
    await gravarSegredo(PROVIDER, "token", p.token.trim());
    await mesclarHints(PROVIDER, { token: mascarar(p.token.trim()) });
    await atualizarIntegracao(PROVIDER, {
      status: "connected",
      account_name: v.usuario,
      connected_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      last_error: null,
    });
  }
  const integ = await lerIntegracao(PROVIDER);
  await atualizarIntegracao(PROVIDER, {
    config: {
      ...integ.config,
      ...(p.actorId !== undefined ? { actor_id: p.actorId.trim() } : {}),
      ...(p.inputTemplate !== undefined ? { input_template: p.inputTemplate } : {}),
    },
  });
  return { ok: true };
}

export async function testarConexao(): Promise<{ ok: true; conta: string } | { ok: false; erro: string }> {
  try {
    const t = await token();
    const v = await validarToken(t);
    if (!v.ok) {
      await atualizarIntegracao(PROVIDER, { status: "invalid", last_error: v.erro, last_checked_at: new Date().toISOString() });
      return v;
    }
    const integ = await lerIntegracao(PROVIDER);
    const actor = integ.config.actor_id as string | undefined;
    if (actor) {
      await chamarApi({
        provider: PROVIDER,
        operation: "actors.get",
        url: `${API}/actors/${encodeURIComponent(actor)}`,
        headers: { Authorization: `Bearer ${t}` },
        timeoutMs: 15_000,
      });
    }
    await atualizarIntegracao(PROVIDER, { status: "connected", last_error: null, last_checked_at: new Date().toISOString() });
    return { ok: true, conta: `${v.usuario}${actor ? ` · actor ${actor} OK` : " · defina o Actor"}` };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await atualizarIntegracao(PROVIDER, { last_error: erro, last_checked_at: new Date().toISOString() });
    return { ok: false, erro };
  }
}

export function montarInput(template: string, vars: Record<string, string>): Record<string, unknown> {
  const texto = template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => JSON.stringify(vars[k] ?? "").slice(1, -1));
  return JSON.parse(texto) as Record<string, unknown>;
}

/**
 * Executa o actor de forma assíncrona e retomável: se o run não terminou no
 * tempo do job, lança ErroAguardar e o job retoma o MESMO run (runId salvo no progresso).
 */
export async function rodarActor(p: {
  vars: Record<string, string>;
  runIdExistente?: string | null;
  salvarRunId: (runId: string) => Promise<void>;
  maxItens?: number;
}): Promise<Record<string, unknown>[]> {
  const t = await token();
  const integ = await lerIntegracao(PROVIDER);
  const actor = integ.config.actor_id as string | undefined;
  if (!actor) throw new ErroPermanente("Defina o Actor do Apify em Integrações.");
  const auth = { Authorization: `Bearer ${t}` };

  let runId = p.runIdExistente ?? null;
  if (!runId) {
    const input = montarInput((integ.config.input_template as string) || TEMPLATE_SUGERIDO, p.vars);
    const { data } = await chamarApi<{ data: { id: string } }>({
      provider: PROVIDER,
      operation: "actors.run",
      method: "POST",
      url: `${API}/actors/${encodeURIComponent(actor)}/runs?timeout=240&maxItems=${p.maxItens ?? 10}`,
      headers: auth,
      json: input,
    });
    runId = data.data.id;
    await p.salvarRunId(runId);
  }

  const { data: run } = await chamarApi<{ data: { status: string; defaultDatasetId: string; statusMessage?: string } }>({
    provider: PROVIDER,
    operation: "runs.get",
    url: `${API}/actor-runs/${runId}?waitForFinish=50`,
    headers: auth,
    timeoutMs: 70_000,
  });
  const st = run.data.status;
  if (st === "READY" || st === "RUNNING") throw new ErroAguardar("Actor do Apify ainda executando.", 60_000);
  if (st !== "SUCCEEDED") throw new ErroPermanente(`Actor terminou como ${st}${run.data.statusMessage ? `: ${run.data.statusMessage}` : ""}`);

  const { data: itens } = await chamarApi<Record<string, unknown>[]>({
    provider: PROVIDER,
    operation: "datasets.items",
    url: `${API}/datasets/${run.data.defaultDatasetId}/items?clean=true&format=json&limit=${p.maxItens ?? 10}`,
    headers: auth,
  });
  return Array.isArray(itens) ? itens : [];
}

/** Extrai sinais comuns de qualquer actor de ML, sem confiar no schema. */
export function extrairSinais(item: Record<string, unknown>): {
  rating: number | null;
  reviews: number | null;
  vendidos: number | null;
  preco: number | null;
} {
  const num = (...chaves: string[]): number | null => {
    for (const c of chaves) {
      const v = item[c];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) : NaN;
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const rating = num("rating", "ratingAverage", "rating_average", "stars", "reviewRating");
  return {
    rating: rating != null && rating >= 0 && rating <= 5 ? rating : null,
    reviews: num("reviewsCount", "reviews", "ratingCount", "reviewCount", "totalReviews"),
    vendidos: num("soldQuantity", "sold", "vendidos", "unitsSold", "sold_quantity"),
    preco: num("price", "preco", "currentPrice"),
  };
}
