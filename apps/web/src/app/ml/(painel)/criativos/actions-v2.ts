"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { mlDb } from "@/lib/ml/db";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as v2 from "@/lib/ml/servicos/variantes";
import * as midia from "@/lib/ml/servicos/midia";
import { criarPin } from "@/lib/ml/servicos/publicacao";
import { MODOS_FIDELIDADE, TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { ITENS_FIDELIDADE } from "@/lib/ml/conteudo/ia-v2";

/**
 * Actions da V2 (famílias, variantes, imagens do anúncio, fidelidade, pacote).
 * Ver docs/ml/ESPECIFICACAO-V2.md. Mesmo envelope das demais (executarAcao).
 */
const id = z.string().uuid();
const revalidar = () => revalidatePath("/ml", "layout");

const opcoesLote = z.object({
  mix: z.object({
    lifestyle_no_text: z.number().int().min(0).max(12),
    lifestyle_text: z.number().int().min(0).max(12),
    editorial: z.number().int().min(0).max(12),
    product_layout: z.number().int().min(0).max(12),
  }),
  modo: z.enum(MODOS_FIDELIDADE),
  metodo: z.enum(["auto", "manual_chatgpt", "upload"]),
  presetIds: z.array(id).max(30),
  referenciaIds: z.array(id).max(8).nullish(),
  boardId: id.nullish(),
  angleId: id.nullish(),
  nome: z.string().max(80).nullish(),
  hipotese: z.string().max(300).nullish(),
  objetivo: z.string().max(160).nullish(),
  headlines: z.array(z.string().max(60)).max(6).nullish(),
});
export type OpcoesLoteEntrada = z.infer<typeof opcoesLote>;

// ---------------------------------------------------------------------------
// Imagens do anúncio (§4, §11.3)
// ---------------------------------------------------------------------------
export async function importarImagens(productId: string) {
  return executarAcao("operator", async (s) => {
    const p = id.parse(productId);
    const { job } = await enfileirar({ tipo: "IMPORT_PRODUCT_MEDIA", payload: { product_id: p, refresh: true }, idempotencyKey: `media:${p}`, entidade: { tipo: "product", id: p }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Importando as imagens do anúncio…" };
  });
}

export async function definirPapelImagem(mediaId: string, papel: string) {
  return executarAcao("operator", async (s) => {
    const r = z.enum(["primary_reference", "complementary", "do_not_use", "consult_only"]).parse(papel);
    await midia.definirPapel(id.parse(mediaId), r, s.userId);
    revalidar();
    const rotulo = { primary_reference: "Referência principal", complementary: "Referência complementar", do_not_use: "Não usar", consult_only: "Somente consulta" }[r];
    return { mensagem: `Marcada como: ${rotulo}.` };
  });
}

export async function adicionarImagemUrl(productId: string, url: string) {
  return executarAcao("operator", async (s) => {
    await midia.adicionarMidiaUrl(id.parse(productId), z.string().url().max(2000).parse(url.trim()), s.userId);
    revalidar();
    return { mensagem: "Imagem adicionada à galeria." };
  });
}

export async function enviarImagemProduto(productId: string, form: FormData) {
  return executarAcao("operator", async (s) => {
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("Selecione uma imagem.");
    if (arquivo.size > 9.5 * 1024 * 1024) throw new Error("Imagem acima de 9,5 MB.");
    await midia.enviarMidia(id.parse(productId), Buffer.from(await arquivo.arrayBuffer()), s.userId);
    revalidar();
    return { mensagem: "Imagem enviada para a galeria." };
  });
}

export async function prepararRecorteAgora(mediaId: string) {
  return executarAcao("operator", async (s) => {
    const m = id.parse(mediaId);
    await mlDb().from("ml_product_media").update({ cutout_status: "none", cutout_note: null }).eq("id", m).neq("cutout_status", "ready");
    const { job } = await enfileirar({ tipo: "PREPARE_PRODUCT_CUTOUT", payload: { media_id: m }, idempotencyKey: `cutout:${m}`, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Preparando o recorte do produto…" };
  });
}

// ---------------------------------------------------------------------------
// Wizard Gerar Lote (§11.6)
// ---------------------------------------------------------------------------
export async function estimarLote(productId: string, opcoes: OpcoesLoteEntrada) {
  return executarAcao("viewer", async () => {
    const e = await v2.estimarLote(id.parse(productId), opcoesLote.parse(opcoes));
    return { estimativa: e };
  });
}

export async function criarFamilia(productId: string, opcoes: OpcoesLoteEntrada, confirmarCusto = false) {
  return executarAcao("operator", async (s) => {
    const r = await v2.criarFamiliaELote(id.parse(productId), opcoesLote.parse(opcoes), { actorId: s.userId, actorType: "user", confirmarCusto });
    await chutarWorker();
    revalidar();
    return { familyId: r.familyId, jobId: r.jobId, mensagem: `Família criada — ${r.estimativa.jobs} etapas na fila${r.estimativa.custoUsd ? ` (custo estimado US$ ${r.estimativa.custoUsd.toFixed(2)})` : ""}.` };
  });
}

/** Dashboard: "Gerar lote de criativos dos produtos elegíveis". */
export async function gerarLotesElegiveis(limite = 5) {
  return executarAcao("operator", async (s) => {
    const r = await v2.gerarLotesElegiveis(z.number().int().min(1).max(20).parse(limite), { actorId: s.userId, actorType: "user" });
    await chutarWorker();
    revalidar();
    return { ...r, mensagem: `${r.familias} família(s) criada(s)${r.pulados ? `; ${r.pulados} produto(s) pulados (sem referência ou acima do custo)` : ""}.` };
  });
}

// ---------------------------------------------------------------------------
// Família (§11.5)
// ---------------------------------------------------------------------------
export async function arquivarFamilia(familyId: string) {
  return executarAcao("operator", async (s) => {
    await v2.arquivarFamilia(id.parse(familyId), s.userId);
    revalidar();
    return { mensagem: "Família arquivada; Pins não publicados foram cancelados." };
  });
}

export async function duplicarHipotese(familyId: string) {
  return executarAcao("operator", async (s) => {
    const novo = await v2.duplicarHipotese(id.parse(familyId), s.userId);
    revalidar();
    return { familyId: novo, mensagem: "Hipótese duplicada — gere um lote para ela." };
  });
}

/** Gera o lote de uma família criada por "Duplicar hipótese" (ainda sem variantes). */
export async function gerarLoteFamilia(familyId: string) {
  return executarAcao("operator", async (s) => {
    const f = id.parse(familyId);
    const { job } = await enfileirar({ tipo: "PLAN_CREATIVE_FAMILY", payload: { family_id: f }, idempotencyKey: `plan:${f}`, entidade: { tipo: "family", id: f }, criadoPor: s.userId });
    await mlDb().from("ml_creative_families").update({ batch_job_id: job.id }).eq("id", f);
    await chutarWorker();
    return { jobId: job.id, mensagem: "Gerando o lote da família…" };
  });
}

export async function adicionarVariante(familyId: string, dados: { visual_type: string; scene_preset_id: string | null; fidelity_mode: string; metodo: string; headline?: string | null }) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({
        visual_type: z.enum(TIPOS_VISUAIS),
        scene_preset_id: id.nullable(),
        fidelity_mode: z.enum(MODOS_FIDELIDADE),
        metodo: z.enum(["auto", "manual_chatgpt", "upload"]),
        headline: z.string().max(60).nullish(),
      })
      .parse(dados);
    const novo = await v2.adicionarVariante(id.parse(familyId), d, s.userId);
    await chutarWorker();
    revalidar();
    return { creativeId: novo, mensagem: "Variante adicionada e em produção." };
  });
}

/** "Agendar aprovados": cada variante aprovada sem Pin entra na próxima janela que respeite cooldown/repetição. */
export async function agendarAprovadosFamilia(familyId: string) {
  return executarAcao("operator", async (s) => {
    const { data } = await mlDb().from("ml_creatives").select("id").eq("family_id", id.parse(familyId)).eq("status", "approved");
    let agendados = 0;
    const erros: string[] = [];
    for (const { id: cid } of (data ?? []) as { id: string }[]) {
      const { count } = await mlDb().from("ml_pins").select("id", { count: "exact", head: true }).eq("creative_id", cid).neq("status", "canceled");
      if (count) continue;
      try {
        await criarPin(cid, { quando: "auto", actorId: s.userId, actorType: "user" });
        agendados++;
      } catch (e) {
        erros.push(e instanceof Error ? e.message : String(e));
      }
    }
    revalidar();
    return { agendados, erros, mensagem: `${agendados} variante(s) agendada(s)${erros.length ? ` · ${erros.length} não couberam: ${erros[0]}` : ""}.` };
  });
}

// ---------------------------------------------------------------------------
// Variante (§11.5, §5.2)
// ---------------------------------------------------------------------------
export async function regerarCena(creativeId: string) {
  return executarAcao("operator", async (s) => {
    await v2.regerarCena(id.parse(creativeId), s.userId);
    await chutarWorker();
    revalidar();
    return { mensagem: "Gerando nova cena (a anterior fica no histórico)…" };
  });
}

export async function regerarPacote(creativeId: string) {
  return executarAcao("operator", async (s) => {
    const c = id.parse(creativeId);
    await mlDb().from("ml_creatives").update({ package_status: "missing" }).eq("id", c).neq("status", "published");
    const { job } = await enfileirar({ tipo: "GENERATE_PINTEREST_PACKAGE", payload: { creative_id: c }, idempotencyKey: `v2:GENERATE_PINTEREST_PACKAGE:${c}`, entidade: { tipo: "creative", id: c }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Gerando novo pacote Pinterest…" };
  });
}

export async function trocarReferencia(creativeId: string, mediaIds: string[]) {
  return executarAcao("operator", async (s) => {
    await v2.trocarReferencia(id.parse(creativeId), z.array(id).min(1).max(8).parse(mediaIds), s.userId);
    await chutarWorker();
    revalidar();
    return { mensagem: "Referência trocada; a variante será refeita." };
  });
}

const checklist = z.record(z.string(), z.boolean()).refine((r) => ITENS_FIDELIDADE.every((i) => i.chave in r), "Responda todos os itens do checklist.");

export async function revisarFidelidade(creativeId: string, respostas: Record<string, boolean>, nota?: string | null) {
  return executarAcao("operator", async (s) => {
    const st = await v2.revisarFidelidade(id.parse(creativeId), checklist.parse(respostas), z.string().max(500).nullish().parse(nota) ?? null, s.userId);
    revalidar();
    return { status: st, mensagem: st === "human_ok" ? "Fidelidade confirmada." : "Problema de fidelidade registrado." };
  });
}

export async function marcarProblemaFidelidade(creativeId: string, nota: string) {
  return executarAcao("operator", async (s) => {
    const respostas = Object.fromEntries(ITENS_FIDELIDADE.map((i) => [i.chave, false]));
    await v2.revisarFidelidade(id.parse(creativeId), respostas, z.string().min(2).max(500).parse(nota), s.userId);
    revalidar();
    return { mensagem: "Problema de fidelidade registrado — a variante não pode ser aprovada até ser refeita." };
  });
}

export async function checarFidelidadeAgora(creativeId: string) {
  return executarAcao("operator", async (s) => {
    const c = id.parse(creativeId);
    await mlDb().from("ml_creatives").update({ fidelity_status: "pending", fidelity_checked_at: null }).eq("id", c);
    const { job } = await enfileirar({ tipo: "CHECK_CREATIVE_FIDELITY", payload: { creative_id: c }, idempotencyKey: `v2:CHECK_CREATIVE_FIDELITY:${c}`, entidade: { tipo: "creative", id: c }, criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Checando fidelidade com IA…" };
  });
}

export async function excluirRascunho(creativeId: string) {
  return executarAcao("operator", async (s) => {
    await v2.excluirRascunho(id.parse(creativeId), s.userId);
    revalidar();
    return { mensagem: "Rascunho excluído." };
  });
}

/** Campos do pacote que não existem no editor legado (seção do board e interesses de referência). */
export async function editarPacoteExtra(creativeId: string, dados: { board_section_id?: string | null; interests?: string[] }) {
  return executarAcao("operator", async () => {
    const d = z.object({ board_section_id: z.string().regex(/^\d+$/).nullish(), interests: z.array(z.string().max(60)).max(10).optional() }).parse(dados);
    await mlDb().from("ml_creatives").update(d).eq("id", id.parse(creativeId));
    await v2.revalidarPacote(creativeId);
    revalidar();
    return { mensagem: "Pacote atualizado." };
  });
}

/** Upload do modo manual/upload na V2 — informa se a imagem foi feita com IA (para o AI disclosure). */
export async function enviarImagemVariante(creativeId: string, form: FormData) {
  return executarAcao("operator", async (s) => {
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new Error("Selecione uma imagem.");
    if (arquivo.size > 9.5 * 1024 * 1024) throw new Error("Imagem acima de 9,5 MB.");
    const feitaComIA = form.get("feita_com_ia") === "true";
    const r = await v2.receberImagemVariante(id.parse(creativeId), Buffer.from(await arquivo.arrayBuffer()), { userId: s.userId, feitaComIA });
    await chutarWorker();
    revalidar();
    return { avisos: r.avisos, mensagem: r.avisos.length ? `Imagem recebida. ${r.avisos.join(" ")}` : "Imagem recebida — checando fidelidade e gerando o pacote." };
  });
}
