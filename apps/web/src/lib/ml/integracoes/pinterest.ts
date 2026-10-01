import "server-only";
import { chamarApi, ErroApiExterna } from "../http";
import { gravarSegredo, lerSegredo, mascarar } from "../segredos";
import { ErroPermanente } from "../jobs/erros";
import { abrirPendencia, resolverPendenciasPorChave } from "../servicos/pendencias";
import { atualizarIntegracao, lerIntegracao, mesclarHints } from "./estado";
import { obterTokenValido } from "./tokens";

/**
 * Adapter Pinterest API v5. Ambiente por integração (ADR-ML-013):
 * production → api.pinterest.com · sandbox → api-sandbox.pinterest.com
 * (apps em Trial só publicam no sandbox; analytics não existe no sandbox).
 */
const PROVIDER = "pinterest";
export const ESCOPOS = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];

export type AmbientePinterest = "production" | "sandbox";

export async function ambiente(): Promise<AmbientePinterest> {
  const integ = await lerIntegracao(PROVIDER);
  return integ.config.environment === "sandbox" ? "sandbox" : "production";
}

function base(amb: AmbientePinterest): string {
  return amb === "sandbox" ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export async function urlAutorizacao(p: { state: string; redirectUri: string }): Promise<string> {
  const integ = await lerIntegracao(PROVIDER);
  const clientId = integ.config.client_id as string | undefined;
  if (!clientId) throw new ErroPermanente("Informe o App ID do Pinterest antes de conectar.");
  const u = new URL("https://www.pinterest.com/oauth/");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ESCOPOS.join(","));
  u.searchParams.set("state", p.state);
  return u.toString();
}

interface RespostaToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  refresh_token_expires_at?: number;
  scope?: string;
}

