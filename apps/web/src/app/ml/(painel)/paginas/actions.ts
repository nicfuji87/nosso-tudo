"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { LIMITES_PAGINA } from "@/lib/ml/paginas/regras";
import * as paginas from "@/lib/ml/servicos/paginas";

const id = z.string().uuid();

function revalidar(slug?: string) {
  revalidatePath("/ml/paginas");
  if (slug) revalidatePath(`/achados/${slug}`);
}

/** Criador de páginas: link de afiliado (+ link do produto) → página pronta e URL para o Pin. */
export async function criarPagina(dados: { linkAfiliado: string; linkProduto?: string | null; publicar: boolean }) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({
        linkAfiliado: z.string().trim().min(5, "Cole o link de afiliado.").max(2048),
        linkProduto: z.string().trim().max(2048).nullish(),
        publicar: z.boolean(),
      })
      .parse(dados);
    const r = await paginas.criarPagina(d, { actorId: s.userId });
    revalidar(r.slug);
    return { ...r, mensagem: r.status === "published" ? "Página criada e publicada." : "Rascunho criado." };
  });
}

export async function criarPaginaDoProduto(productId: string) {
  return executarAcao("operator", async (s) => {
    const r = await paginas.criarPaginaDoProduto(id.parse(productId), { actorId: s.userId });
    revalidar(r.slug);
    revalidatePath(`/ml/produtos/${productId}`);
    return { ...r, mensagem: r.existente ? "Este produto já tem página." : "Página criada e publicada." };
  });
}

const imagem = z.object({ url: z.string().url().max(2048), alt: z.string().max(200) });

export async function salvarPagina(
  paginaId: string,
  dados: { titulo: string; resumo: string | null; destaques: string[]; imagens: { url: string; alt: string }[]; cta: string },
) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({
        titulo: z.string().trim().min(3, "Título muito curto.").max(LIMITES_PAGINA.titulo),
        resumo: z.string().max(LIMITES_PAGINA.resumo).nullable(),
        destaques: z.array(z.string().max(LIMITES_PAGINA.destaque)).max(LIMITES_PAGINA.destaques),
        imagens: z.array(imagem).max(LIMITES_PAGINA.imagens),
        cta: z.string().trim().min(2).max(LIMITES_PAGINA.cta),
      })
      .parse(dados);
    const slug = await paginas.editarPagina(id.parse(paginaId), d, { actorId: s.userId });
    revalidar(slug);
    return { mensagem: "Página salva." };
  });
}

export async function mudarStatusPagina(paginaId: string, status: "draft" | "published" | "paused") {
  return executarAcao("operator", async (s) => {
    const slug = await paginas.mudarStatusPagina(id.parse(paginaId), z.enum(["draft", "published", "paused"]).parse(status), { actorId: s.userId });
    revalidar(slug);
    return { mensagem: status === "published" ? "Página publicada." : status === "paused" ? "Página pausada — o Pin mostra “não disponível”." : "Voltou para rascunho." };
  });
}
