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
import { lerConfig } from "../config";
import { mlDb } from "../db";

/** Valida o payload; payload inválido é erro permanente (retry não conserta). */
function payload<T extends z.ZodTypeAny>(ctx: CtxJob, schema: T): z.infer<T> {
  const r = schema.safeParse(ctx.job.payload ?? {});
  if (!r.success) throw new ErroPermanente(`Payload inválido: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return r.data;
}

const uuid = z.string().uuid();
const comProduto = z.object({ product_id: uuid }).passthrough();
const comCriativo = z.object({ creative_id: uuid }).passthrough();

export const HANDLERS: RegistroHandlers = {
  DISCOVER_BESTSELLERS: async (ctx) => {
    const p = payload(ctx, z.object({ category_id: z.string().optional() }).passthrough());
    return p.category_id ? descobrirMaisVendidos(p.category_id, ctx) : agendarDescobertaPorCategoria(ctx);
  },
  DISCOVER_TRENDS: (ctx) => descobrirTendencias(ctx),
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
    const p = payload(ctx, z.object({ batch: z.number().int().min(1).max(500).default(50) }).passthrough());
    return revalidarCatalogo(p.batch, ctx);
  },
  PUBLISH_PIN: async (ctx) => {
    const p = payload(ctx, z.object({ pin_id: uuid }));
    return publicarPin(p.pin_id, ctx);
  },
  FETCH_PIN_ANALYTICS: async (ctx) => {
    const p = payload(ctx, z.object({ lookback_days: z.number().int().min(1).max(89).default(30), pin_id: uuid.optional() }).passthrough());
    return coletarMetricas(ctx, { lookbackDias: p.lookback_days, pinId: p.pin_id });
  },
  COMPUTE_PERFORMANCE: () => calcularPerformance(),
  REFRESH_TOKENS: () => renovarTokens(),
  SYNC_BOARDS: () => sincronizarBoards(),
  DIAGNOSTICS: async (ctx) => ({ ...(await diagnosticar(ctx)) }),
  CLEANUP: async (ctx) => {
    const p = payload(ctx, z.object({ retention_days: z.number().int().min(1).max(3650).default(30) }).passthrough());
    return limpar(p.retention_days);
  },
};
