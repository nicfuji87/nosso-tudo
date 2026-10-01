import "server-only";
import { z } from "zod";
import { ErroPermanente } from "./erros";
import type { CtxJob, RegistroHandlers } from "./executor";
import { agendarDescobertaPorCategoria, descobrirMaisVendidos, descobrirTendencias } from "../servicos/descoberta";
import { enriquecerProduto } from "../servicos/enriquecimento";
import { pontuarProduto } from "../servicos/scoring";
import { criarCriativos, gerarAngulos, gerarCopy, gerarImagem } from "../servicos/criativos";
import {
  checarProduto,
  despacharPublicacoes,
  publicarPin,
  revalidarAgendados,
  revalidarCatalogo,
} from "../servicos/publicacao";
import { calcularPerformance, coletarMetricas } from "../servicos/metricas";
import {
  diagnosticar,
  gerarCriativosPendentes,
  limpar,
  processarPipeline,
  renovarTokens,
  sincronizarBoards,
} from "../servicos/manutencao";
import { sincronizarCategoria, sincronizarRaiz } from "../servicos/categorias";
import { importarMidia, prepararRecorte } from "../servicos/midia";
import {
  aplicarOverlay,
  avancarVariante,
  checarFidelidade,
  comporVariante,
  gerarFundo,
  gerarLote,
  gerarPacote,
  gerarPorReferencia,
  planejarFamilia,
  revalidarPacote,
} from "../servicos/variantes";
import { validarRedirectLink, validarRedirectsLote } from "../servicos/afiliados";
import { lerConfig } from "../config";
import { mlDb } from "../db";
import { lerIntegracao } from "../integracoes/estado";
import type { Provider } from "../segredos";

