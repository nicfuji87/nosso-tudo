"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { mlDb } from "@/lib/ml/db";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { parseCsvComissoes } from "@/lib/ml/analytics/csv";

const revalidar = () => revalidatePath("/ml", "layout");

export async function coletarMetricasAgora() {
  return executarAcao("operator", async (s) => {
    const { job } = await enfileirar({ tipo: "FETCH_PIN_ANALYTICS", payload: { lookback_days: 30 }, idempotencyKey: "manual:analytics", criadoPor: s.userId });
    await enfileirar({ tipo: "COMPUTE_PERFORMANCE", idempotencyKey: "manual:performance", criadoPor: s.userId, runAt: new Date(Date.now() + 60_000) });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Coletando métricas do Pinterest…" };
  });
}

const comissao = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product_id: z.string().uuid().nullable().optional(),
  pin_id: z.string().uuid().nullable().optional(),
  external_ref: z.string().max(120).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  orders: z.number().int().min(0).nullable().optional(),
  gmv: z.number().min(0).nullable().optional(),
  commission: z.number().min(0),
  note: z.string().max(300).nullable().optional(),
});

export async function adicionarComissao(dados: z.infer<typeof comissao>) {
  return executarAcao("operator", async (s) => {
    const d = comissao.parse(dados);
    if (d.period_end < d.period_start) throw new Error("Período inválido.");
    const { error } = await mlDb().from("ml_commissions").insert({ ...d, source: "manual", created_by: s.userId });
    if (error) throw new Error(error.code === "23505" ? "Já existe uma comissão com esta referência." : error.message);
    await auditar({ acao: "comissao.adicionar", actorId: s.userId, depois: d });
    revalidar();
    return { mensagem: "Comissão registrada." };
  });
}

/** Importa CSV do painel de afiliados (colunas flexíveis; ver lib/ml/analytics/csv.ts). Idempotente por referência. */
export async function importarComissoesCsv(texto: string) {
  return executarAcao("operator", async (s) => {
    const r = parseCsvComissoes(z.string().max(2_000_000).parse(texto));
    if (!r.linhas.length) throw new Error(r.erros[0] ?? "Nenhuma linha válida no arquivo.");
    // Casa produto pelo código MLB citado na linha, quando houver.
    const codigos = Array.from(new Set(r.linhas.map((l) => l.codigo_ml).filter((c): c is string => Boolean(c))));
    const { data: prods } = codigos.length ? await mlDb().from("ml_products").select("id, external_id, item_id").or(codigos.map((c) => `external_id.eq.${c},item_id.eq.${c}`).join(",")) : { data: [] };
    const porCodigo = new Map<string, string>();
    for (const p of (prods ?? []) as { id: string; external_id: string; item_id: string | null }[]) {
      porCodigo.set(p.external_id, p.id);
      if (p.item_id) porCodigo.set(p.item_id, p.id);
    }
    let inseridas = 0;
    let duplicadas = 0;
    for (const l of r.linhas) {
      const { error } = await mlDb()
        .from("ml_commissions")
        .insert({
          period_start: l.inicio,
          period_end: l.fim,
          product_id: l.codigo_ml ? (porCodigo.get(l.codigo_ml) ?? null) : null,
          external_ref: l.referencia,
          clicks: l.cliques,
          orders: l.pedidos,
          gmv: l.gmv,
          commission: l.comissao,
          source: "csv",
          created_by: s.userId,
        });
      if (error?.code === "23505") duplicadas++;
      else if (error) throw new Error(error.message);
      else inseridas++;
    }
    await auditar({ acao: "comissao.importar_csv", actorId: s.userId, metadata: { inseridas, duplicadas, erros: r.erros.length } });
    revalidar();
    return { inseridas, duplicadas, erros: r.erros, mensagem: `${inseridas} linha(s) importada(s)${duplicadas ? `, ${duplicadas} já existiam` : ""}${r.erros.length ? `, ${r.erros.length} ignorada(s)` : ""}.` };
  });
}

export async function removerComissao(commissionId: string) {
  return executarAcao("admin", async (s) => {
    await mlDb().from("ml_commissions").delete().eq("id", z.string().uuid().parse(commissionId));
    await auditar({ acao: "comissao.remover", entidade: "commission", entidadeId: commissionId, actorId: s.userId });
    revalidar();
    return { mensagem: "Removida." };
  });
}