async function basicAuth(): Promise<string> {
  const integ = await lerIntegracao(PROVIDER);
  const clientId = integ.config.client_id as string | undefined;
  const secret = await lerSegredo(PROVIDER, "client_secret");
  if (!clientId || !secret) throw new ErroPermanente("App ID e App secret do Pinterest não configurados (Integrações).");
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

async function salvarTokens(t: RespostaToken): Promise<void> {
  await gravarSegredo(PROVIDER, "access_token", t.access_token);
  if (t.refresh_token) await gravarSegredo(PROVIDER, "refresh_token", t.refresh_token);
  const escopos = t.scope ? t.scope.split(/[\s,]+/).filter(Boolean) : undefined;
  const faltando = escopos ? ESCOPOS.filter((e) => !escopos.includes(e)) : [];
  await atualizarIntegracao(PROVIDER, {
    access_expires_at: new Date(Date.now() + (t.expires_in ?? 30 * 86_400) * 1000).toISOString(),
    refresh_expires_at: t.refresh_token_expires_at
      ? new Date(t.refresh_token_expires_at * 1000).toISOString()
      : t.refresh_token_expires_in
        ? new Date(Date.now() + t.refresh_token_expires_in * 1000).toISOString()
        : undefined,
    last_refresh_at: new Date().toISOString(),
    scopes: escopos,
    status: faltando.length ? "insufficient_scope" : "connected",
    last_error: faltando.length ? `Escopos faltando: ${faltando.join(", ")}` : null,
  });
}

export async function trocarCodigo(code: string, redirectUri: string): Promise<void> {
  const amb = await ambiente();
  const { data } = await chamarApi<RespostaToken>({
    provider: PROVIDER,
    operation: "oauth.token",
    method: "POST",
    url: `${base(amb)}/oauth/token`,
    headers: { Authorization: await basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  await salvarTokens(data);
  await atualizarIntegracao(PROVIDER, { connected_at: new Date().toISOString() });
  await testarConexao();
  await resolverPendenciasPorChave("integration_auth:pinterest");
}

/** Token colado manualmente (ex.: token de sandbox gerado em My Apps, 30 dias, sem refresh). */
export async function salvarTokenManual(token: string, amb: AmbientePinterest): Promise<void> {
  const integ = await lerIntegracao(PROVIDER);
  await atualizarIntegracao(PROVIDER, { config: { ...integ.config, environment: amb } });
  await gravarSegredo(PROVIDER, "access_token", token.trim());
  await gravarSegredo(PROVIDER, "refresh_token", null);
  await atualizarIntegracao(PROVIDER, {
    status: "connected",
    access_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    refresh_expires_at: null,
    connected_at: new Date().toISOString(),
    last_error: null,
  });
  await testarConexao();
}

export async function renovarToken(): Promise<void> {
  const refresh = await lerSegredo(PROVIDER, "refresh_token");
  if (!refresh) {
    await marcarReconexao("O token expirou e não há refresh token (token manual). Gere outro ou conecte via OAuth.");
    throw new ErroPermanente("Token do Pinterest expirado — reconecte em Integrações.");
  }
  const amb = await ambiente();
  try {
    const { data } = await chamarApi<RespostaToken>({
      provider: PROVIDER,
      operation: "oauth.refresh",
      method: "POST",
      url: `${base(amb)}/oauth/token`,
      headers: { Authorization: await basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    });
    await salvarTokens(data);
  } catch (e) {
    if (e instanceof ErroApiExterna && (e.status === 400 || e.status === 401)) {
      await marcarReconexao("A autorização do Pinterest expirou ou foi revogada.");
      throw new ErroPermanente("Autorização do Pinterest expirou — reconecte em Integrações.");
    }
    throw e;
  }
}

async function marcarReconexao(detalhe: string): Promise<void> {
  await atualizarIntegracao(PROVIDER, { status: "error", last_error: detalhe });
  await abrirPendencia({
    tipo: "integration_auth",
    titulo: "Reconectar Pinterest",
    detalhe,
    dedupeKey: "integration_auth:pinterest",
    prioridade: 5,
  });
}

export async function desconectar(): Promise<void> {
  await gravarSegredo(PROVIDER, "access_token", null);
  await gravarSegredo(PROVIDER, "refresh_token", null);
  await atualizarIntegracao(PROVIDER, {
    status: "disconnected",
    account_id: null,
    account_name: null,
    access_expires_at: null,
    refresh_expires_at: null,
    connected_at: null,
    last_error: null,
    scopes: [],
  });
}

export async function salvarCredenciaisApp(p: { clientId: string; clientSecret?: string; ambiente: AmbientePinterest }): Promise<void> {
  const integ = await lerIntegracao(PROVIDER);
  await atualizarIntegracao(PROVIDER, {
    config: { ...integ.config, client_id: p.clientId.trim(), environment: p.ambiente },
  });
  if (p.clientSecret) {
    await gravarSegredo(PROVIDER, "client_secret", p.clientSecret.trim());
    await mesclarHints(PROVIDER, { client_secret: mascarar(p.clientSecret.trim()) });
  }
}

// ---------------------------------------------------------------------------
// Chamadas autenticadas
// ---------------------------------------------------------------------------
async function api<T>(
  operation: string,
  caminho: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; json?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const amb = await ambiente();
  const chamar = async (token: string) =>
    (
      await chamarApi<T>({
        provider: PROVIDER,
        operation,
        method: init.method ?? "GET",
        url: `${base(amb)}${caminho}`,
        headers: { Authorization: `Bearer ${token}` },
        json: init.json,
        timeoutMs: init.timeoutMs ?? 30_000,
      })
    ).data;
  const token = await obterTokenValido(PROVIDER, renovarToken, 2 * 86_400_000);
  try {
    return await chamar(token);
  } catch (e) {
    if (e instanceof ErroApiExterna && e.status === 401 && (await lerSegredo(PROVIDER, "refresh_token"))) {
      await atualizarIntegracao(PROVIDER, { access_expires_at: new Date(0).toISOString() });
      return chamar(await obterTokenValido(PROVIDER, renovarToken));
    }
    throw e;
  }
}

export interface ContaPinterest {
  id?: string;
  username?: string;
  account_type?: string;
  business_name?: string | null;
  profile_image?: string;
}
export const contaAtual = () => api<ContaPinterest>("user_account.get", "/user_account");

export interface BoardPinterest {
  id: string;
  name: string;
  description?: string | null;
  privacy?: string;
  pin_count?: number;
  follower_count?: number;
  media?: { image_cover_url?: string | null } | null;
}

export async function listarBoards(): Promise<BoardPinterest[]> {
  const todos: BoardPinterest[] = [];
  let bookmark: string | null = null;
  // Sandbox pode devolver página vazia com bookmark: segue até acabar (teto de segurança).
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams({ page_size: "250" });
    if (bookmark) qs.set("bookmark", bookmark);
    const r: { items?: BoardPinterest[]; bookmark?: string | null } = await api("boards.list", `/boards?${qs}`);
    todos.push(...(r.items ?? []));
    bookmark = r.bookmark ?? null;
    if (!bookmark) break;
  }
  return todos;
}

export const criarBoard = (p: { name: string; description?: string; privacy?: "PUBLIC" | "SECRET" }) =>
  api<BoardPinterest>("boards.create", "/boards", { method: "POST", json: p });

export interface PinCriado {
  id: string;
  link?: string | null;
  board_id?: string;
  created_at?: string;
}

export { LIMITES, montarPayloadPin, type NovoPin } from "./pinterest-payload";
import { montarPayloadPin, type NovoPin } from "./pinterest-payload";

/**
 * Cria o Pin. Se a conta recusar `ai_disclosures` (campo novo), registra a
 * limitação, mantém o flag interno e repete sem ele — nunca falha o Pin por isso.
 */
export async function criarPin(p: NovoPin): Promise<PinCriado & { aiDisclosureEnviado: boolean }> {
  const integ = await lerIntegracao(PROVIDER);
  const suportado = integ.config.ai_disclosure_suportado !== false;
  const enviar = Boolean(p.ai_modified) && p.enviar_ai_disclosure !== false && suportado;
  try {
    const r = await api<PinCriado>("pins.create", "/pins", {
      method: "POST",
      json: montarPayloadPin({ ...p, enviar_ai_disclosure: enviar }),
      timeoutMs: 60_000,
    });
    return { ...r, aiDisclosureEnviado: enviar };
  } catch (e) {
    if (enviar && e instanceof ErroApiExterna && e.status === 400 && /ai_disclosure/i.test(`${e.message} ${e.corpo ?? ""}`)) {
      await atualizarIntegracao(PROVIDER, { config: { ...integ.config, ai_disclosure_suportado: false } });
      const r = await api<PinCriado>("pins.create", "/pins", {
        method: "POST",
        json: montarPayloadPin({ ...p, enviar_ai_disclosure: false }),
        timeoutMs: 60_000,
      });
      return { ...r, aiDisclosureEnviado: false };
    }
    throw e;
  }
}

/** Pins recentes do board — usado para não duplicar após falha ambígua (timeout). */
export async function pinsRecentesDoBoard(boardId: string): Promise<PinCriado[]> {
  const r = await api<{ items?: PinCriado[] }>("boards.pins", `/boards/${encodeURIComponent(boardId)}/pins?page_size=50`);
  return r.items ?? [];
}

export interface MetricasDia {
  date: string;
  data_status?: string;
  metrics: Partial<Record<"IMPRESSION" | "SAVE" | "PIN_CLICK" | "OUTBOUND_CLICK", number>>;
}

export async function metricasPin(pinId: string, inicio: string, fim: string): Promise<MetricasDia[]> {
  const qs = new URLSearchParams({
    start_date: inicio,
    end_date: fim,
    metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK",
    app_types: "ALL",
    split_field: "NO_SPLIT",
  });
  const r = await api<Record<string, { daily_metrics?: MetricasDia[] }>>(
    "pins.analytics",
    `/pins/${encodeURIComponent(pinId)}/analytics?${qs}`,
  );
  const bloco = r.all ?? Object.values(r)[0];
  return bloco?.daily_metrics ?? [];
}

export async function testarConexao(): Promise<{ ok: true; conta: string } | { ok: false; erro: string }> {
  try {
    const c = await contaAtual();
    const integ = await lerIntegracao(PROVIDER);
    await atualizarIntegracao(PROVIDER, {
      last_checked_at: new Date().toISOString(),
      account_id: c.id ?? c.username ?? null,
      account_name: c.username ?? c.business_name ?? null,
      status: integ.status === "insufficient_scope" ? "insufficient_scope" : "connected",
      config: { ...integ.config, account_type: c.account_type ?? null },
      last_error: integ.status === "insufficient_scope" ? integ.last_error : null,
    });
    return { ok: true, conta: c.username ?? c.business_name ?? "conta conectada" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await atualizarIntegracao(PROVIDER, { last_checked_at: new Date().toISOString(), last_error: msg });
    return { ok: false, erro: msg };
  }
}
