import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getApiKey } from "@/lib/nia/config";
import type { NiaAnexoInput } from "@/lib/nia/schemas";

/**
 * Processa anexos da Nia sob o RLS do usuário: baixa do Storage, transcreve
 * áudio (Whisper) e converte imagem/PDF para base64 (para os blocos de conteúdo
 * do modelo). Cada anexo vira uma linha em `midias` (entra no histórico).
 */

export interface MidiaProcessada {
  id: string;
  tipo: string;
  nome: string | null;
  storagePath: string;
  /** Leitura em texto do anexo (imagem/PDF) — vai no histórico de forma invisível. */
  leitura: string | null;
}

export interface AnexoProcessado {
  /** Transcrição concatenada dos áudios (vai junto da mensagem do usuário). */
  textoTranscrito: string;
  /** Imagem/PDF prontos para o provedor (Claude lê PDF nativo). */
  conteudos: { tipo: "imagem" | "pdf"; mimeType: string; base64: string }[];
  /** Mídias gravadas (para o histórico e a política de retenção). */
  midias: MidiaProcessada[];
}

async function blobParaBase64(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

/** Modelo barato (visão) para a leitura textual de notas/recibos. */
const MODELO_LEITURA = "claude-haiku-4-5";

/**
 * Lê uma imagem/PDF e devolve a transcrição dos dados em texto corrido (estabelecimento,
 * data, total, itens). Persiste como `texto_extraido` e entra no histórico da conversa,
 * para a Nia "lembrar" da nota mesmo depois que o arquivo bruto é descartado (privacidade).
 * Degrada para "" se não houver chave Anthropic ou em qualquer erro.
 */
async function lerDocumento(
  base64: string,
  mimeType: string,
  tipo: "imagem" | "pdf",
): Promise<string> {
  const key = await getApiKey("anthropic");
  if (!key) return "";
  const fonte =
    tipo === "imagem"
      ? { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  const instrucao =
    "Transcreva os dados deste documento (provável nota fiscal, recibo ou comprovante) em texto corrido e objetivo, em português do Brasil. " +
    "Inclua, quando houver: estabelecimento, data, valor total, forma de pagamento e a lista de itens com quantidade e valor. " +
    "Se não for um documento financeiro, descreva em uma frase o que é. Não comente nem opine — só os dados.";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO_LEITURA,
        max_tokens: 1024,
        messages: [{ role: "user", content: [fonte, { type: "text", text: instrucao }] }],
      }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

/** Transcreve áudio via OpenAI Whisper. Retorna "" se sem chave/erro (degrada). */
export async function transcrever(blob: Blob, nome: string): Promise<string> {
  const key = await getApiKey("openai");
  if (!key) return "";
  const form = new FormData();
  form.append("file", blob, nome || "audio");
  form.append("model", "whisper-1");
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  } catch {
    return "";
  }
}

export async function processarAnexos(
  workspaceId: string,
  profileId: string,
  anexos: NiaAnexoInput[],
): Promise<AnexoProcessado> {
  const supabase = createClient();

  // Processa os anexos EM PARALELO — a leitura de cada imagem/PDF é uma chamada
  // de visão (~10-20s); em série, 3 imagens de uma fatura já estouravam o tempo.
  type Resultado = {
    conteudo: AnexoProcessado["conteudos"][number] | null;
    transcricao: string | null;
    midia: MidiaProcessada | null;
  };
  const resultados = await Promise.all(
    anexos.map<Promise<Resultado>>(async (a) => {
      const { data: blob } = await supabase.storage.from("nia-anexos").download(a.storagePath);
      if (!blob) return { conteudo: null, transcricao: null, midia: null };

      let textoExtraido: string | null = null;
      let leitura: string | null = null;
      let transcricao: string | null = null;
      let conteudo: AnexoProcessado["conteudos"][number] | null = null;
      if (a.tipo === "audio") {
        const t = await transcrever(blob, a.nomeOriginal ?? "audio");
        if (t) {
          transcricao = t;
          textoExtraido = t;
        }
      } else {
        const base64 = await blobParaBase64(blob);
        conteudo = { tipo: a.tipo, mimeType: a.mimeType, base64 };
        const lida = await lerDocumento(base64, a.mimeType, a.tipo);
        if (lida) {
          textoExtraido = lida;
          leitura = lida;
        }
      }

      const { data: midia } = await supabase
        .from("midias")
        .insert({
          workspace_id: workspaceId,
          bucket: "nia-anexos",
          storage_path: a.storagePath,
          tipo: a.tipo,
          nome_original: a.nomeOriginal ?? null,
          mime_type: a.mimeType,
          tamanho_bytes: a.tamanho ?? null,
          origem: "app",
          enviado_por: profileId,
          texto_extraido: textoExtraido,
          processado: true,
        })
        .select("id")
        .maybeSingle();
      const id = (midia as { id: string } | null)?.id;
      return {
        conteudo,
        transcricao,
        midia: id ? { id, tipo: a.tipo, nome: a.nomeOriginal ?? null, storagePath: a.storagePath, leitura } : null,
      };
    }),
  );

  const conteudos = resultados.map((r) => r.conteudo).filter((c): c is NonNullable<typeof c> => c !== null);
  const midias = resultados.map((r) => r.midia).filter((m): m is MidiaProcessada => m !== null);
  const transcricoes = resultados.map((r) => r.transcricao).filter((t): t is string => t !== null);

  return { textoTranscrito: transcricoes.join("\n").trim(), conteudos, midias };
}

/** Remove mídias (linha + objeto no Storage) — usado pela política de retenção. */
export async function removerMidias(midiaIds: string[], storagePaths: string[]): Promise<void> {
  if (midiaIds.length === 0) return;
  const supabase = createClient();
  await supabase.from("midias").delete().in("id", midiaIds);
  if (storagePaths.length > 0) await supabase.storage.from("nia-anexos").remove(storagePaths);
}
