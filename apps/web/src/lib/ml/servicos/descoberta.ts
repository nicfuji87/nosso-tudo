import "server-only";
import { mlDb } from "../db";
import { lerConfig } from "../config";
import * as ml from "../integracoes/mercadolivre";
import { enfileirar } from "../jobs/fila";
import { ErroPermanente } from "../jobs/erros";
import { diaNoFuso, inicioDaSemana } from "../tempo";
import { gravarSnapshot, registrarObservacao } from "./produtos";
import { sincronizarCategoria } from "./categorias";
import type { CtxJob } from "../jobs/executor";
import type { ProdutoRow } from "../tipos";

const PRE_APROVACAO = ["discovered", "enriching", "analyzed", "error"];

/** Fan-out: um job por categoria acompanhada (idempotente por categoria + dia). */
export async function agendarDescobertaPorCategoria(ctx: CtxJob): Promise<Record<string, unknown>> {
  const { data } = await mlDb()
    .from("ml_categories")
    .select("id")
    .eq("tracked", true)
    .eq("prohibited", false)
    .order("priority", { ascending: false });
  const cats = ((data ?? []) as { id: string }[]).map((c) => c.id);
  if (!cats.length) {
    throw new ErroPermanente("Nenhuma categoria acompanhada. Escolha categorias em Configurações › Categorias.");
  }
  const geral = await lerConfig("geral");
  const hoje = diaNoFuso(new Date(), geral.timezone);
  let criados = 0;
  for (const id of cats) {
    const { criado } = await enfileirar({
      tipo: "DISCOVER_BESTSELLERS",
      payload: { category_id: id },
      idempotencyKey: `bestsellers:${id}:${hoje}`,
      parentId: ctx.job.id,
      scheduleId: ctx.job.schedule_id,
      entidade: { tipo: "category", id },
    });
    if (criado) criados++;
  }
  return { categorias: cats.length, jobs_criados: criados };
}

/**
 * Coleta os mais vendidos de UMA categoria. Se ela não tiver ranking (o ML
 * só ranqueia folhas), desce para as subcategorias (até o limite configurado).
 */
export async function descobrirMaisVendidos(categoriaId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const desc = await lerConfig("descoberta");
  const geral = await lerConfig("geral");
  const hoje = diaNoFuso(new Date(), geral.timezone);

  let listas: { categoria: string; itens: ml.HighlightML[] }[] = [];
  const principal = await ml.maisVendidos(categoriaId);
  if (principal && principal.length) {
    listas.push({ categoria: categoriaId, itens: principal });
  } else if (desc.incluir_subcategorias) {
    const cat = await sincronizarCategoria(categoriaId);
    const { data: filhos } = await mlDb()
      .from("ml_categories")
      .select("id")
      .eq("parent_id", cat.id)
      .eq("prohibited", false)
      .limit(desc.max_subcategorias);
    for (const f of (filhos ?? []) as { id: string }[]) {
      if (ctx.restanteMs() < 40_000) break;
      const itens = await ml.maisVendidos(f.id);
      if (itens?.length) listas.push({ categoria: f.id, itens });
    }
  }
  if (!listas.length) {
    await ctx.log("warn", `Categoria ${categoriaId} sem ranking de mais vendidos (nem nas subcategorias).`);
    return { coletados: 0 };
  }

  let novos = 0;
  let atualizados = 0;
  let semAcesso = 0;
  for (const lista of listas) {
    if (lista.categoria !== categoriaId) {
      await mlDb().from("ml_categories").upsert({ id: lista.categoria, name: lista.categoria }, { onConflict: "id", ignoreDuplicates: true });
    }
    const itens = lista.itens.slice(0, desc.max_por_categoria);
    for (const h of itens) {
      if (ctx.restanteMs() < 20_000) break;
      await ctx.checarCancelamento();
      const r = await observarHighlight(h, lista.categoria, hoje, ctx);
      if (r === "novo") novos++;
      else if (r === "atualizado") atualizados++;
      else semAcesso++;
    }
    await mlDb().from("ml_categories").update({ last_discovered_at: new Date().toISOString() }).eq("id", lista.categoria);
  }
  await mlDb().from("ml_categories").update({ last_discovered_at: new Date().toISOString() }).eq("id", categoriaId);
  return { listas: listas.length, novos, atualizados, sem_acesso: semAcesso };
}

