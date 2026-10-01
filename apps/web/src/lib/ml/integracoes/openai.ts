import "server-only";
import type { ZodType } from "zod";
import { chamarApi } from "../http";
import { gravarSegredo, lerSegredo, mascarar } from "../segredos";
import { ErroPermanente } from "../jobs/erros";
import { atualizarIntegracao, lerIntegracao, mesclarHints } from "./estado";

/**
 * Adapter OpenAI (opcional). Texto via Responses API com JSON Schema strict +
 * validação Zod (a saída da IA nunca é aceita "crua"). Imagem via Images API.
 */
const PROVIDER = "openai";
const API = "https://api.openai.com/v1";

export async function chave(): Promise<string | null> {
  return lerSegredo(PROVIDER, "api_key");
}

export async function configurada(): Promise<boolean> {
  const integ = await lerIntegracao(PROVIDER);
  return integ.status === "connected" && Boolean(await chave());
}

async function chaveObrigatoria(): Promise<string> {
  const k = await chave();
  if (!k) throw new ErroPermanente("OpenAI não configurada (Integrações › OpenAI).");
  return k;
}

export async function salvarChave(apiKey: string | null): Promise<{ ok: boolean; erro?: string; modelos?: string[] }> {
  if (!apiKey) {
    await gravarSegredo(PROVIDER, "api_key", null);
    await mesclarHints(PROVIDER, { api_key: null });
    await atualizarIntegracao(PROVIDER, { status: "disconnected", last_error: null, connected_at: null });
    return { ok: true };
  }
  const teste = await listarModelos(apiKey.trim());
  if (!teste.ok) return { ok: false, erro: teste.erro };
  await gravarSegredo(PROVIDER, "api_key", apiKey.trim());
  await mesclarHints(PROVIDER, { api_key: mascarar(apiKey.trim()) });
  await atualizarIntegracao(PROVIDER, {
    status: "connected",
    connected_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_error: null,
  });
  return { ok: true, modelos: teste.modelos };
}

export async function listarModelos(apiKey?: string): Promise<{ ok: true; modelos: string[] } | { ok: false; erro: string }> {
  try {
    const k = apiKey ?? (await chaveObrigatoria());
    const { data } = await chamarApi<{ data?: { id: string }[] }>({
      provider: PROVIDER,
      operation: "models.list",
      url: `${API}/models`,
      headers: { Authorization: `Bearer ${k}` },
      timeoutMs: 15_000,
    });
    const modelos = (data.data ?? []).map((m) => m.id).sort();
    return { ok: true, modelos };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function testarConexao(): Promise<{ ok: true; conta: string } | { ok: false; erro: string }> {
  const r = await listarModelos();
  await atualizarIntegracao(PROVIDER, {
    last_checked_at: new Date().toISOString(),
    status: r.ok ? "connected" : "invalid",
    last_error: r.ok ? null : r.erro,
  });
  if (r.ok) await mesclarConfigModelos(r.modelos);
  return r.ok ? { ok: true, conta: `${r.modelos.length} modelos disponíveis` } : r;
}

async function mesclarConfigModelos(modelos: string[]): Promise<void> {
  const integ = await lerIntegracao(PROVIDER);
  const relevantes = modelos.filter((m) => /^(gpt|o\d|chatgpt)/.test(m)).slice(0, 200);
  await atualizarIntegracao(PROVIDER, { config: { ...integ.config, modelos: relevantes } });
}

// ---------------------------------------------------------------------------
// Texto estruturado
// ---------------------------------------------------------------------------
export type ParteEntrada = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" };

interface RespostaResponses {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

export interface ResultadoIA<T> {
  dados: T;
  modelo: string;
  uso: { entrada: number; saida: number };
}

export async function gerarJson<T>(p: {
  modelo: string;
  nomeSchema: string;
  jsonSchema: Record<string, unknown>;
  validador: ZodType<T>;
  instrucoes: string;
  entrada: ParteEntrada[];
  esforco?: "minimal" | "low" | "medium";
  maxTokens?: number;
}): Promise<ResultadoIA<T>> {
  const k = await chaveObrigatoria();
  const { data } = await chamarApi<RespostaResponses>({
    provider: PROVIDER,
    operation: `responses.${p.nomeSchema}`,
    method: "POST",
    url: `${API}/responses`,
    headers: { Authorization: `Bearer ${k}` },
    timeoutMs: 90_000,
    json: {
      model: p.modelo,
      instructions: p.instrucoes,
      input: [{ role: "user", content: p.entrada }],
      text: { format: { type: "json_schema", name: p.nomeSchema, schema: p.jsonSchema, strict: true } },
      reasoning: { effort: p.esforco ?? "low" },
      max_output_tokens: p.maxTokens ?? 4000,
      store: false,
    },
  });

  let texto = "";
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "refusal") throw new ErroPermanente(`A IA recusou: ${c.refusal ?? "sem motivo"}`);
      if (c.type === "output_text" && c.text) texto += c.text;
    }
  }
  if (!texto) {
    throw new Error(`Resposta vazia da IA${data.incomplete_details?.reason ? ` (${data.incomplete_details.reason})` : ""}.`);
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error("A IA devolveu JSON inválido.");
  }
  const validado = p.validador.safeParse(bruto);
  if (!validado.success) {
    throw new Error(`Saída da IA fora do schema: ${validado.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return {
    dados: validado.data,
    modelo: data.model ?? p.modelo,
    uso: { entrada: data.usage?.input_tokens ?? 0, saida: data.usage?.output_tokens ?? 0 },
  };
}

// ---------------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------------
export async function gerarImagem(p: {
  modelo: string;
  prompt: string;
  qualidade: "low" | "medium" | "high";
  referencia?: { bytes: Buffer; mime: string } | null;
  /** V2: várias referências (a primeira é a principal). */
  referencias?: { bytes: Buffer; mime: string }[];
}): Promise<{ bytes: Buffer; mime: string; modelo: string; uso: Record<string, unknown> | null }> {
  const k = await chaveObrigatoria();
  let data: { data?: { b64_json?: string }[]; usage?: Record<string, unknown> };
  const refs = p.referencias?.length ? p.referencias.slice(0, 8) : p.referencia ? [p.referencia] : [];
  if (refs.length) {
    const form = new FormData();
    form.set("model", p.modelo);
    form.set("prompt", p.prompt);
    form.set("size", "1024x1536");
    form.set("quality", p.qualidade);
    form.set("output_format", "png");
    for (const [i, r] of refs.entries()) {
      const ext = r.mime.split("/")[1] ?? "png";
      form.append("image[]", new Blob([new Uint8Array(r.bytes)], { type: r.mime }), `referencia-${i + 1}.${ext}`);
    }
    ({ data } = await chamarApi({
      provider: PROVIDER,
      operation: "images.edits",
      method: "POST",
      url: `${API}/images/edits`,
      headers: { Authorization: `Bearer ${k}` },
      body: form,
      timeoutMs: 240_000,
    }));
  } else {
    ({ data } = await chamarApi({
      provider: PROVIDER,
      operation: "images.generations",
      method: "POST",
      url: `${API}/images/generations`,
      headers: { Authorization: `Bearer ${k}` },
      json: { model: p.modelo, prompt: p.prompt, size: "1024x1536", quality: p.qualidade, output_format: "png", n: 1 },
      timeoutMs: 240_000,
    }));
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("A API de imagem não devolveu imagem.");
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png", modelo: p.modelo, uso: data.usage ?? null };
}
