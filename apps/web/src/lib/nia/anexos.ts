import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getApiKey } from "@/lib/nia/config";
import type { MidiaRef, NiaAnexoInput } from "@/lib/nia/schemas";

/**
 * Processa anexos da Nia sob o RLS do usuário: baixa do Storage, transcreve
 * áudio (Whisper) e converte imagem/PDF para base64 (para os blocos de conteúdo
 * do modelo). Cada anexo vira uma linha em `midias` (entra no histórico).
 */

export interface AnexoProcessado {
  /** Transcrição concatenada dos áudios (vai junto da mensagem do usuário). */
  textoTranscrito: string;
  /** Imagem/PDF prontos para o provedor (Claude lê PDF nativo). */
  conteudos: { tipo: "imagem" | "pdf"; mimeType: string; base64: string }[];
  /** Referências para guardar na mensagem (mensagens_ia.midias). */
  midiasRefs: MidiaRef[];
}

async function blobParaBase64(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("base64");
}

/** Transcreve áudio via OpenAI Whisper. Retorna "" se sem chave/erro (degrada). */
async function transcrever(blob: Blob, nome: string): Promise<string> {
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
  const conteudos: AnexoProcessado["conteudos"] = [];
  const midiasRefs: MidiaRef[] = [];
  const transcricoes: string[] = [];

  for (const a of anexos) {
    const { data: blob } = await supabase.storage.from("nia-anexos").download(a.storagePath);
    if (!blob) continue;

    let textoExtraido: string | null = null;
    if (a.tipo === "audio") {
      const t = await transcrever(blob, a.nomeOriginal ?? "audio");
      if (t) {
        transcricoes.push(t);
        textoExtraido = t;
      }
    } else {
      conteudos.push({ tipo: a.tipo, mimeType: a.mimeType, base64: await blobParaBase64(blob) });
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
    if (id) midiasRefs.push({ id, tipo: a.tipo, nome: a.nomeOriginal ?? null });
  }

  return { textoTranscrito: transcricoes.join("\n").trim(), conteudos, midiasRefs };
}
