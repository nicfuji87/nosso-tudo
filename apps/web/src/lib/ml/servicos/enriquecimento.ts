import "server-only";
import { mlDb } from "../db";
import { lerConfig } from "../config";
import * as ml from "../integracoes/mercadolivre";
import * as apify from "../integracoes/apify";
import { garantirCategoria } from "./categorias";
import { gravarSnapshot, lerProduto, mudarStatus } from "./produtos";
import { descontoPct } from "../scoring/sinais";
import type { CtxJob } from "../jobs/executor";
import type { ProdutoRow } from "../tipos";

/**
 * ENRICH_PRODUCT: detalhes oficiais (catálogo → item) + avaliações + Apify
 * opcional. Dado que o token não pode ler (403) fica marcado como faltante,
 * nunca derruba o job (ADR-ML-009).
 */
export async function enriquecerProduto(id: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  let p = await lerProduto(id);
  if (p.status === "discovered" || p.status === "error") {
    await mudarStatus(id, "enriching", { motivo: "Coletando detalhes", actorType: "automation" });
  }
  const fontes: string[] = [];
  const faltando: string[] = [];

  const detalhe = await ml.resolverProduto(p.external_id, p.external_type === "product" ? "PRODUCT" : p.external_type === "user_product" ? "USER_PRODUCT" : "ITEM");
  const patch: Partial<ProdutoRow> = { last_checked_at: new Date().toISOString() };
  if (detalhe) {
    fontes.push(detalhe.externalType);
    Object.assign(patch, {
      title: detalhe.title,
      permalink: detalhe.permalink ?? p.permalink,
      item_id: detalhe.itemId ?? p.item_id,
      domain_id: detalhe.domainId ?? p.domain_id,
      brand: detalhe.brand ?? p.brand,
      thumbnail: detalhe.thumbnail ?? p.thumbnail,
      ...(detalhe.pictures.length ? { pictures: detalhe.pictures } : {}),
      ...(detalhe.attributes.length ? { attributes: detalhe.attributes } : {}),
      ...(detalhe.description ? { description: detalhe.description } : {}),
      ...(detalhe.price != null
        ? { current_price: detalhe.price, original_price: detalhe.originalPrice, discount_pct: descontoPct(detalhe.price, detalhe.originalPrice) }
        : {}),
      ...(detalhe.available != null ? { available: detalhe.available, availability_reason: detalhe.availabilityReason } : {}),
      condition: detalhe.condition ?? p.condition,
      free_shipping: detalhe.freeShipping ?? p.free_shipping,
      seller: detalhe.seller ?? p.seller,
      ...(detalhe.soldQuantity != null ? { sold_quantity: detalhe.soldQuantity } : {}),
    } as Partial<ProdutoRow>);
    if (!p.category_id && detalhe.categoryId) patch.category_id = await garantirCategoria(detalhe.categoryId);
    if (detalhe.fonteParcial) faltando.push("preço/vendedor (sem buy box)");
  } else {
    faltando.push("detalhes do anúncio (acesso negado pela API)");
  }

  // Avaliações: precisa de um item_id; para produto de catálogo, passa o catalog id.
  const itemId = (patch.item_id as string | null | undefined) ?? p.item_id ?? (p.external_type === "item" ? p.external_id : null);
  let rating: number | null = null;
  let reviews: number | null = null;
  if (itemId) {
    const av = await ml.avaliacoes(itemId, p.external_type === "product" ? p.external_id : detalhe?.catalogProductId);
    if (av) {
      rating = av.rating;
      reviews = av.total;
      fontes.push("reviews");
    } else faltando.push("avaliações");
  } else faltando.push("avaliações (sem anúncio vencedor)");
  if (rating != null) patch.rating = rating;
  if (reviews != null) patch.reviews_count = reviews;

  // Apify: só preenche lacunas, nunca obrigatório.
  const desc = await lerConfig("descoberta");
  const enrichment: Record<string, unknown> = { ...((p.enrichment as Record<string, unknown> | null) ?? {}) };
  if (desc.enriquecer_com_apify && (rating == null || p.sold_quantity == null) && (await apify.configurada())) {
    try {
      const itens = await apify.rodarActor({
        vars: { titulo: p.title, url: p.permalink ?? "", id: p.external_id },
        runIdExistente: (ctx.job.progress?.apify_run_id as string | undefined) ?? null,
        salvarRunId: (runId) => ctx.progresso({ apify_run_id: runId }),
        maxItens: 5,
      });
      const s = itens[0] ? apify.extrairSinais(itens[0]) : null;
      if (s) {
        if (patch.rating == null && s.rating != null) patch.rating = s.rating;
        if (patch.reviews_count == null && s.reviews != null) patch.reviews_count = Math.round(s.reviews);
        if (p.sold_quantity == null && s.vendidos != null) patch.sold_quantity = Math.round(s.vendidos);
        enrichment.apify = { ...s, coletado_em: new Date().toISOString(), fonte: "apify (terceiros)" };
        fontes.push("apify");
      }
    } catch (e) {
      // ErroAguardar precisa subir para o job retomar o mesmo run
      if (e instanceof Error && e.name === "ErroAguardar") throw e;
      await ctx.log("warn", `Apify falhou (seguindo sem): ${e instanceof Error ? e.message : String(e)}`);
      enrichment.apify_erro = e instanceof Error ? e.message : String(e);
    }
  }
  enrichment.fontes = fontes;
  enrichment.faltando = faltando;
  patch.enrichment = enrichment as ProdutoRow["enrichment"];
  patch.enriched_at = new Date().toISOString();

  await mlDb().from("ml_products").update(patch).eq("id", id);
  p = await lerProduto(id);
  await gravarSnapshot(
    id,
    {
      price: p.current_price != null ? Number(p.current_price) : null,
      originalPrice: p.original_price != null ? Number(p.original_price) : null,
      available: p.available,
      soldQuantity: p.sold_quantity,
    },
    { fonte: "enrich", rating: p.rating != null ? Number(p.rating) : null, reviews: p.reviews_count },
  );
  return { fontes, faltando };
}
