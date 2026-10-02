"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { mlDb } from "@/lib/ml/db";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as criativos from "@/lib/ml/servicos/criativos";
import * as publicacao from "@/lib/ml/servicos/publicacao";
import { recalcularStatus } from "@/lib/ml/servicos/produtos";

const id = z.string().uuid();
const ids = z.array(id).min(1).max(200);
const revalidar = () => revalidatePath("/ml", "layout");

export async function aprovarCriativos(lista: string[]) {
  return executarAcao("operator", async (s) => {
    let feitos = 0;
    const falhas: string[] = [];
    for (const c of ids.parse(lista)) {
      try {
        await criativos.aprovarCriativo(c, { actorId: s.userId, actorType: "user" });
        feitos++;
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : String(e));
      }
    }
    revalidar();
    return { feitos, falhas, mensagem: `${feitos} aprovado(s)${falhas.length ? ` · ${falhas.length} com erro: ${falhas[0]}` : ""}.` };
  });
}

export async function rejeitarCriativos(lista: string[], motivo: string) {
  return executarAcao("operator", async (s) => {
    const m = z.string().min(2).max(300).parse(motivo);
    let feitos = 0;
    const falhas: string[] = [];
    for (const c of ids.parse(lista)) {
      try {
        await criativos.rejeitarCriativo(c, m, { actorId: s.userId, actorType: "user" });
        feitos++;
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : String(e));
      }
    }
    revalidar();
    return { feitos, falhas, mensagem: `${feitos} rejeitado(s)${falhas.length ? ` · ${falhas.length} com erro: ${falhas[0]}` : ""}.` };
  });
}

export async function voltarParaRevisao(creativeId: string) {
  return executarAcao("operator", async (s) => {
    await criativos.mudarStatusCriativo(id.parse(creativeId), "review", { motivo: "Reaberto para revisão", actorId: s.userId, actorType: "user" });
    const c = await criativos.lerCriativo(creativeId);
    await recalcularStatus(c.product_id, { actorId: s.userId, actorType: "user" });
    revalidar();
    return { mensagem: "De volta para revisão." };
  });
}

export async function arquivarCriativo(creativeId: string) {
  return executarAcao("operator", async (s) => {
    await criativos.mudarStatusCriativo(id.parse(creativeId), "archived", { motivo: "Arquivado", actorId: s.userId, actorType: "user" });
    const c = await criativos.lerCriativo(creativeId);
    await recalcularStatus(c.product_id, { actorId: s.userId, actorType: "user" });
    revalidar();
    return { mensagem: "Arquivado." };
  });
}

