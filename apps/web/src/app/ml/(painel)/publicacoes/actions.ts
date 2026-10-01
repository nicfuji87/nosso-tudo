"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { mlDb } from "@/lib/ml/db";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as pub from "@/lib/ml/servicos/publicacao";

const id = z.string().uuid();
const ids = z.array(id).min(1).max(200);
const revalidar = () => revalidatePath("/ml", "layout");
const ator = (userId: string) => ({ actorId: userId, actorType: "user" as const });

export async function agendarPin(pinId: string, quando: string) {
  return executarAcao("operator", async (s) => {
    const q = z.union([z.literal("auto"), z.string().datetime({ offset: true })]).parse(quando);
    const pin = await pub.agendarPin(id.parse(pinId), q === "auto" ? "auto" : new Date(q), ator(s.userId));
    revalidar();
    return { mensagem: `Agendado para ${new Date(pin.scheduled_at!).toLocaleString("pt-BR", { timeZone: pin.timezone ?? "America/Sao_Paulo" })}.` };
  });
}

export async function publicarAgora(pinId: string) {
  return executarAcao("operator", async (s) => {
    await pub.publicarAgora(id.parse(pinId), ator(s.userId));
    await chutarWorker();
    revalidar();
    return { mensagem: "Validando e publicando…" };
  });
}

export async function aprovarPins(lista: string[]) {
  return executarAcao("operator", async (s) => {
    for (const p of ids.parse(lista)) await pub.aprovarPin(p, ator(s.userId));
    revalidar();
    return { mensagem: "Publicação(ões) aprovada(s)." };
  });
}

export async function pausarPin(pinId: string) {
  return executarAcao("operator", async (s) => {
    await pub.pausarPin(id.parse(pinId), ator(s.userId));
    revalidar();
    return { mensagem: "Pausado — não sai automaticamente." };
  });
}

export async function retomarPin(pinId: string) {
  return executarAcao("operator", async (s) => {
    await pub.retomarPin(id.parse(pinId), ator(s.userId));
    revalidar();
    return { mensagem: "Retomado." };
  });
}

export async function cancelarPins(lista: string[]) {
  return executarAcao("operator", async (s) => {
    for (const p of ids.parse(lista)) await pub.cancelarPin(p, ator(s.userId));
    revalidar();
    return { mensagem: "Cancelado(s). O criativo continua disponível." };
  });
}

export async function editarPin(pinId: string, dados: { title?: string; description?: string; alt_text?: string; board_id?: string; link_url?: string }) {
  return executarAcao("operator", async (s) => {
    const d = z
      .object({
        title: z.string().max(100).optional(),
        description: z.string().max(800).optional(),
        alt_text: z.string().max(500).optional(),
        board_id: z.string().uuid().optional(),
        link_url: z.string().max(2048).optional(),
      })
      .parse(dados);
    await pub.editarPin(id.parse(pinId), d, ator(s.userId));
    revalidar();
    return { mensagem: "Pin atualizado." };
  });
}

export async function duplicarPublicacao(pinId: string, boardId: string, quando: string) {
  return executarAcao("operator", async (s) => {
    const q = z.union([z.literal("auto"), z.string().datetime({ offset: true })]).parse(quando);
    const novo = await pub.duplicarPublicacao(id.parse(pinId), id.parse(boardId), q === "auto" ? "auto" : new Date(q), ator(s.userId));
    revalidar();
    return { pinId: novo.id, mensagem: "Nova publicação criada." };
  });
}

/** Roda a validação pré-publicação agora (sem publicar). */
export async function revalidarPin(pinId: string) {
  return executarAcao("operator", async () => {
    const itens = await pub.validarPin(id.parse(pinId), { checarProdutoOnline: true });
    revalidar();
    const problemas = itens.filter((i) => i.bloqueia);
    return { itens, mensagem: problemas.length ? `${problemas.length} problema(s) encontrado(s).` : "Tudo certo para publicar." };
  });
}

/** Decisão humana: aceitar a mudança de preço e liberar o Pin bloqueado. */
export async function aceitarMudancaPreco(pinId: string) {
  return executarAcao("operator", async (s) => {
    const pin = await pub.lerPin(id.parse(pinId));
    const v = (pin.validation as Record<string, unknown> | null) ?? {};
    const { data: prod } = await mlDb().from("ml_products").select("current_price").eq("id", pin.product_id).single();
    await mlDb()
      .from("ml_pins")
      .update({ validation: { ...v, preco_referencia: (prod as { current_price: number | null }).current_price, ignorar_preco: false } })
      .eq("id", pin.id);
    await pub.agendarPin(pin.id, "auto", ator(s.userId));
    revalidar();
    return { mensagem: "Preço aceito; Pin reagendado na próxima janela." };
  });
}
