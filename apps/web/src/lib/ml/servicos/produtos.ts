import "server-only";
import { mlDb } from "../db";
import { auditar, registrarTransicao } from "../auditoria";
import { lerConfig } from "../config";
import {
  assertTransicao,
  derivarStatusProduto,
  isPosAprovacao,
  type ProductStatus,
} from "../estados";
import { enfileirar } from "../jobs/fila";
import { descontoPct } from "../scoring/sinais";
import type { ProdutoML } from "../integracoes/mercadolivre";
import type { ProdutoRow } from "../tipos";

type Ator = { actorId?: string | null; actorType?: "user" | "system" | "automation" };

export async function lerProduto(id: string): Promise<ProdutoRow> {
  const { data, error } = await mlDb().from("ml_products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao ler produto: ${error.message}`);
  if (!data) throw new Error("Produto não encontrado.");
  return data as ProdutoRow;
}

/** Campos de catálogo atualizados a cada observação (não mexe em status/decisões). */
function camposCatalogo(p: ProdutoML): Partial<ProdutoRow> {
  return {
    external_type: p.externalType,
    item_id: p.itemId,
    title: p.title,
    permalink: p.permalink,
    domain_id: p.domainId,
    brand: p.brand,
    thumbnail: p.thumbnail ?? p.pictures[0]?.url ?? null,
    pictures: p.pictures as unknown as ProdutoRow["pictures"],
    attributes: p.attributes as unknown as ProdutoRow["attributes"],
    ...(p.description ? { description: p.description } : {}),
    currency: p.currency,
    ...(p.price != null ? { current_price: p.price, original_price: p.originalPrice, discount_pct: descontoPct(p.price, p.originalPrice) } : {}),
    ...(p.available != null ? { available: p.available, availability_reason: p.availabilityReason } : {}),
    condition: p.condition,
    free_shipping: p.freeShipping,
    seller: p.seller as unknown as ProdutoRow["seller"],
    ...(p.soldQuantity != null ? { sold_quantity: p.soldQuantity } : {}),
  };
}

export interface ObservacaoDescoberta {
  fonte: "bestseller" | "trend" | "manual";
  categoriaId: string | null;
  posicao?: number | null;
}

/**
 * Upsert de um produto observado na descoberta. Guarda histórico (snapshot),
 * atualiza ranking (anterior/atual/melhor/variação) e devolve se é novo.
 * Descartado em cooldown NÃO volta; cooldown vencido volta para "descoberto".
 */
export async function registrarObservacao(
  p: ProdutoML,
  obs: ObservacaoDescoberta,
): Promise<{ id: string; novo: boolean; status: ProductStatus }> {
  const db = mlDb();
  const { data: existente } = await db.from("ml_products").select("*").eq("external_id", p.externalId).maybeSingle();
  const agora = new Date().toISOString();
  const categoria = obs.categoriaId ?? p.categoryId;

  if (!existente) {
    const { data, error } = await db
      .from("ml_products")
      .insert({
        external_id: p.externalId,
        ...camposCatalogo(p),
        title: p.title,
        category_id: categoria,
        sources: [obs.fonte],
        current_rank: obs.posicao ?? null,
        best_rank: obs.posicao ?? null,
        status: "discovered",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao inserir produto: ${error.message}`);
    const id = (data as { id: string }).id;
    await gravarSnapshot(id, p, obs);
    await registrarTransicao({ entidade: "product", id, de: null, para: "discovered", motivo: `Descoberto via ${obs.fonte}`, actorType: "automation" });
    return { id, novo: true, status: "discovered" };
  }

  const atual = existente as ProdutoRow;
  const patch: Partial<ProdutoRow> = {
    ...camposCatalogo(p),
    last_seen_at: agora,
    times_seen: (atual.times_seen ?? 0) + 1,
    sources: Array.from(new Set([...(atual.sources ?? []), obs.fonte])),
    category_id: atual.category_id ?? categoria,
  };
  if (obs.posicao != null) {
    patch.previous_rank = atual.current_rank;
    patch.current_rank = obs.posicao;
    patch.rank_delta = atual.current_rank != null ? atual.current_rank - obs.posicao : null;
    patch.best_rank = atual.best_rank == null ? obs.posicao : Math.min(atual.best_rank, obs.posicao);
  }
  let status = atual.status as ProductStatus;
  if (status === "rejected" && atual.cooldown_until && new Date(atual.cooldown_until).getTime() < Date.now()) {
    patch.status = "discovered";
    patch.status_changed_at = agora;
    patch.status_reason = "Cooldown de descarte venceu e o produto voltou ao ranking.";
    await registrarTransicao({ entidade: "product", id: atual.id, de: "rejected", para: "discovered", motivo: patch.status_reason, actorType: "automation" });
    status = "discovered";
  }
  const { error } = await db.from("ml_products").update(patch).eq("id", atual.id);
  if (error) throw new Error(`Falha ao atualizar produto: ${error.message}`);
  await gravarSnapshot(atual.id, p, obs);
  return { id: atual.id, novo: false, status };
}

export async function gravarSnapshot(
  productId: string,
  p: Partial<ProdutoML>,
  obs: { fonte: string; categoriaId?: string | null; posicao?: number | null; rating?: number | null; reviews?: number | null },
): Promise<void> {
  const fonte = obs.fonte === "bestseller" ? "highlights" : obs.fonte === "trend" ? "trends" : obs.fonte;
  await mlDb()
    .from("ml_product_snapshots")
    .insert({
      product_id: productId,
      source: fonte,
      price: p.price ?? null,
      original_price: p.originalPrice ?? null,
      discount_pct: p.price != null ? descontoPct(p.price, p.originalPrice ?? null) : null,
      rank_position: obs.posicao ?? null,
      rank_category_id: obs.categoriaId ?? null,
      rating: obs.rating ?? null,
      reviews_count: obs.reviews ?? null,
      sold_quantity: p.soldQuantity ?? null,
      available: p.available ?? null,
    });
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------
export async function mudarStatus(
  id: string,
  para: ProductStatus,
  opts: Ator & { motivo?: string | null; patch?: Partial<ProdutoRow>; de?: ProductStatus; metadata?: Record<string, unknown> } = {},
): Promise<ProductStatus> {
  const atual = await lerProduto(id);
  const de = atual.status as ProductStatus;
  if (opts.de && opts.de !== de) throw new Error(`O produto mudou de status (${de}). Atualize a tela.`);
  assertTransicao("product", de, para);
  if (de === para && !opts.patch) return de;
  const { data, error } = await mlDb()
    .from("ml_products")
    .update({
      ...(opts.patch ?? {}),
      status: para,
      status_reason: opts.motivo ?? null,
      ...(de !== para ? { status_changed_at: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .eq("status", de) // trava otimista
    .select("id");
  if (error) throw new Error(`Falha ao mudar status: ${error.message}`);
  if (!data?.length) throw new Error("O produto foi alterado por outra operação. Tente de novo.");
  await registrarTransicao({ entidade: "product", id, de, para, motivo: opts.motivo, actorId: opts.actorId, actorType: opts.actorType, metadata: opts.metadata });
  return para;
}

/** Recalcula o status pós-aprovação a partir de link/criativos/Pins (ADR-ML-007). */
export async function recalcularStatus(id: string, ator: Ator = {}): Promise<ProductStatus> {
  const atual = await lerProduto(id);
  const st = atual.status as ProductStatus;
  if (!isPosAprovacao(st)) return st;
  const db = mlDb();
  const geral = await lerConfig("geral");
  const [link, pins, criativos] = await Promise.all([
    db.from("ml_affiliate_links").select("id").eq("product_id", id).eq("active", true).maybeSingle(),
    db.from("ml_pins").select("id, status, creative_id").eq("product_id", id),
    db.from("ml_creatives").select("id, status").eq("product_id", id),
  ]);
  const listaPins = (pins.data ?? []) as { id: string; status: string; creative_id: string }[];
  const listaCriativos = (criativos.data ?? []) as { id: string; status: string }[];
  const criativosComPinAtivo = new Set(
    listaPins.filter((p) => !["canceled", "failed"].includes(p.status)).map((p) => p.creative_id),
  );
  const novo = derivarStatusProduto({
    exigeLink: geral.exigir_link_afiliado,
    temLinkAtivo: Boolean(link.data),
    pinsAgendados: listaPins.filter((p) => ["scheduled", "publishing", "pending_approval", "draft", "blocked", "paused"].includes(p.status)).length,
    pinsPublicados: listaPins.filter((p) => p.status === "published").length,
    criativosAprovadosSemPin: listaCriativos.filter((c) => c.status === "approved" && !criativosComPinAtivo.has(c.id)).length,
    criativosEmAndamento: listaCriativos.filter((c) => ["to_generate", "generating", "waiting_manual_image", "review"].includes(c.status)).length,
  });
  if (novo === st) return st;
  await mudarStatus(id, novo, { ...ator, motivo: "Etapa recalculada automaticamente", de: st });
  if (novo === "ready_for_creative") await aoFicarProntoParaCriativo(id);
  return novo;
}

/** Gatilho do pipeline: produto com link e sem criativos → gerar ângulos (se automação ligada). */
async function aoFicarProntoParaCriativo(id: string): Promise<void> {
  const auto = await lerConfig("automacao");
  if (!auto.auto_gerar_angulos) return;
  const { count } = await mlDb()
    .from("ml_creative_angles")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
    .neq("status", "discarded");
  if ((count ?? 0) > 0) return;
  await enfileirar({
    tipo: "GENERATE_ANGLES",
    payload: { product_id: id },
    idempotencyKey: `angles:${id}`,
    entidade: { tipo: "product", id },
  });
}

export async function aprovarProduto(id: string, ator: Ator & { motivo?: string; metadata?: Record<string, unknown> } = {}): Promise<ProductStatus> {
  const atual = await lerProduto(id);
  const de = atual.status as ProductStatus;
  if (isPosAprovacao(de)) return de; // idempotente
  if (!["analyzed", "discovered", "paused"].includes(de)) {
    throw new Error(`Não é possível aprovar um produto em "${de}".`);
  }
  await mudarStatus(id, "approved", {
    ...ator,
    de,
    motivo: ator.motivo ?? "Aprovado",
    metadata: ator.metadata,
    patch: { approved_at: new Date().toISOString(), approved_by: ator.actorId ?? null, rejected_at: null, rejection_reason: null },
  });
  await mlDb().from("ml_feedback").insert({ entity_type: "product", entity_id: id, kind: "approve", created_by: ator.actorId ?? null, note: ator.motivo ?? null });
  await auditar({ acao: "produto.aprovar", entidade: "product", entidadeId: id, metadata: { motivo: ator.motivo, ...(ator.metadata ?? {}) }, actorId: ator.actorId, actorType: ator.actorType });
  // V2: imagens reais do anúncio entram na galeria assim que o produto é aprovado
  await enfileirar({ tipo: "IMPORT_PRODUCT_MEDIA", payload: { product_id: id }, idempotencyKey: `media:${id}`, entidade: { tipo: "product", id }, criadoPor: ator.actorId ?? null });
  return recalcularStatus(id, ator);
}

export async function descartarProduto(
  id: string,
  motivo: string,
  nota: string | null,
  ator: Ator = {},
): Promise<void> {
  const atual = await lerProduto(id);
  const de = atual.status as ProductStatus;
  if (de === "rejected") return;
  const desc = await lerConfig("descoberta");
  const cooldown = new Date(Date.now() + desc.cooldown_descarte_dias * 86_400_000).toISOString();
  await mudarStatus(id, "rejected", {
    ...ator,
    de,
    motivo: `Descartado: ${motivo}`,
    patch: {
      rejected_at: new Date().toISOString(),
      rejected_by: ator.actorId ?? null,
      rejection_reason: motivo,
      rejection_note: nota,
      cooldown_until: cooldown,
    },
  });
  // Pins ainda não publicados deste produto não podem sair.
  const { data: pins } = await mlDb()
    .from("ml_pins")
    .update({ status: "canceled", last_error: "Produto descartado" })
    .eq("product_id", id)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"])
    .select("id, status");
  for (const p of (pins ?? []) as { id: string }[]) {
    await registrarTransicao({ entidade: "pin", id: p.id, de: null, para: "canceled", motivo: "Produto descartado", actorId: ator.actorId, actorType: ator.actorType });
  }
  await mlDb().from("ml_feedback").insert({ entity_type: "product", entity_id: id, kind: "reject", reason: motivo, note: nota, created_by: ator.actorId ?? null });
  await auditar({ acao: "produto.descartar", entidade: "product", entidadeId: id, metadata: { motivo, nota, cooldown_until: cooldown }, actorId: ator.actorId, actorType: ator.actorType });
}

/** Desfaz o descarte (volta para analisado e limpa o cooldown). */
export async function restaurarProduto(id: string, ator: Ator = {}): Promise<void> {
  await mudarStatus(id, "analyzed", {
    ...ator,
    de: "rejected",
    motivo: "Descarte desfeito",
    patch: { cooldown_until: null, rejected_at: null, rejection_reason: null, rejection_note: null },
  });
  await auditar({ acao: "produto.restaurar", entidade: "product", entidadeId: id, actorId: ator.actorId, actorType: ator.actorType });
}

export async function pausarProduto(id: string, ator: Ator = {}): Promise<void> {
  const atual = await lerProduto(id);
  const de = atual.status as ProductStatus;
  if (de === "paused") return;
  await mudarStatus(id, "paused", { ...ator, de, motivo: "Pausado manualmente", patch: { paused_from: de } });
  await mlDb()
    .from("ml_pins")
    .update({ status: "paused" })
    .eq("product_id", id)
    .eq("status", "scheduled");
  await auditar({ acao: "produto.pausar", entidade: "product", entidadeId: id, actorId: ator.actorId, actorType: ator.actorType });
}

export async function retomarProduto(id: string, ator: Ator = {}): Promise<void> {
  const atual = await lerProduto(id);
  if (atual.status !== "paused") return;
  const volta = (atual.paused_from as ProductStatus | null) ?? "analyzed";
  await mudarStatus(id, volta, { ...ator, de: "paused", motivo: "Retomado", patch: { paused_from: null } });
  await mlDb().from("ml_pins").update({ status: "scheduled" }).eq("product_id", id).eq("status", "paused");
  await auditar({ acao: "produto.retomar", entidade: "product", entidadeId: id, actorId: ator.actorId, actorType: ator.actorType });
  await recalcularStatus(id, ator);
}