/** Valida o payload; payload inválido é erro permanente (retry não conserta). */
function payload<T extends z.ZodTypeAny>(ctx: CtxJob, schema: T): z.infer<T> {
  const r = schema.safeParse(ctx.job.payload ?? {});
  if (!r.success) throw new ErroPermanente(`Payload inválido: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return r.data;
}

/**
 * Integração necessária desconectada: execução AGENDADA vira "ignorada" (a
 * Central de Pendências já mostra a configuração incompleta — sem falha diária
 * repetida); execução MANUAL falha com mensagem clara.
 */
async function exigirIntegracao(ctx: CtxJob, provider: Provider, nome: string): Promise<Record<string, unknown> | null> {
  const integ = await lerIntegracao(provider);
  if (integ.status !== "disconnected") return null;
  if (ctx.job.created_by) throw new ErroPermanente(`${nome} não está conectado. Conecte em Integrações.`);
  await ctx.log("info", `${nome} não conectado — execução agendada ignorada.`);
  return { ignorado: `${nome} não conectado` };
}

const uuid = z.string().uuid();
const comProduto = z.object({ product_id: uuid }).passthrough();
const comCriativo = z.object({ creative_id: uuid }).passthrough();

export const HANDLERS: RegistroHandlers = {
  DISCOVER_BESTSELLERS: async (ctx) => {
    const pular = await exigirIntegracao(ctx, "mercadolivre", "Mercado Livre");
    if (pular) return pular;
    const p = payload(ctx, z.object({ category_id: z.string().optional() }).passthrough());
    return p.category_id ? descobrirMaisVendidos(p.category_id, ctx) : agendarDescobertaPorCategoria(ctx);
  },
  DISCOVER_TRENDS: async (ctx) => (await exigirIntegracao(ctx, "mercadolivre", "Mercado Livre")) ?? descobrirTendencias(ctx),
  SYNC_CATEGORIES: async (ctx) => {
    const p = payload(ctx, z.object({ category_id: z.string().optional() }).passthrough());
    if (p.category_id) {
      const c = await sincronizarCategoria(p.category_id);
      return { categoria: c.id };
    }
    return { raiz: await sincronizarRaiz() };
  },
  ENRICH_PRODUCT: async (ctx) => {
    const p = payload(ctx, comProduto);
    const r = await enriquecerProduto(p.product_id, ctx);
    // encadeia o score (idempotente por produto)
    const { enfileirar } = await import("./fila");
    await enfileirar({ tipo: "SCORE_PRODUCT", payload: { product_id: p.product_id }, idempotencyKey: `score:${p.product_id}`, entidade: { tipo: "product", id: p.product_id }, parentId: ctx.job.id });
    return r;
  },
  SCORE_PRODUCT: async (ctx) => {
    const p = payload(ctx, comProduto.extend({ reanalisar: z.boolean().optional() }));
    return pontuarProduto(p.product_id, { reanalisarIA: p.reanalisar });
  },
  PROCESS_PIPELINE: async (ctx) => {
    const p = payload(ctx, z.object({ batch: z.number().int().min(1).max(200).default(25) }).passthrough());
    return processarPipeline(p.batch);
  },
  CHECK_PRODUCT: async (ctx) => {
    const p = payload(ctx, comProduto);
    return checarProduto(p.product_id);
  },
  GENERATE_ANGLES: async (ctx) => {
    const p = payload(ctx, comProduto.extend({ quantidade: z.number().int().min(1).max(8).optional() }));
    return gerarAngulos(p.product_id, { quantidade: p.quantidade });
  },
  GENERATE_CREATIVES: async (ctx) => {
    const p = payload(ctx, comProduto.extend({ angle_ids: z.array(uuid).optional(), modo: z.enum(["api", "manual_chatgpt", "upload", "composition"]).optional() }));
    let ids = p.angle_ids ?? [];
    if (!ids.length) {
      // automação: usa os selecionados; senão gera ângulos e pega os melhores
      const cr = await lerConfig("criativos");
      const buscar = async () =>
        ((await mlDb().from("ml_creative_angles").select("id, status, score").eq("product_id", p.product_id).in("status", ["selected", "suggested"]).order("score", { ascending: false })).data ?? []) as { id: string; status: string }[];
      let livres = await buscar();
      if (!livres.length) {
        await gerarAngulos(p.product_id, { quantidade: Math.max(cr.criativos_por_produto, 3) });
        livres = await buscar();
      }
      const selecionados = livres.filter((a) => a.status === "selected");
      ids = (selecionados.length ? selecionados : livres).slice(0, cr.criativos_por_produto).map((a) => a.id);
    }
    const criados = await criarCriativos(p.product_id, ids, { modo: p.modo, actorId: ctx.job.created_by, actorType: ctx.job.created_by ? "user" : "automation" });
    return { criativos: criados.length };
  },
  GENERATE_COPY: async (ctx) => {
    const p = payload(ctx, comCriativo.extend({ then_image: z.boolean().optional() }));
    return gerarCopy(p.creative_id, { encadearImagem: p.then_image, userId: ctx.job.created_by });
  },
  GENERATE_IMAGE: async (ctx) => {
    const p = payload(ctx, comCriativo);
    return gerarImagem(p.creative_id, { userId: ctx.job.created_by });
  },
  GENERATE_PENDING_CREATIVES: async (ctx) => {
    const p = payload(ctx, z.object({ per_run: z.number().int().min(1).max(50).default(5) }).passthrough());
    return gerarCriativosPendentes(p.per_run);
  },
  DISPATCH_PUBLICATIONS: () => despacharPublicacoes(),
  REVALIDATE_SCHEDULED: async (ctx) => {
    const pub = await lerConfig("publicacao");
    const p = payload(ctx, z.object({ lead_minutes: z.number().int().min(5).max(1440).optional() }).passthrough());
    return revalidarAgendados(p.lead_minutes ?? pub.antecedencia_revalidacao_min);
  },
  REVALIDATE_CATALOG: async (ctx) => {
    const pular = await exigirIntegracao(ctx, "mercadolivre", "Mercado Livre");
    if (pular) return pular;
    const p = payload(ctx, z.object({ batch: z.number().int().min(1).max(500).default(50) }).passthrough());
    return revalidarCatalogo(p.batch, ctx);
  },
  PUBLISH_PIN: async (ctx) => {
    const p = payload(ctx, z.object({ pin_id: uuid }));
    return publicarPin(p.pin_id, ctx);
  },
  FETCH_PIN_ANALYTICS: async (ctx) => {
    const pular = await exigirIntegracao(ctx, "pinterest", "Pinterest");
    if (pular) return pular;
    const p = payload(ctx, z.object({ lookback_days: z.number().int().min(1).max(89).default(30), pin_id: uuid.optional() }).passthrough());
    return coletarMetricas(ctx, { lookbackDias: p.lookback_days, pinId: p.pin_id });
  },
  COMPUTE_PERFORMANCE: () => calcularPerformance(),
  REFRESH_TOKENS: () => renovarTokens(),
  SYNC_BOARDS: async (ctx) => (await exigirIntegracao(ctx, "pinterest", "Pinterest")) ?? sincronizarBoards(),
  DIAGNOSTICS: async (ctx) => ({ ...(await diagnosticar(ctx)) }),
  // ---------------------------------------------------------------- V2
  IMPORT_PRODUCT_MEDIA: async (ctx) => {
    const p = payload(ctx, comProduto.extend({ refresh: z.boolean().optional() }));
    return importarMidia(p.product_id, { refresh: p.refresh, ctx });
  },
  REFRESH_PRODUCT_MEDIA: async (ctx) => {
    const p = payload(ctx, z.object({ product_id: uuid.optional(), batch: z.number().int().min(1).max(200).default(30) }).passthrough());
    if (p.product_id) return importarMidia(p.product_id, { refresh: true, ctx });
    // agendado: produtos em produção com fotos importadas há mais de 7 dias (ou nunca)
    const semana = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await mlDb()
      .from("ml_products")
      .select("id")
      .in("status", ["approved", "waiting_affiliate_link", "ready_for_creative", "creative_draft", "ready_to_schedule", "scheduled", "published"])
      .or(`media_imported_at.is.null,media_imported_at.lt.${semana}`)
      .limit(p.batch);
    const { enfileirar } = await import("./fila");
    for (const { id } of (data ?? []) as { id: string }[]) {
      await enfileirar({ tipo: "IMPORT_PRODUCT_MEDIA", payload: { product_id: id, refresh: true }, idempotencyKey: `media:${id}`, entidade: { tipo: "product", id }, parentId: ctx.job.id });
    }
    return { produtos: (data ?? []).length };
  },
  PREPARE_PRODUCT_CUTOUT: async (ctx) => {
    const p = payload(ctx, z.object({ media_id: uuid }));
    const r = await prepararRecorte(p.media_id, ctx);
    // retoma as variantes do produto que esperavam o recorte
    const { data: m } = await mlDb().from("ml_product_media").select("product_id").eq("id", p.media_id).single();
    const { data: esperando } = await mlDb()
      .from("ml_creatives")
      .select("id")
      .eq("product_id", (m as { product_id: string }).product_id)
      .not("family_id", "is", null)
      .is("base_asset_id", null)
      .in("status", ["to_generate", "generating"]);
    for (const { id } of (esperando ?? []) as { id: string }[]) await avancarVariante(id);
    return { ...r, variantes_retomadas: (esperando ?? []).length };
  },
  PLAN_CREATIVE_FAMILY: async (ctx) => planejarFamilia(payload(ctx, z.object({ family_id: uuid })).family_id, ctx),
  GENERATE_CREATIVE_BATCH: async (ctx) => gerarLote(payload(ctx, z.object({ family_id: uuid })).family_id, ctx),
  GENERATE_LIFESTYLE_BACKGROUND: async (ctx) => gerarFundo(payload(ctx, comCriativo).creative_id, ctx),
  GENERATE_REFERENCE_IMAGE: async (ctx) => gerarPorReferencia(payload(ctx, comCriativo).creative_id, ctx),
  COMPOSE_EXACT_PRODUCT: async (ctx) => comporVariante(payload(ctx, comCriativo).creative_id, ctx),
  APPLY_TEXT_OVERLAY: async (ctx) => aplicarOverlay(payload(ctx, comCriativo).creative_id, ctx),
  CHECK_CREATIVE_FIDELITY: async (ctx) => checarFidelidade(payload(ctx, comCriativo).creative_id, ctx),
  GENERATE_PINTEREST_PACKAGE: async (ctx) => {
    const p = payload(ctx, z.object({ creative_id: uuid.optional(), batch: z.number().int().min(1).max(100).default(20) }).passthrough());
    if (p.creative_id) return gerarPacote(p.creative_id, ctx);
    // agendado: aprovados com pacote faltando/incompleto/inválido → gera ou revalida
    const { data } = await mlDb()
      .from("ml_creatives")
      .select("id, package_status")
      .not("family_id", "is", null)
      .eq("status", "approved")
      .in("package_status", ["missing", "incomplete", "invalid"])
      .limit(p.batch);
    let gerados = 0;
    for (const c of (data ?? []) as { id: string; package_status: string }[]) {
      if (ctx.restanteMs() < 20_000) break;
      if (c.package_status === "missing") await gerarPacote(c.id, ctx);
      else await revalidarPacote(c.id);
      gerados++;
    }
    return { processados: gerados };
  },
  VALIDATE_AFFILIATE_REDIRECT: async (ctx) => {
    const p = payload(ctx, z.object({ link_id: uuid.optional(), batch: z.number().int().min(1).max(500).default(50) }).passthrough());
    if (p.link_id) return validarRedirectLink(p.link_id);
    return validarRedirectsLote(p.batch);
  },
  // §15: o rollup diário por família/variante/cena/tipo é o mesmo cálculo de performance (dimensões ampliadas na ml05)
  ROLLUP_CREATIVE_PERFORMANCE: () => calcularPerformance(),
  CLEANUP: async (ctx) => {
    const p = payload(ctx, z.object({ retention_days: z.number().int().min(1).max(3650).default(30) }).passthrough());
    return limpar(p.retention_days);
  },
};
