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
}

export type NiaProvider = (input: NiaProviderInput) => Promise<NiaProviderResult>;

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
  usage: { input_tokens: number; output_tokens: number };
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
  let textoFinal = "";

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
        system: input.systemPrompt,
        tools: input.tools.map((t) => ({
          name: t.nome,
          description: t.descricao,
          input_schema: t.inputSchema,
        })),
        messages,
      }),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor anthropic retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    tokensInput += data.usage?.input_tokens ?? 0;
    tokensOutput += data.usage?.output_tokens ?? 0;

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

  return { texto: textoFinal, widgets, ferramentas, tokensInput, tokensOutput };
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
  usage?: { prompt_tokens: number; completion_tokens: number };
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
  let textoFinal = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.modelo,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        messages,
        tools: input.tools.map((t) => ({
          type: "function",
          function: { name: t.nome, description: t.descricao, parameters: t.inputSchema },
        })),
      }),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      throw new Error(`Provedor openai retornou ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    tokensInput += data.usage?.prompt_tokens ?? 0;
    tokensOutput += data.usage?.completion_tokens ?? 0;

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

  return { texto: textoFinal, widgets, ferramentas, tokensInput, tokensOutput };
};

/* ------------------------------ Registro ------------------------------ */

const PROVIDERS: Record<string, NiaProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  // google: googleProvider,   // próximo adaptador — mesma interface
};

export function getProvider(slug: string): NiaProvider | undefined {
  return PROVIDERS[slug];
}

export function provedoresDisponiveis(): string[] {
  return Object.keys(PROVIDERS);
}
