import "server-only";
import { mlDb } from "./db";
import { contextoAtual } from "./contexto";
import { redigirTexto, truncar, urlSegura } from "./redacao";

/**
 * Cliente HTTP único para APIs externas: timeout, classificação de erro
 * (auth / rate limit / servidor / cliente / rede), Retry-After e log em
 * ml_api_calls SEM segredos (URL sem query, sem headers).
 */

export type TipoErroApi = "auth" | "rate_limit" | "quota" | "server" | "client" | "network" | "timeout" | "not_found";

export class ErroApiExterna extends Error {
  constructor(
    public provider: string,
    public operation: string,
    public status: number | null,
    public tipo: TipoErroApi,
    mensagem: string,
    public retryAfterMs: number | null = null,
    public requestId: string | null = null,
    public corpo: string | null = null,
  ) {
    super(mensagem);
    this.name = "ErroApiExterna";
  }
  get retentavel(): boolean {
    return this.tipo === "rate_limit" || this.tipo === "server" || this.tipo === "network" || this.tipo === "timeout";
  }
}

export interface Requisicao {
  provider: string;
  operation: string;
  url: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "HEAD";
  headers?: Record<string, string>;
  json?: unknown;
  body?: BodyInit;
  timeoutMs?: number;
  /** Não registrar em ml_api_calls (ex.: polling barato). */
  semLog?: boolean;
  redirect?: RequestRedirect;
}

export interface Resposta<T> {
  status: number;
  data: T;
  headers: Headers;
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const s = Number(h);
  if (Number.isFinite(s)) return Math.min(s * 1000, 3_600_000);
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

function classificar(status: number, corpo: string): TipoErroApi {
  if (status === 401) return "auth";
  if (status === 403) return /scope|permission|forbidden|insufficient/i.test(corpo) ? "auth" : "client";
  if (status === 404) return "not_found";
  if (status === 429) {
    return /quota|credit_balance|spend_limit|usage_limit|billing/i.test(corpo) ? "quota" : "rate_limit";
  }
  if (status === 408) return "timeout";
  if (status >= 500) return "server";
  return "client";
}

async function registrar(
  req: Requisicao,
  status: number | null,
  inicio: number,
  requestId: string | null,
  erro: string | null,
): Promise<void> {
  if (req.semLog) return;
  try {
    await mlDb()
      .from("ml_api_calls")
      .insert({
        provider: req.provider,
        operation: req.operation,
        method: req.method ?? "GET",
        url: urlSegura(req.url),
        status,
        duration_ms: Date.now() - inicio,
        request_id: requestId,
        error: erro ? truncar(redigirTexto(erro), 500) : null,
        job_id: contextoAtual().jobId ?? null,
      });
  } catch {
    // log de observabilidade nunca derruba a operação principal
  }
}

export async function chamarApi<T = unknown>(req: Requisicao): Promise<Resposta<T>> {
  const inicio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
  const headers: Record<string, string> = { Accept: "application/json", ...(req.headers ?? {}) };
  let body = req.body;
  if (req.json !== undefined) {
    body = JSON.stringify(req.json);
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
      redirect: req.redirect ?? "follow",
    });
  } catch (e) {
    clearTimeout(timer);
    const abort = e instanceof Error && e.name === "AbortError";
    const msg = abort ? `Tempo esgotado (${req.timeoutMs ?? 30_000} ms)` : `Falha de rede: ${(e as Error).message}`;
    await registrar(req, null, inicio, null, msg);
    throw new ErroApiExterna(req.provider, req.operation, null, abort ? "timeout" : "network", msg);
  }
  clearTimeout(timer);

  const requestId =
    res.headers.get("x-request-id") ?? res.headers.get("x-pinterest-rid") ?? res.headers.get("x-correlation-id");
  const texto = await res.text();

  if (!res.ok) {
    const tipo = classificar(res.status, texto);
    const corpo = truncar(redigirTexto(texto), 1500);
    let mensagem = `${req.provider} ${req.operation}: HTTP ${res.status}`;
    try {
      const j = JSON.parse(texto) as Record<string, unknown>;
      const m = (j.message ?? (j.error as Record<string, unknown> | undefined)?.message ?? j.error_description ?? j.error) as unknown;
      if (typeof m === "string") mensagem += ` — ${redigirTexto(m)}`;
    } catch {
      /* corpo não-JSON */
    }
    await registrar(req, res.status, inicio, requestId, mensagem);
    throw new ErroApiExterna(
      req.provider,
      req.operation,
      res.status,
      tipo,
      mensagem,
      parseRetryAfter(res.headers.get("retry-after")),
      requestId,
      corpo,
    );
  }

  await registrar(req, res.status, inicio, requestId, null);
  let data: unknown = texto;
  if (texto && (res.headers.get("content-type") ?? "").includes("json")) {
    try {
      data = JSON.parse(texto);
    } catch {
      data = texto;
    }
  } else if (!texto) {
    data = null;
  }
  return { status: res.status, data: data as T, headers: res.headers };
}

// ---------------------------------------------------------------------------
// SSRF: só busca server-side em hosts permitidos (spec §24)
// ---------------------------------------------------------------------------
export function hostPermitido(url: string, permitidos: string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host === "localhost") return false;
  return permitidos.some((p) => host === p || host.endsWith(`.${p}`));
}

export const HOSTS_IMAGEM_PERMITIDOS = ["mlstatic.com", "supabase.co", "mercadolivre.com.br", "mercadolibre.com"];