/** "Regerar imagem" — mantém a copy. */
export async function regerarImagem(creativeId: string, modo?: string) {
  return executarAcao("operator", async (s) => {
    const c = await criativos.lerCriativo(id.parse(creativeId));
    if (["published", "archived"].includes(c.status)) throw new Error("Criativo publicado/arquivado não pode ser regenerado.");
    if (c.family_id) {
      const { regerarCena } = await import("@/lib/ml/servicos/variantes");
      await regerarCena(c.id, s.userId);
      await chutarWorker();
      return { jobId: undefined as string | undefined, mensagem: "Gerando nova cena (a anterior fica no histórico)…" };
    }
    if (modo) {
      const m = z.enum(["api", "manual_chatgpt", "upload", "composition"]).parse(modo);
      await mlDb().from("ml_creatives").update({ image_mode: m }).eq("id", c.id);
    }
    if (c.status === "approved") await criativos.mudarStatusCriativo(c.id, "review", { motivo: "Imagem será regenerada", actorId: s.userId });
    const { job } = await enfileirar({ tipo: "GENERATE_IMAGE", payload: { creative_id: c.id }, idempotencyKey: `image:${c.id}`, entidade: { tipo: "creative", id: c.id }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Regenerando a imagem…" };
  });
}

/** "Regerar copy" — mantém a imagem. */
export async function regerarCopy(creativeId: string) {
  return executarAcao("operator", async (s) => {
    const c = await criativos.lerCriativo(id.parse(creativeId));
    if (["published", "archived"].includes(c.status)) throw new Error("Criativo publicado/arquivado não pode ser regenerado.");
    if (c.status === "approved") await criativos.mudarStatusCriativo(c.id, "review", { motivo: "Textos serão regenerados", actorId: s.userId });
    if (c.family_id) {
      await mlDb().from("ml_creatives").update({ package_status: "missing" }).eq("id", c.id);
      const { job } = await enfileirar({ tipo: "GENERATE_PINTEREST_PACKAGE", payload: { creative_id: c.id }, idempotencyKey: `v2:GENERATE_PINTEREST_PACKAGE:${c.id}`, entidade: { tipo: "creative", id: c.id }, criadoPor: s.userId });
      await chutarWorker();
      return { jobId: job.id, mensagem: "Gerando novo pacote Pinterest…" };
    }
    const { job } = await enfileirar({ tipo: "GENERATE_COPY", payload: { creative_id: c.id }, idempotencyKey: `copy:${c.id}`, entidade: { tipo: "creative", id: c.id }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Gerando novos textos…" };
  });
}

const edicao = z.object({
  headline: z.string().max(80).optional(),
  title: z.string().max(120).optional(),
  description: z.string().max(900).optional(),
  alt_text: z.string().max(500).optional(),
  cta: z.string().max(40).optional(),
  keywords: z.array(z.string().max(60)).max(15).optional(),
  board_id: z.string().uuid().nullable().optional(),
});

export async function editarCriativo(creativeId: string, dados: z.infer<typeof edicao>) {
  return executarAcao("operator", async (s) => {
    const alteracoes = await criativos.editarCriativo(id.parse(creativeId), edicao.parse(dados), s.userId);
    revalidar();
    return { alteracoes, mensagem: alteracoes.length ? `Salvo com ajustes: ${alteracoes.join(" ")}` : "Salvo." };
  });
}

export async function duplicarCriativo(creativeId: string) {
  return executarAcao("operator", async (s) => {
    const novo = await criativos.duplicarCriativo(id.parse(creativeId), s.userId);
    revalidar();
    return { creativeId: novo, mensagem: "Variante criada." };
  });
}

/** Upload da imagem final (modo ChatGPT/upload) ou substituição de imagem. */
export async function enviarImagem(creativeId: string, form: FormData) {
  return executarAcao("operator", async (s) => {
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("Selecione uma imagem.");
    if (arquivo.size > 9.5 * 1024 * 1024) throw new Error("Imagem acima de 9,5 MB (limite de envio do app).");
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const r = await criativos.receberImagemManual(id.parse(creativeId), bytes, s.userId);
    revalidar();
    return { avisos: r.avisos, mensagem: r.avisos.length ? `Imagem salva. ${r.avisos.join(" ")}` : "Imagem salva — criativo em revisão." };
  });
}

const quando = z.union([z.literal("auto"), z.literal("agora"), z.string().datetime({ offset: true })]);

/** Criativo aprovado → Pin (rascunho/agendado/publicar agora). */
export async function criarPin(creativeId: string, opcoes: { boardId?: string | null; quando?: string | null; ignorarRepeticao?: boolean }) {
  return executarAcao("operator", async (s) => {
    const q = opcoes.quando ? quando.parse(opcoes.quando) : null;
    const pin = await publicacao.criarPin(id.parse(creativeId), {
      boardId: opcoes.boardId ? id.parse(opcoes.boardId) : null,
      quando: q === "auto" || q === "agora" ? q : q ? new Date(q) : null,
      ignorarRepeticao: Boolean(opcoes.ignorarRepeticao),
      actorId: s.userId,
      actorType: "user",
    });
    if (q === "agora") await chutarWorker();
    revalidar();
    return {
      pinId: pin.id,
      mensagem:
        pin.status === "scheduled"
          ? q === "agora"
            ? "Publicando…"
            : `Agendado para ${new Date(pin.scheduled_at!).toLocaleString("pt-BR", { timeZone: pin.timezone ?? "America/Sao_Paulo" })}.`
          : pin.status === "pending_approval"
            ? "Pin criado, aguardando aprovação."
            : "Rascunho criado.",
    };
  });
}

export async function gerarCriativosEmLote(productIds: string[]) {
  return executarAcao("operator", async (s) => {
    for (const p of ids.parse(productIds)) {
      await enfileirar({ tipo: "GENERATE_CREATIVES", payload: { product_id: p }, idempotencyKey: `creatives:${p}`, entidade: { tipo: "product", id: p }, criadoPor: s.userId });
    }
    await auditar({ acao: "criativos.gerar_lote", actorId: s.userId, metadata: { produtos: productIds.length } });
    await chutarWorker();
    return { mensagem: `Geração enfileirada para ${productIds.length} produto(s).` };
  });
}

/** "Imagem escolhida": volta para uma imagem anterior do histórico do criativo. */
export async function usarImagem(creativeId: string, assetId: string) {
  return executarAcao("operator", async (s) => {
    await criativos.usarAsset(id.parse(creativeId), id.parse(assetId), s.userId);
    revalidar();
    return { mensagem: "Imagem trocada — criativo em revisão." };
  });
}

/** Crop 2:3 por ponto focal (x/y de 0 a 1, zoom ≥ 1). Gera nova versão; a anterior fica no histórico. */
export async function recortarImagem(creativeId: string, foco: { x: number; y: number; zoom: number }) {
  return executarAcao("operator", async (s) => {
    const f = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(4) }).parse(foco);
    await criativos.recortarImagem(id.parse(creativeId), f, s.userId);
    revalidar();
    return { mensagem: "Recorte aplicado." };
  });
}
