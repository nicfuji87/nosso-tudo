"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { mlDb } from "@/lib/ml/db";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as afiliados from "@/lib/ml/servicos/afiliados";
import { auditar } from "@/lib/ml/auditoria";

const id = z.string().uuid();

/** Próximo produto aguardando link (maior score primeiro), pulando os ignorados nesta sessão. */
export async function proximoSemLink(pular: string[] = []) {
  return executarAcao("operator", async () => {
    let q = mlDb()
      .from("ml_products")
      .select("id")
      .eq("status", "waiting_affiliate_link")
      .order("score", { ascending: false, nullsFirst: false })
      .order("approved_at", { ascending: true })
      .limit(1);
    const lista = z.array(id).max(500).parse(pular);
    if (lista.length) q = q.not("id", "in", `(${lista.join(",")})`);
    const { data } = await q;
    return { productId: ((data ?? []) as { id: string }[])[0]?.id ?? null };
  });
}

/** "Salvar e próximo": salva, valida e devolve o próximo da fila. */
export async function salvarEProximo(productId: string, url: string, label: string | null, pular: string[] = []) {
  return executarAcao("operator", async (s) => {
    const r = await afiliados.salvarLinkAfiliado({
      productId: id.parse(productId),
      url: z.string().max(4000).parse(url),
      label: z.string().max(80).nullish().parse(label) ?? null,
      userId: s.userId,
    });
    if (!r.ok) throw new Error(r.erros.join(" "));
    await chutarWorker();
    const prox = await proximoSemLink([...pular, productId]);
    revalidatePath("/ml", "layout");
    return { avisos: r.avisos, proximo: prox.ok ? prox.productId : null };
  });
}

export async function resolverPendencia(taskId: string, acao: "done" | "dismissed" | "snoozed", horas = 24) {
  return executarAcao("operator", async (s) => {
    const a = z.enum(["done", "dismissed", "snoozed"]).parse(acao);
    const patch =
      a === "snoozed"
        ? { status: "snoozed", snoozed_until: new Date(Date.now() + z.number().min(1).max(720).parse(horas) * 3_600_000).toISOString() }
        : { status: a, resolved_at: new Date().toISOString(), resolved_by: s.userId };
    const { error } = await mlDb().from("ml_tasks").update(patch).eq("id", id.parse(taskId));
    if (error) throw new Error(error.message);
    await auditar({ acao: `pendencia.${a}`, entidade: "task", entidadeId: taskId, actorId: s.userId });
    revalidatePath("/ml", "layout");
    return { mensagem: a === "snoozed" ? "Adiada." : "Resolvida." };
  });
}

/** Resolve o redirect do link agora e grava destino/host/status (V2 §10). */
export async function validarRedirectAgora(linkId: string) {
  return executarAcao("operator", async () => {
    const { validarRedirectLink } = await import("@/lib/ml/servicos/afiliados");
    const r = await validarRedirectLink(id.parse(linkId));
    revalidatePath("/ml", "layout");
    const rotulo: Record<string, string> = {
      ok: "Redireciona para o produto no Mercado Livre.",
      ok_unverified: "Redireciona para o Mercado Livre (não deu para confirmar que é o mesmo produto).",
      inconsistent: "Destino inconsistente — gere outro link.",
      error: "Não foi possível conferir agora.",
    };
    return { status: r.status, host: r.host, mensagem: rotulo[r.status] ?? r.status };
  });
}
