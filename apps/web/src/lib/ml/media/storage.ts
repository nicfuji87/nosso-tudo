import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mlDb } from "../db";
import { hostPermitido, HOSTS_IMAGEM_PERMITIDOS } from "../http";
import { extensao, validarImagem, type MimeImagem } from "./imagem";

export const BUCKET = "ml-media";

/** Baixa imagem de host permitido (anti-SSRF), com teto de tamanho e checagem de conteúdo. */
export async function baixarImagem(url: string): Promise<{ bytes: Buffer; mime: MimeImagem }> {
  if (!hostPermitido(url, HOSTS_IMAGEM_PERMITIDOS)) throw new Error(`Host de imagem não permitido: ${url.slice(0, 80)}`);
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store", redirect: "follow" });
  if (!r.ok) throw new Error(`Falha ao baixar imagem (HTTP ${r.status}).`);
  if (!hostPermitido(r.url || url, HOSTS_IMAGEM_PERMITIDOS)) throw new Error("Imagem redirecionou para host não permitido.");
  const buf = Buffer.from(await r.arrayBuffer());
  const v = validarImagem(buf);
  if (!v.ok) {
    // Imagens de referência podem ser pequenas; só o formato importa aqui.
    if (/pequena/.test(v.erro)) {
      const mime = buf[0] === 0x89 ? "image/png" : buf[0] === 0xff ? "image/jpeg" : "image/webp";
      return { bytes: buf, mime };
    }
    throw new Error(v.erro);
  }
  return { bytes: buf, mime: v.imagem.mime };
}

/** Versão JPG de uma imagem do mlstatic (satori não lê WEBP). */
export function variante(url: string): string {
  return /mlstatic\.com/.test(url) ? url.replace(/\.webp(\?.*)?$/i, ".jpg") : url;
}

export interface NovoAsset {
  creativeId: string;
  bytes: Buffer;
  modo: "api" | "manual_chatgpt" | "upload" | "composition";
  prompt?: string | null;
  modelo?: string | null;
  userId?: string | null;
}

/**
 * Valida, sobe para o Storage (caminho gerado no servidor), registra o asset e
 * o torna a imagem atual do criativo. Imagem anterior fica no histórico.
 */
export async function salvarAsset(a: NovoAsset): Promise<{ id: string; url: string; avisos: string[] }> {
  const v = validarImagem(a.bytes);
  if (!v.ok) throw new Error(v.erro);
  const sha = createHash("sha256").update(a.bytes).digest("hex");
  const caminho = `creatives/${a.creativeId}/${Date.now()}-${randomBytes(4).toString("hex")}.${extensao(v.imagem.mime)}`;
  const db = mlDb();
  const { error: upErr } = await db.storage.from(BUCKET).upload(caminho, a.bytes, {
    contentType: v.imagem.mime,
    upsert: false,
    cacheControl: "31536000",
  });
  if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);
  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);

  const { data, error } = await db
    .from("ml_creative_assets")
    .insert({
      creative_id: a.creativeId,
      storage_path: caminho,
      public_url: pub.publicUrl,
      mode: a.modo,
      prompt: a.prompt ?? null,
      model: a.modelo ?? null,
      width: v.imagem.largura,
      height: v.imagem.altura,
      bytes: v.imagem.bytes,
      mime: v.imagem.mime,
      sha256: sha,
      created_by: a.userId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET).remove([caminho]);
    throw new Error(`Falha ao registrar imagem: ${error.message}`);
  }
  return { id: (data as { id: string }).id, url: pub.publicUrl, avisos: v.imagem.avisos };
}

/** Imagem de referência guardada no nosso Storage (link estável para o modo manual). */
export async function salvarReferencia(creativeId: string, url: string): Promise<string> {
  const { bytes, mime } = await baixarImagem(url);
  const caminho = `references/${creativeId}.${extensao(mime)}`;
  const db = mlDb();
  await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: true, cacheControl: "86400" });
  return db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}
