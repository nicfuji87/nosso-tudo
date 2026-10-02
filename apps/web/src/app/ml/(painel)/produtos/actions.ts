"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { mlDb } from "@/lib/ml/db";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { MOTIVOS_DESCARTE } from "@/lib/ml/estados";
import * as produtos from "@/lib/ml/servicos/produtos";
import * as afiliados from "@/lib/ml/servicos/afiliados";
import * as criativos from "@/lib/ml/servicos/criativos";
import * as ml from "@/lib/ml/integracoes/mercadolivre";
import { garantirCategoria } from "@/lib/ml/servicos/categorias";

const ids = z.array(z.string().uuid()).min(1).max(200);
const id = z.string().uuid();
const motivos = MOTIVOS_DESCARTE.map((m) => m.value) as [string, ...string[]];

function revalidar() {
  revalidatePath("/ml", "layout");
}

/** Resultado de lote: o que deu certo e o que falhou (com motivo), sem abortar tudo. */
async function emLote(lista: string[], f: (id: string) => Promise<unknown>) {
  const falhas: { id: string; erro: string }[] = [];
  let feitos = 0;
  for (const i of lista) {
    try {
      await f(i);
      feitos++;
    } catch (e) {
      falhas.push({ id: i, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { feitos, falhas };
}

export async function aprovarProdutos(lista: string[]) {
  return executarAcao("operator", async (s) => {
    const r = await emLote(ids.parse(lista), (i) => produtos.aprovarProduto(i, { actorId: s.userId, actorType: "user" }));
    await chutarWorker();
    revalidar();
    return { ...r, mensagem: `${r.feitos} aprovado(s)${r.falhas.length ? `, ${r.falhas.length} com erro` : ""}.` };
  });
}

export async function descartarProdutos(lista: string[], motivo: string, nota?: string) {
  return executarAcao("operator", async (s) => {
    const m = z.enum(motivos).parse(motivo);
    const n = z.string().max(500).optional().parse(nota);
    const r = await emLote(ids.parse(lista), (i) => produtos.descartarProduto(i, m, n ?? null, { actorId: s.userId, actorType: "user" }));
    revalidar();
    return { ...r, mensagem: `${r.feitos} descartado(s).` };
  });
}

export async function restaurarProduto(productId: string) {
  return executarAcao("operator", async (s) => {
    await produtos.restaurarProduto(id.parse(productId), { actorId: s.userId, actorType: "user" });
    revalidar();
    return { mensagem: "Descarte desfeito." };
  });
}

export async function reanalisarProdutos(lista: string[]) {
  return executarAcao("operator", async (s) => {
    const jobs: string[] = [];
    for (const p of ids.parse(lista)) {
      const { job } = await enfileirar({
        tipo: "SCORE_PRODUCT",
        payload: { product_id: p, reanalisar: true },
        idempotencyKey: `score:${p}`,
        entidade: { tipo: "product", id: p },
        criadoPor: s.userId,
      });
      jobs.push(job.id);
    }
    await auditar({ acao: "produto.reanalisar", actorId: s.userId, metadata: { produtos: lista.length } });
    await chutarWorker();
    return { jobId: jobs.length === 1 ? jobs[0] : undefined, mensagem: `Reanálise enfileirada para ${jobs.length} produto(s).` };
  });
}

export async function forcarAtualizacao(productId: string) {
  return executarAcao("operator", async (s) => {
    const p = id.parse(productId);
    const { job } = await enfileirar({ tipo: "ENRICH_PRODUCT", payload: { product_id: p }, idempotencyKey: `enrich:${p}`, entidade: { tipo: "product", id: p }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Atualização iniciada." };
  });
}

export async function pausarProduto(productId: string) {
  return executarAcao("operator", async (s) => {
    await produtos.pausarProduto(id.parse(productId), { actorId: s.userId, actorType: "user" });
    revalidar();
    return { mensagem: "Produto pausado." };
  });
}

export async function retomarProduto(productId: string) {
  return executarAcao("operator", async (s) => {
    await produtos.retomarProduto(id.parse(productId), { actorId: s.userId, actorType: "user" });
    revalidar();
    return { mensagem: "Produto retomado." };
  });
}

// ---------------------------------------------------------------------------
// Link de afiliado
// ---------------------------------------------------------------------------
export async function validarLinkAfiliado(productId: string, url: string) {
  return executarAcao("operator", async () => {
    const v = await afiliados.validarParaProduto(id.parse(productId), z.string().max(4000).parse(url), true);
    return { valido: v.ok, url: v.url, tipo: v.tipo, erros: v.erros, avisos: v.avisos };
  });
}

export async function salvarLinkAfiliado(productId: string, url: string, label?: string | null) {
  return executarAcao("operator", async (s) => {
    const r = await afiliados.salvarLinkAfiliado({
      productId: id.parse(productId),
      url: z.string().max(4000).parse(url),
      label: z.string().max(80).nullish().parse(label) ?? null,
      userId: s.userId,
    });
    if (!r.ok) throw new Error(r.erros.join(" "));
    await chutarWorker();
    revalidar();
    return { status: r.status, avisos: r.avisos, mensagem: "Link salvo." };
  });
}

export async function removerLinkAfiliado(productId: string) {
  return executarAcao("operator", async (s) => {
    await afiliados.removerLinkAfiliado(id.parse(productId), s.userId);
    revalidar();
    return { mensagem: "Link removido." };
  });
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------
export async function gerarAngulos(productId: string, quantidade = 4) {
  return executarAcao("operator", async (s) => {
    const p = id.parse(productId);
    const { job } = await enfileirar({
      tipo: "GENERATE_ANGLES",
      payload: { product_id: p, quantidade: z.number().int().min(1).max(8).parse(quantidade) },
      idempotencyKey: `angles:${p}`,
      entidade: { tipo: "product", id: p },
      criadoPor: s.userId,
    });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Gerando ângulos…" };
  });
}

export async function marcarAngulo(angleId: string, status: "selected" | "suggested" | "discarded") {
  return executarAcao("operator", async () => {
    const st = z.enum(["selected", "suggested", "discarded"]).parse(status);
    const { error } = await mlDb().from("ml_creative_angles").update({ status: st }).eq("id", id.parse(angleId)).neq("status", "used");
    if (error) throw new Error(error.message);
    revalidar();
    return { mensagem: st === "selected" ? "Ângulo selecionado." : st === "discarded" ? "Ângulo descartado." : "Seleção removida." };
  });
}

export async function adicionarAnguloManual(productId: string, dados: { type: string; hook: string; audience?: string; keyword?: string }) {
  return executarAcao("operator", async () => {
    const d = z
      .object({ type: z.string().min(2).max(40), hook: z.string().min(3).max(120), audience: z.string().max(160).optional(), keyword: z.string().max(60).optional() })
      .parse(dados);
    const { error } = await mlDb()
      .from("ml_creative_angles")
      .insert({ product_id: id.parse(productId), ...d, source: "manual", status: "selected", score: null });
    if (error) throw new Error(error.message);
    revalidar();
    return { mensagem: "Ângulo adicionado." };
  });
}

const modos = z.enum(["api", "manual_chatgpt", "upload", "composition"]);

/** "Gerar criativos" — para os ângulos escolhidos (ou automático). */
export async function gerarCriativos(productId: string, angleIds: string[] = [], modo?: string) {
  return executarAcao("operator", async (s) => {
    const p = id.parse(productId);
    const m = modo ? modos.parse(modo) : await criativos.modoPadrao();
    if (angleIds.length) {
      const criados = await criativos.criarCriativos(p, z.array(id).max(10).parse(angleIds), { modo: m, actorId: s.userId, actorType: "user" });
      await chutarWorker();
      revalidar();
      return { mensagem: `${criados.length} criativo(s) em produção (${m === "manual_chatgpt" ? "modo manual ChatGPT" : m === "api" ? "IA" : m === "upload" ? "upload" : "composição"}).` };
    }
    const { job } = await enfileirar({ tipo: "GENERATE_CREATIVES", payload: { product_id: p, modo: m }, idempotencyKey: `creatives:${p}`, entidade: { tipo: "product", id: p }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Gerando criativos…" };
  });
}

export async function gerarVariacoes(productId: string) {
  return executarAcao("operator", async (s) => {
    const n = await criativos.gerarVariacoes(id.parse(productId), s.userId);
    await chutarWorker();
    revalidar();
    return { mensagem: `${n} variação(ões) em produção.` };
  });
}

// ---------------------------------------------------------------------------
// Produto manual (origem "busca/manual")
// ---------------------------------------------------------------------------
export async function adicionarProdutoManual(entrada: string) {
  return executarAcao("operator", async (s) => {
    const texto = z.string().min(3).max(2000).parse(entrada);
    const m = /(MLBU?)-?(\d{6,})/i.exec(texto);
    if (!m) throw new Error("Cole a URL do anúncio/produto do Mercado Livre ou o código MLB.");
    const prefixo = m[1]!.toUpperCase();
    const codigo = `${prefixo}${m[2]}`;
    // URL /p/MLB… = produto de catálogo; demais = anúncio (item)
    const ehCatalogo = /\/p\/MLB\d+/i.test(texto) || prefixo === "MLBU";
    const tipo = prefixo === "MLBU" ? "USER_PRODUCT" : ehCatalogo ? "PRODUCT" : "ITEM";
    let detalhe = await ml.resolverProduto(codigo, tipo);
    if (!detalhe && tipo === "ITEM") detalhe = await ml.resolverProduto(codigo, "PRODUCT");
    if (!detalhe) throw new Error("Não foi possível ler este produto pela API do Mercado Livre (acesso negado ou inexistente).");
    const cat = await garantirCategoria(detalhe.categoryId);
    const r = await produtos.registrarObservacao(detalhe, { fonte: "manual", categoriaId: cat });
    await enfileirar({ tipo: "ENRICH_PRODUCT", payload: { product_id: r.id }, idempotencyKey: `enrich:${r.id}`, entidade: { tipo: "product", id: r.id }, criadoPor: s.userId });
    await auditar({ acao: "produto.adicionar_manual", entidade: "product", entidadeId: r.id, actorId: s.userId, metadata: { codigo } });
    await chutarWorker();
    revalidar();
    return { productId: r.id, mensagem: r.novo ? "Produto adicionado; analisando…" : "Produto já existia; atualizando." };
  });
}
