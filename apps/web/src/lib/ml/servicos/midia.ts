import "server-only";
import { createHash } from "node:crypto";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { lerConfig } from "../config";
import { hostPermitido, HOSTS_IMAGEM_PERMITIDOS } from "../http";
import * as ml from "../integracoes/mercadolivre";
import { BUCKET, baixarImagem, variante } from "../media/storage";
import { extensao, validarImagem } from "../media/imagem";
import { codificarPng, decodificar, limitarLado, recortarFundo } from "../media/pixels";
import { lerProduto } from "./produtos";
import type { CtxJob } from "../jobs/executor";
import type { Database } from "../database.types";
import type { ProdutoRow } from "../tipos";

/**
 * Imagens reais do anúncio (V2 §4): cópia no Storage com proveniência,
 * papéis de referência e recorte do produto para a composição exata.
 */
export type MidiaRow = Database["public"]["Tables"]["ml_product_media"]["Row"];
export type PapelMidia = "primary_reference" | "complementary" | "do_not_use" | "consult_only";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function evento(ctx: CtxJob | null, nivel: "info" | "warn" | "error", mensagem: string, dados?: Record<string, unknown>) {
  if (ctx) await ctx.log(nivel, mensagem, dados);
}

async function copiarParaStorage(productId: string, bytes: Buffer): Promise<{ path: string; url: string; largura: number | null; altura: number | null; mime: string; checksum: string }> {
  const v = validarImagem(bytes);
  // fotos de anúncio podem ser pequenas; formato precisa ser válido
  if (!v.ok && !/pequena/.test(v.erro)) throw new Error(v.erro);
  const mime = v.ok ? v.imagem.mime : bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  const checksum = sha(bytes);
  const path = `media/${productId}/${checksum.slice(0, 16)}.${extensao(mime as "image/png")}`;
  const db = mlDb();
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Falha no Storage: ${error.message}`);
  return {
    path,
    url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    largura: v.ok ? v.imagem.largura : null,
    altura: v.ok ? v.imagem.altura : null,
    mime,
    checksum,
  };
}

export async function listarMidia(productId: string): Promise<MidiaRow[]> {
  const { data } = await mlDb().from("ml_product_media").select("*").eq("product_id", productId).order("sort_order");
  return (data ?? []) as MidiaRow[];
}

/** IMPORT_PRODUCT_MEDIA / REFRESH_PRODUCT_MEDIA — idempotente (único por produto + URL). */
export async function importarMidia(productId: string, opts: { refresh?: boolean; ctx?: CtxJob | null } = {}): Promise<Record<string, unknown>> {
  const ctx = opts.ctx ?? null;
  const db = mlDb();
  let p = await lerProduto(productId);
  let fonte: "ml_api" | "discovery" = "discovery";
  if (opts.refresh) {
    try {
      const tipo = p.external_type === "product" ? "PRODUCT" : p.external_type === "user_product" ? "USER_PRODUCT" : "ITEM";
      const d = await ml.resolverProduto(p.external_id, tipo);
      if (d?.pictures.length) {
        await db.from("ml_products").update({ pictures: d.pictures as unknown as ProdutoRow["pictures"] }).eq("id", productId);
        p = await lerProduto(productId);
        fonte = "ml_api";
      }
    } catch (e) {
      await evento(ctx, "warn", `Não foi possível atualizar as fotos pela API (seguindo com as já conhecidas): ${e instanceof Error ? e.message : e}`, { evento: "midia.falha_download" });
    }
  }
  const fotos = ((p.pictures as { url: string; width?: number | null; height?: number | null }[] | null) ?? []).filter((f) => f?.url);
  if (!fotos.length && p.thumbnail) fotos.push({ url: p.thumbnail });

  const existentes = await listarMidia(productId);
  const porUrl = new Map(existentes.filter((m) => m.source_url).map((m) => [m.source_url!, m]));
  let novas = 0;
  let falhas = 0;
  for (const [ordem, foto] of fotos.entries()) {
    if (ctx && ctx.restanteMs() < 15_000) break;
    const atual = porUrl.get(foto.url);
    if (atual && atual.status === "ready" && !opts.refresh) {
      if (atual.sort_order !== ordem) await db.from("ml_product_media").update({ sort_order: ordem, is_primary: ordem === 0 }).eq("id", atual.id);
      continue;
    }
    try {
      const { bytes } = await baixarImagem(variante(foto.url));
      const c = await copiarParaStorage(productId, bytes);
      const linha = {
        product_id: productId,
        source_type: atual?.source_type ?? fonte,
        source_url: foto.url,
        storage_path: c.path,
        public_url: c.url,
        width: c.largura ?? foto.width ?? null,
        height: c.altura ?? foto.height ?? null,
        mime_type: c.mime,
        checksum: c.checksum,
        sort_order: ordem,
        is_primary: ordem === 0,
        status: "ready",
        error: null,
        captured_at: new Date().toISOString(),
        provenance_note: `Foto ${ordem + 1} do anúncio ${p.external_id}`,
      };
      if (atual) await db.from("ml_product_media").update(linha).eq("id", atual.id);
      else {
        await db.from("ml_product_media").insert(linha);
        novas++;
      }
    } catch (e) {
      falhas++;
      const msg = e instanceof Error ? e.message : String(e);
      await evento(ctx, "warn", `Falha ao importar foto ${ordem + 1}: ${msg}`, { evento: /Storage/.test(msg) ? "midia.falha_storage" : "midia.falha_download", url: foto.url });
      if (atual) await db.from("ml_product_media").update({ status: "failed", error: msg.slice(0, 300) }).eq("id", atual.id);
      else
        await db
          .from("ml_product_media")
          .insert({ product_id: productId, source_type: fonte, source_url: foto.url, sort_order: ordem, is_primary: ordem === 0, status: "failed", error: msg.slice(0, 300) });
    }
  }
  const sel = await selecionarReferenciasAuto(productId);
  const todas = await listarMidia(productId);
  await db
    .from("ml_products")
    .update({ media_imported_at: new Date().toISOString(), media_count: todas.filter((m) => m.status === "ready").length })
    .eq("id", productId);
  await auditar({ acao: "midia.importar", entidade: "product", entidadeId: productId, metadata: { evento: "midia.importar", novas, falhas, total: todas.length, refresh: Boolean(opts.refresh), selecao: sel } });
  return { fotos: fotos.length, novas, falhas, prontas: todas.filter((m) => m.status === "ready").length, selecao: sel };
}

/** Regra automática: principal = foto principal do anúncio; complementares = próximas 2 nítidas. Nunca mexe em escolha do usuário. */
export async function selecionarReferenciasAuto(productId: string): Promise<string> {
  const cfg = await lerConfig("criativos_v2");
  if (!cfg.auto_selecionar_referencias) return "desligada";
  const midias = (await listarMidia(productId)).filter((m) => m.status === "ready");
  if (!midias.length) return "sem fotos";
  if (midias.some((m) => m.media_role === "primary_reference")) return "já existe";
  if (midias.some((m) => m.role_source === "user")) return "escolha do usuário preservada";
  const ordenadas = [...midias].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const principal = ordenadas[0]!;
  await mlDb().from("ml_product_media").update({ media_role: "primary_reference", role_source: "auto", reference_priority: 0 }).eq("id", principal.id);
  const nitidas = ordenadas.slice(1).filter((m) => Math.min(m.width ?? 0, m.height ?? 0) >= 500).slice(0, 2);
  for (const [i, m] of nitidas.entries()) {
    await mlDb().from("ml_product_media").update({ media_role: "complementary", role_source: "auto", reference_priority: i + 1 }).eq("id", m.id);
  }
  return `principal + ${nitidas.length} complementar(es)`;
}

export async function definirPapel(mediaId: string, papel: PapelMidia, userId: string | null): Promise<void> {
  const db = mlDb();
  const { data } = await db.from("ml_product_media").select("*").eq("id", mediaId).maybeSingle();
  const m = data as MidiaRow | null;
  if (!m) throw new Error("Imagem não encontrada.");
  if (papel !== "do_not_use" && papel !== "consult_only" && m.status !== "ready") throw new Error("Imagem ainda não foi importada para o Storage.");
  if (papel === "primary_reference") {
    // a principal anterior vira complementar (índice único garante uma só)
    await db.from("ml_product_media").update({ media_role: "complementary", role_source: "user" }).eq("product_id", m.product_id).eq("media_role", "primary_reference");
  }
  let prioridade: number | null = null;
  if (papel === "complementary") {
    const { data: comp } = await db.from("ml_product_media").select("reference_priority").eq("product_id", m.product_id).eq("media_role", "complementary");
    prioridade = Math.max(0, ...((comp ?? []) as { reference_priority: number | null }[]).map((c) => c.reference_priority ?? 0)) + 1;
  }
  await db
    .from("ml_product_media")
    .update({ media_role: papel, role_source: "user", reference_priority: papel === "primary_reference" ? 0 : prioridade })
    .eq("id", mediaId);
  await auditar({ acao: "midia.papel", entidade: "product", entidadeId: m.product_id, actorId: userId, antes: { papel: m.media_role }, depois: { papel, media: mediaId } });
}

/** URL manual — só hosts permitidos (anti-SSRF); para outras origens use upload. */
export async function adicionarMidiaUrl(productId: string, url: string, userId: string | null): Promise<MidiaRow> {
  if (!hostPermitido(url, HOSTS_IMAGEM_PERMITIDOS)) {
    throw new Error("Por segurança, só aceitamos URLs do Mercado Livre (mlstatic). Para outras imagens, use o upload.");
  }
  const { bytes } = await baixarImagem(variante(url));
  return gravarMidiaManual(productId, bytes, { tipo: "manual_url", url, userId });
}

export async function enviarMidia(productId: string, bytes: Buffer, userId: string | null): Promise<MidiaRow> {
  return gravarMidiaManual(productId, bytes, { tipo: "upload", url: null, userId });
}

async function gravarMidiaManual(productId: string, bytes: Buffer, o: { tipo: "manual_url" | "upload"; url: string | null; userId: string | null }): Promise<MidiaRow> {
  await lerProduto(productId);
  const c = await copiarParaStorage(productId, bytes);
  const { count } = await mlDb().from("ml_product_media").select("id", { count: "exact", head: true }).eq("product_id", productId);
  const { data, error } = await mlDb()
    .from("ml_product_media")
    .insert({
      product_id: productId,
      source_type: o.tipo,
      source_url: o.url,
      storage_path: c.path,
      public_url: c.url,
      width: c.largura,
      height: c.altura,
      mime_type: c.mime,
      checksum: c.checksum,
      sort_order: 100 + (count ?? 0),
      status: "ready",
      media_role: "consult_only",
      role_source: "user",
      provenance_note: o.tipo === "upload" ? "Enviada manualmente pelo painel" : "URL adicionada manualmente",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.code === "23505" ? "Esta imagem já está na galeria." : error.message);
  await mlDb().from("ml_products").update({ media_count: (count ?? 0) + 1 }).eq("id", productId);
  await auditar({ acao: "midia.adicionar", entidade: "product", entidadeId: productId, actorId: o.userId, metadata: { evento: "midia.importar", tipo: o.tipo } });
  return data as MidiaRow;
}

export interface Referencias {
  principal: MidiaRow | null;
  complementares: MidiaRow[];
}

export async function referenciasDoProduto(productId: string, ids?: string[] | null): Promise<Referencias> {
  const midias = (await listarMidia(productId)).filter((m) => m.status === "ready" && m.public_url);
  if (ids?.length) {
    const escolhidas = ids.map((id) => midias.find((m) => m.id === id)).filter((m): m is MidiaRow => Boolean(m));
    return { principal: escolhidas[0] ?? null, complementares: escolhidas.slice(1) };
  }
  return {
    principal: midias.find((m) => m.media_role === "primary_reference") ?? null,
    complementares: midias.filter((m) => m.media_role === "complementary").sort((a, b) => (a.reference_priority ?? 99) - (b.reference_priority ?? 99)),
  };
}

/**
 * PREPARE_PRODUCT_CUTOUT — remove o fundo uniforme da foto (pixels do produto
 * intactos). Fundo não uniforme ⇒ "not_possible" e a composição usa a foto inteira.
 */
export async function prepararRecorte(mediaId: string, ctx: CtxJob | null = null): Promise<Record<string, unknown>> {
  const db = mlDb();
  const { data } = await db.from("ml_product_media").select("*").eq("id", mediaId).maybeSingle();
  const m = data as MidiaRow | null;
  if (!m?.public_url) throw new Error("Imagem sem cópia no Storage.");
  if (m.cutout_status === "ready" || m.cutout_status === "not_possible") return { status: m.cutout_status, ja_processado: true };
  try {
    const { bytes } = await baixarImagem(m.public_url);
    const bmp = limitarLado(decodificar(bytes), 1600);
    const r = recortarFundo(bmp);
    if (!r.possivel || !r.bitmap) {
      await db.from("ml_product_media").update({ cutout_status: "not_possible", cutout_note: r.motivo }).eq("id", mediaId);
      await evento(ctx, "info", `Recorte não aplicável: ${r.motivo}`, { evento: "midia.recorte" });
      return { status: "not_possible", motivo: r.motivo };
    }
    const png = codificarPng(r.bitmap);
    const path = `media/${m.product_id}/cutout-${mediaId}.png`;
    const { error } = await db.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`Falha no Storage: ${error.message}`);
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await db
      .from("ml_product_media")
      .update({ cutout_status: "ready", cutout_path: path, cutout_url: url, cutout_note: `${r.motivo} Produto ocupa ${Math.round((r.cobertura ?? 0) * 100)}% da foto.` })
      .eq("id", mediaId);
    return { status: "ready", cobertura: r.cobertura };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("ml_product_media").update({ cutout_status: "failed", cutout_note: msg.slice(0, 300) }).eq("id", mediaId);
    await evento(ctx, "warn", `Falha no recorte: ${msg}`, { evento: /Storage/.test(msg) ? "midia.falha_storage" : "midia.falha_download" });
    return { status: "failed", erro: msg };
  }
}
