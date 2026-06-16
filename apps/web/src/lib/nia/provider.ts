import "server-only";
import type { NiaWidget } from "@/lib/nia/schemas";
import { getTool, type NiaTool, type NiaToolContext } from "@/lib/nia/tools";

/**
 * Camada provider-agnóstica da Nia. O agente roda com UM provedor por vez,
 * mas o super admin escolhe qual (nia_config) — cada provedor é um adaptador
 * que implementa a mesma interface. Adicionar OpenAI/Google = um novo entry no
 * registro abaixo, sem mexer no resto. Ver PLANO-NIA.md §2.
 */

export interface NiaProviderInput {
  apiKey: string;
  modelo: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  userMessage: string;
  tools: NiaTool[];
  ctx: NiaToolContext;
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
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | unknown[];
}

const anthropicProvider: NiaProvider = async (input) => {
  const messages: AnthropicMessage[] = [{ role: "user", content: input.userMessage }];
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
  content: string | null;
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
    { role: "user", content: input.userMessage },
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
    { role: "user", content: input.userMessage },
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

/* ------------------------------ Registro ------------------------------ */

const PROVIDERS: Record<string, NiaProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  // google: googleProvider,   // próximo adaptador — mesma interface
};

const STREAM_PROVIDERS: Record<string, NiaStreamProvider> = {
  openai: openaiStream,
  // anthropic: anthropicStream,  // próximo: streaming nativo da Anthropic
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
