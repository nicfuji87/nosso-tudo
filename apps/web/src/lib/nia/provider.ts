import "server-only";
import type { NiaWidget } from "@/lib/nia/schemas";
import { getTool, type NiaTool, type NiaToolContext } from "@/lib/nia/tools";

/**
 * Camada provider-agnóstica da Nia. O agente roda com UM provedor por vez,
 * mas o super admin escolhe qual (nia_config) — cada provedor é um adaptador
 * que implementa a mesma interface. Adicionar OpenAI/Google = um novo entry no
 * registro abaixo, sem mexer no resto. Ver PLANO-NIA.md §2.
 */

export interface AnexoConteudo {
  tipo: "imagem" | "pdf";
  mimeType: string;
  base64: string;
}

export interface NiaProviderInput {
  apiKey: string;
  modelo: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  userMessage: string;
  /** Imagem/PDF para multimodal (áudio já vem transcrito no userMessage). */
  anexos?: AnexoConteudo[];
  /** Janela recente da conversa (multi-turn), em ordem cronológica. */
  historico?: { role: "user" | "assistant"; content: string }[];
  tools: NiaTool[];
  ctx: NiaToolContext;
}

/** Conteúdo da 1ª mensagem do usuário no formato Anthropic (texto + imagem/documento). */
function anthropicUserContent(userMessage: string, anexos?: AnexoConteudo[]): string | unknown[] {
  if (!anexos || anexos.length === 0) return userMessage;
  const blocks: unknown[] = anexos.map((a) =>
    a.tipo === "imagem"
      ? { type: "image", source: { type: "base64", media_type: a.mimeType, data: a.base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } },
  );
  if (userMessage) blocks.push({ type: "text", text: userMessage });
  return blocks;
}

