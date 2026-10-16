"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { mlDb } from "@/lib/ml/db";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import type { ResultadoBusca } from "@/lib/ml/estudio/busca";
import * as estudio from "@/lib/ml/servicos/estudio";

const id = z.string().uuid();
const mlId = z.string().regex(/^MLB\d{4,}$/i).nullable();

/** 1. Busca por palavra-chave ou link do ML (roda em segundo plano; a tela acompanha o job). */
export async function buscarProdutos(entrada: string) {
  return executarAcao("operator", async (s) => {
    const r = await estudio.iniciarBusca(z.string().trim().min(2).max(2048).parse(entrada), { actorId: s.userId });
    if (r.jobId && !r.reaproveitada) await chutarWorker();
    return r;
  });
}

/** Estado e resultados de uma busca (polling da tela). */
export async function lerBusca(buscaId: string) {
  return executarAcao("viewer", async () => {
    const { data } = await mlDb().from("ml_estudio_buscas").select("id, termo, status, erro, resultados, produto_ref, origem_link, created_at").eq("id", id.parse(buscaId)).maybeSingle();
    if (!data) throw new Error("Busca não encontrada.");
    const b = data as { id: string; termo: string; status: string; erro: string | null; resultados: unknown; produto_ref: unknown; origem_link: string | null; created_at: string };
    return { ...b, resultados: (Array.isArray(b.resultados) ? b.resultados : []) as ResultadoBusca[] };
  });
}

/** 2. Produto escolhido: registra e devolve fotos + link de afiliado salvo. */
const resultadoSchema = z.object({
  id: z.string().regex(/^MLBU?\d{4,}$/i),
  idCatalogo: mlId,
  idAnuncio: mlId,
  idUsuario: z.string().regex(/^MLBU\d{4,}$/i).nullish(),
  titulo: z.string().trim().min(3).max(300),
  imagem: z.string().regex(/^https:\/\/[^/]*mlstatic\.com\//).max(2048).nullable(),
  link: z.string().regex(/^https:\/\/([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?\//i).max(4096).nullable(),
  preco: z.number().nullable(),
  precoAnterior: z.number().nullable(),
  descontoPct: z.number().nullable(),
  vendidos: z.number().nullable(),
  avaliacao: z.number().nullable(),
  numAvaliacoes: z.number().nullable(),
  freteGratis: z.boolean(),
  lojaOficial: z.boolean(),
  internacional: z.boolean(),
  patrocinado: z.boolean(),
  marca: z.string().max(200).nullable(),
  vendedor: z.string().max(200).nullable(),
  categoriaId: z.string().regex(/^MLB\d+$/).nullable().catch(null),
  posicao: z.number().nullable(),
});

export async function escolherProduto(r: ResultadoBusca) {
  return executarAcao("operator", async () => estudio.selecionarProduto(resultadoSchema.parse(r)));
}

/** 3. Prompts salvos. */
export async function salvarPrompt(p: { id?: string | null; nome: string; texto: string }) {
  return executarAcao("operator", async (s) => {
    const d = z.object({ id: id.nullish(), nome: z.string().trim().min(2).max(80), texto: z.string().trim().min(10).max(4000) }).parse(p);
    const promptId = await estudio.salvarPrompt(d, { actorId: s.userId });
    revalidatePath("/ml/estudio");
    return { promptId, mensagem: d.id ? "Prompt atualizado." : "Prompt salvo para as próximas vezes." };
  });
}

export async function excluirPrompt(promptId: string) {
  return executarAcao("operator", async () => {
    await estudio.excluirPrompt(id.parse(promptId));
    revalidatePath("/ml/estudio");
    return { mensagem: "Prompt excluído." };
  });
}

/** 3b. Gera as 3 imagens (jobs em paralelo). */
export async function gerarImagens(p: { productId: string; imagemReferencia: string; promptTexto: string; promptId?: string | null }) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({ productId: id, imagemReferencia: z.string().url().max(2048), promptTexto: z.string().trim().min(10).max(4000), promptId: id.nullish() })
      .parse(p);
    const r = await estudio.gerarImagens(d, { actorId: s.userId });
    await chutarWorker();
    return r;
  });
}

export async function lerImagens(creativeId: string) {
  return executarAcao("viewer", async () => ({ imagens: await estudio.imagensDoCriativo(id.parse(creativeId)) }));
}

/** 4. Imagem escolhida → textos do Pin. */
export async function escolherImagem(creativeId: string, assetId: string) {
  return executarAcao("operator", async (s) => estudio.escolherImagemEGerarTextos(id.parse(creativeId), id.parse(assetId), { actorId: s.userId }));
}

/** 5. Publicar agora. */
export async function publicar(p: { creativeId: string; titulo: string; descricao: string; altText: string; boardId: string; linkAfiliado: string }) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({
        creativeId: id,
        titulo: z.string().trim().min(5, "Título muito curto.").max(100),
        descricao: z.string().trim().min(10, "Descrição muito curta.").max(800),
        altText: z.string().trim().min(5).max(500),
        boardId: id,
        linkAfiliado: z.string().trim().min(5, "Cole o link de afiliado.").max(2048),
      })
      .parse(p);
    const r = await estudio.publicarAgora(d, { actorId: s.userId });
    await chutarWorker();
    revalidatePath("/ml/publicacoes");
    return { ...r, mensagem: "Publicando no Pinterest…" };
  });
}

export async function statusPin(pinId: string) {
  return executarAcao("viewer", async () => estudio.statusDoPin(id.parse(pinId)));
}