async function observarHighlight(h: ml.HighlightML, categoriaId: string, dia: string, ctx: CtxJob): Promise<"novo" | "atualizado" | "sem_acesso"> {
  const db = mlDb();
  const tipo = h.type === "PRODUCT" ? "product" : h.type === "USER_PRODUCT" ? "user_product" : "item";
  const { data: existente } = await db.from("ml_products").select("*").eq("external_id", h.id).maybeSingle();
  let productId: string;
  let status: string;
  let novo = false;

  const atual = existente as ProdutoRow | null;
  const fresco = atual?.enriched_at && Date.now() - new Date(atual.enriched_at).getTime() < 24 * 3_600_000;
  if (atual && fresco) {
    // Já conhecido e recente: só atualiza o ranking (não gasta chamada de detalhe).
    const delta = atual.current_rank != null ? atual.current_rank - h.position : null;
    await db
      .from("ml_products")
      .update({
        previous_rank: atual.current_rank,
        current_rank: h.position,
        rank_delta: delta,
        best_rank: atual.best_rank == null ? h.position : Math.min(atual.best_rank, h.position),
        last_seen_at: new Date().toISOString(),
        times_seen: atual.times_seen + 1,
        sources: Array.from(new Set([...(atual.sources ?? []), "bestseller"])),
      })
      .eq("id", atual.id);
    await gravarSnapshot(
      atual.id,
      { price: atual.current_price != null ? Number(atual.current_price) : null, originalPrice: atual.original_price != null ? Number(atual.original_price) : null, available: atual.available },
      { fonte: "bestseller", categoriaId, posicao: h.position },
    );
    productId = atual.id;
    status = atual.status;
  } else {
    const detalhe = await ml.resolverProduto(h.id, h.type);
    if (!detalhe) {
      await ctx.log("warn", `Sem acesso aos detalhes de ${h.id} (${h.type}).`);
      return "sem_acesso";
    }
    const r = await registrarObservacao({ ...detalhe, externalId: h.id, externalType: tipo }, { fonte: "bestseller", categoriaId, posicao: h.position });
    productId = r.id;
    status = r.status;
    novo = r.novo;
  }

  await db
    .from("ml_product_rankings")
    .upsert(
      { category_id: categoriaId, collected_on: dia, external_id: h.id, item_type: h.type, product_id: productId, position: h.position },
      { onConflict: "category_id,collected_on,external_id" },
    );

  // Novo ou desatualizado → enriquecer; já analisado e ainda em triagem → repontuar (tendência mudou).
  if (novo || !fresco) {
    await enfileirar({ tipo: "ENRICH_PRODUCT", payload: { product_id: productId }, idempotencyKey: `enrich:${productId}`, entidade: { tipo: "product", id: productId }, parentId: ctx.job.id });
  } else if (PRE_APROVACAO.includes(status)) {
    await enfileirar({ tipo: "SCORE_PRODUCT", payload: { product_id: productId }, idempotencyKey: `score:${productId}`, entidade: { tipo: "product", id: productId }, parentId: ctx.job.id });
  }
  return novo ? "novo" : "atualizado";
}

/** Tendências (gerais + por categoria acompanhada) e, opcionalmente, produtos do catálogo que casam com elas. */
export async function descobrirTendencias(ctx: CtxJob): Promise<Record<string, unknown>> {
  const db = mlDb();
  const desc = await lerConfig("descoberta");
  const geral = await lerConfig("geral");
  if (!desc.usar_tendencias) return { ignorado: "tendências desligadas em Configurações" };
  const hoje = diaNoFuso(new Date(), geral.timezone);
  const semana = inicioDaSemana(hoje);

  const { data: cats } = await db.from("ml_categories").select("id").eq("tracked", true).eq("prohibited", false);
  const alvos: (string | null)[] = [null, ...((cats ?? []) as { id: string }[]).map((c) => c.id)];
  let gravadas = 0;
  let produtos = 0;

  for (const cat of alvos) {
    if (ctx.restanteMs() < 30_000) break;
    const lista = await ml.tendencias(cat);
    const { data: ja } = await (cat ? db.from("ml_trends").select("keyword").eq("category_id", cat) : db.from("ml_trends").select("keyword").is("category_id", null)).eq("week_start", semana);
    const existentes = new Set(((ja ?? []) as { keyword: string }[]).map((x) => x.keyword.toLowerCase()));
    const novas = lista
      .map((t, i) => ({ ...t, posicao: i + 1 }))
      .filter((t) => !existentes.has(t.keyword.toLowerCase()))
      .map((t) => ({
        category_id: cat,
        keyword: t.keyword,
        url: t.url ?? null,
        position: t.posicao,
        trend_type: ml.tipoTendencia(t.posicao),
        captured_on: hoje,
        week_start: semana,
        source_url: cat ? `/trends/MLB/${cat}` : "/trends/MLB",
      }));
    if (novas.length) {
      const { error } = await db.from("ml_trends").insert(novas);
      if (error) await ctx.log("warn", `Falha ao gravar tendências de ${cat ?? "geral"}: ${error.message}`);
      else gravadas += novas.length;
    }
    if (cat) await db.from("ml_categories").update({ last_trends_at: new Date().toISOString() }).eq("id", cat);

    // Tendência → produto: só para categorias acompanhadas, nas buscas que mais crescem.
    if (cat && desc.tendencias_buscar_produtos && desc.tendencias_palavras > 0) {
      for (const t of lista.slice(0, desc.tendencias_palavras)) {
        if (ctx.restanteMs() < 30_000) break;
        const ids = await ml.buscarCatalogo(t.keyword, desc.tendencias_produtos_por_palavra);
        for (const id of ids) {
          const { data: existe } = await db.from("ml_products").select("id").eq("external_id", id).maybeSingle();
          if (existe) continue;
          const detalhe = await ml.produtoCatalogo(id);
          if (!detalhe) continue;
          const r = await registrarObservacao(detalhe, { fonte: "trend", categoriaId: detalhe.categoryId ? null : cat });
          if (detalhe.categoryId) {
            // categoria real do produto (pode ser folha abaixo da acompanhada)
            await db.from("ml_categories").upsert({ id: detalhe.categoryId, name: detalhe.categoryId }, { onConflict: "id", ignoreDuplicates: true });
            await db.from("ml_products").update({ category_id: detalhe.categoryId, trend_keywords: [t.keyword] }).eq("id", r.id);
          }
          if (r.novo) {
            produtos++;
            await enfileirar({ tipo: "ENRICH_PRODUCT", payload: { product_id: r.id }, idempotencyKey: `enrich:${r.id}`, entidade: { tipo: "product", id: r.id }, parentId: ctx.job.id });
          }
        }
      }
    }
  }
  return { tendencias: gravadas, produtos_novos: produtos, semana };
}