/** Conteúdo no formato OpenAI (imagens via data URL; PDF não suportado no Chat Completions). */
function openaiUserContent(userMessage: string, anexos?: AnexoConteudo[]): string | unknown[] {
  if (!anexos || anexos.length === 0) return userMessage;
  const parts: unknown[] = [];
  if (userMessage) parts.push({ type: "text", text: userMessage });
  for (const a of anexos) {
    if (a.tipo === "imagem") {
      parts.push({ type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.base64}` } });
    }
  }
  return parts;
}

export interface NiaProviderResult {
  texto: string;
  widgets: NiaWidget[];
  ferramentas: string[];
  tokensInput: number;
  tokensOutput: number;
  /** Tokens de entrada que vieram do cache (subconjunto de tokensInput). */
  tokensCache: number;
}

export type NiaProvider = (input: NiaProviderInput) => Promise<NiaProviderResult>;

export interface NiaStreamCallbacks {
  onText: (delta: string) => void;
  onWidget: (w: NiaWidget) => void;
}
/** Resultado do streaming (sem widgets: estes são emitidos via onWidget). */
export type NiaStreamResult = Omit<NiaProviderResult, "widgets">;
export type NiaStreamProvider = (
  input: NiaProviderInput,
  cb: NiaStreamCallbacks,
) => Promise<NiaStreamResult>;

const MAX_TURNS = 4;

/* ------------------------------ Anthropic ------------------------------ */

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: unknown;
}
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

const anthropicProvider: NiaProvider = async (input) => {
  const messages: AnthropicMessage[] = [
    ...(input.historico ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: anthropicUserContent(input.userMessage, input.anexos) },
  ];
  const widgets: NiaWidget[] = [];
  const ferramentas: string[] = [];
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCache = 0;
  let textoFinal = "";

  // Prompt caching: marca tools (último bloco) e system como cacheáveis — eles são
  // a parte estática e pesada de toda chamada (RF: custo). Cache read = 0.1x.
  const cacheCtrl = { type: "ephemeral" as const };
  const toolsPayload = input.tools.map((t, i) => ({
    name: t.nome,
    description: t.descricao,
    input_schema: t.inputSchema,
    ...(i === input.tools.length - 1 ? { cache_control: cacheCtrl } : {}),
  }));
  const systemPayload = [{ type: "text", text: input.systemPrompt, cache_control: cacheCtrl }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.modelo,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: systemPayload,
        tools: toolsPayload,
        messages,
      }),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor anthropic retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    tokensInput +=
      (data.usage?.input_tokens ?? 0) +
      (data.usage?.cache_creation_input_tokens ?? 0) +
      (data.usage?.cache_read_input_tokens ?? 0);
    tokensOutput += data.usage?.output_tokens ?? 0;
    tokensCache += data.usage?.cache_read_input_tokens ?? 0;

    const textBlocks = data.content.filter(
      (b): b is AnthropicTextBlock => b.type === "text",
    );
    const toolBlocks = data.content.filter(
      (b): b is AnthropicToolUseBlock => b.type === "tool_use",
    );
    if (textBlocks.length > 0) textoFinal = textBlocks.map((b) => b.text).join("\n").trim();

    if (data.stop_reason !== "tool_use" || toolBlocks.length === 0) break;

    // Executa as ferramentas pedidas e devolve os resultados ao modelo.
    messages.push({ role: "assistant", content: data.content });
    const toolResults: unknown[] = [];
    for (const call of toolBlocks) {
      const tool = getTool(call.name);
      ferramentas.push(call.name);
      let conteudo: string;
      if (!tool) {
        conteudo = `Ferramenta desconhecida: ${call.name}`;
      } else {
        try {
          const r = await tool.executar(call.input, input.ctx);
          conteudo = r.texto;
          if (r.widget) widgets.push(r.widget);
        } catch (e) {
          conteudo = `Erro ao executar ${call.name}: ${(e as Error).message}`;
        }
      }
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: conteudo });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { texto: textoFinal, widgets, ferramentas, tokensInput, tokensOutput, tokensCache };
};

/* ------------------------------ OpenAI ------------------------------ */

interface OpenAIToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}
interface OpenAIMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}
interface OpenAIResponse {
  choices: { message: { content: string | null; tool_calls?: OpenAIToolCall[] }; finish_reason: string }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}
interface OpenAIStreamChunk {
  choices?: {
    delta?: {
      content?: string;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
}

/** Modelos de raciocínio (GPT-5.x, o-series) não aceitam temperature e usam max_completion_tokens. */
function ehRaciocinio(modelo: string): boolean {
  return /^(gpt-5|o[134])/.test(modelo);
}

const openaiProvider: NiaProvider = async (input) => {
  const messages: OpenAIMsg[] = [
    { role: "system", content: input.systemPrompt },
    ...(input.historico ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: openaiUserContent(input.userMessage, input.anexos) },
  ];
  const widgets: NiaWidget[] = [];
  const ferramentas: string[] = [];
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCache = 0;
  let textoFinal = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const body: Record<string, unknown> = {
      model: input.modelo,
      max_completion_tokens: input.maxTokens,
      messages,
      tools: input.tools.map((t) => ({
        type: "function",
        function: { name: t.nome, description: t.descricao, parameters: t.inputSchema },
      })),
    };
    if (!ehRaciocinio(input.modelo)) body.temperature = input.temperature;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor openai retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    tokensInput += data.usage?.prompt_tokens ?? 0;
    tokensOutput += data.usage?.completion_tokens ?? 0;
    tokensCache += data.usage?.prompt_tokens_details?.cached_tokens ?? 0;

    const choice = data.choices[0];
    if (!choice) break;
    if (choice.message.content) textoFinal = choice.message.content.trim();

    const toolCalls = choice.message.tool_calls ?? [];
    if (choice.finish_reason !== "tool_calls" || toolCalls.length === 0) break;

    messages.push({ role: "assistant", content: choice.message.content ?? null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      ferramentas.push(call.function.name);
      const tool = getTool(call.function.name);
      let conteudo: string;
      if (!tool) {
        conteudo = `Ferramenta desconhecida: ${call.function.name}`;
      } else {
        try {
          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }
          const r = await tool.executar(args, input.ctx);
          conteudo = r.texto;
          if (r.widget) widgets.push(r.widget);
        } catch (e) {
          conteudo = `Erro ao executar ${call.function.name}: ${(e as Error).message}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: conteudo });
    }
  }

  return { texto: textoFinal, widgets, ferramentas, tokensInput, tokensOutput, tokensCache };
};

/** OpenAI com streaming (SSE) token-a-token + loop de tool-use. */
const openaiStream: NiaStreamProvider = async (input, cb) => {
  const messages: OpenAIMsg[] = [
    { role: "system", content: input.systemPrompt },
    ...(input.historico ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: openaiUserContent(input.userMessage, input.anexos) },
  ];
  const ferramentas: string[] = [];
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCache = 0;
  let textoFinal = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const body: Record<string, unknown> = {
      model: input.modelo,
      max_completion_tokens: input.maxTokens,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      tools: input.tools.map((t) => ({
        type: "function",
        function: { name: t.nome, description: t.descricao, parameters: t.inputSchema },
      })),
    };
    if (!ehRaciocinio(input.modelo)) body.temperature = input.temperature;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor openai retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantContent = "";
    let finishReason = "";
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();

    let parar = false;
    while (!parar) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          parar = true;
          break;
        }
        let json: OpenAIStreamChunk;
        try {
          json = JSON.parse(payload) as OpenAIStreamChunk;
        } catch {
          continue;
        }
        if (json.usage) {
          tokensInput += json.usage.prompt_tokens ?? 0;
          tokensOutput += json.usage.completion_tokens ?? 0;
          tokensCache += json.usage.prompt_tokens_details?.cached_tokens ?? 0;
        }
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.content) {
          assistantContent += delta.content;
          textoFinal += delta.content;
          cb.onText(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolAcc.set(idx, cur);
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }

    if (finishReason !== "tool_calls" || toolAcc.size === 0) break;

    const toolCalls = [...toolAcc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({ id: v.id, type: "function", function: { name: v.name, arguments: v.args } }));
    messages.push({ role: "assistant", content: assistantContent || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      ferramentas.push(call.function.name);
      const tool = getTool(call.function.name);
      let conteudo: string;
      if (!tool) {
        conteudo = `Ferramenta desconhecida: ${call.function.name}`;
      } else {
        try {
          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }
          const r = await tool.executar(args, input.ctx);
          conteudo = r.texto;
          if (r.widget) cb.onWidget(r.widget);
        } catch (e) {
          conteudo = `Erro ao executar ${call.function.name}: ${(e as Error).message}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: conteudo });
    }
  }

  return { texto: textoFinal, ferramentas, tokensInput, tokensOutput, tokensCache };
};

/** Anthropic com streaming (SSE) token-a-token + loop de tool-use + prompt caching. */
const anthropicStream: NiaStreamProvider = async (input, cb) => {
  const messages: AnthropicMessage[] = [
    ...(input.historico ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: anthropicUserContent(input.userMessage, input.anexos) },
  ];
  const ferramentas: string[] = [];
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCache = 0;
  let textoFinal = "";

  const cacheCtrl = { type: "ephemeral" as const };
  const toolsPayload = input.tools.map((t, i) => ({
    name: t.nome,
    description: t.descricao,
    input_schema: t.inputSchema,
    ...(i === input.tools.length - 1 ? { cache_control: cacheCtrl } : {}),
  }));
  const systemPayload = [{ type: "text", text: input.systemPrompt, cache_control: cacheCtrl }];

  const parseJson = (s?: string): unknown => {
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.modelo,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: systemPayload,
        tools: toolsPayload,
        messages,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor anthropic retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let stopReason = "";
    const blocks = new Map<number, { type: string; text?: string; id?: string; name?: string; json?: string }>();

    let parar = false;
    while (!parar) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let ev: AnthropicStreamEvent;
        try {
          ev = JSON.parse(payload) as AnthropicStreamEvent;
        } catch {
          continue;
        }
        if (ev.type === "message_start") {
          tokensInput +=
            (ev.message?.usage?.input_tokens ?? 0) +
            (ev.message?.usage?.cache_creation_input_tokens ?? 0) +
            (ev.message?.usage?.cache_read_input_tokens ?? 0);
          tokensCache += ev.message?.usage?.cache_read_input_tokens ?? 0;
        } else if (ev.type === "content_block_start" && ev.index != null) {
          if (ev.content_block?.type === "tool_use") {
            blocks.set(ev.index, { type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, json: "" });
          } else if (ev.content_block?.type === "text") {
            blocks.set(ev.index, { type: "text", text: "" });
          }
        } else if (ev.type === "content_block_delta" && ev.index != null) {
          const b = blocks.get(ev.index);
          if (ev.delta?.type === "text_delta" && ev.delta.text) {
            if (b) b.text = (b.text ?? "") + ev.delta.text;
            textoFinal += ev.delta.text;
            cb.onText(ev.delta.text);
          } else if (ev.delta?.type === "input_json_delta" && ev.delta.partial_json != null) {
            if (b) b.json = (b.json ?? "") + ev.delta.partial_json;
          }
        } else if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
          tokensOutput += ev.usage?.output_tokens ?? 0;
        } else if (ev.type === "message_stop") {
          parar = true;
          break;
        } else if (ev.type === "error") {
          throw new Error(`anthropic stream error: ${JSON.stringify(ev.error).slice(0, 200)}`);
        }
      }
    }

    if (stopReason !== "tool_use") break;

    const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    const assistantContent = ordered.map((b) =>
      b.type === "text"
        ? { type: "text", text: b.text ?? "" }
        : { type: "tool_use", id: b.id, name: b.name, input: parseJson(b.json) },
    );
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: unknown[] = [];
    for (const b of ordered) {
      if (b.type !== "tool_use") continue;
      ferramentas.push(b.name ?? "");
      const tool = getTool(b.name ?? "");
      let conteudo: string;
      if (!tool) {
        conteudo = `Ferramenta desconhecida: ${b.name}`;
      } else {
        try {
          const r = await tool.executar(parseJson(b.json), input.ctx);
          conteudo = r.texto;
          if (r.widget) cb.onWidget(r.widget);
        } catch (e) {
          conteudo = `Erro ao executar ${b.name}: ${(e as Error).message}`;
        }
      }
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: conteudo });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { texto: textoFinal, ferramentas, tokensInput, tokensOutput, tokensCache };
};

/* ------------------------------ Registro ------------------------------ */

const PROVIDERS: Record<string, NiaProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  // google: googleProvider,   // próximo adaptador — mesma interface
};

const STREAM_PROVIDERS: Record<string, NiaStreamProvider> = {
  openai: openaiStream,
  anthropic: anthropicStream,
};

export function getProvider(slug: string): NiaProvider | undefined {
  return PROVIDERS[slug];
}

export function getStreamProvider(slug: string): NiaStreamProvider | undefined {
  return STREAM_PROVIDERS[slug];
}

export function provedoresDisponiveis(): string[] {
  return Object.keys(PROVIDERS);
}
