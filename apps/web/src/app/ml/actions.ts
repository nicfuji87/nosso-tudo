"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { lerConfig, salvarConfig } from "@/lib/ml/config";
import { mlDb } from "@/lib/ml/db";
import { enfileirar, jobAtivoPorChave, type JobRow } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { labelJob } from "@/lib/ml/jobs/tipos";

/** Estado de um job para o acompanhamento na UI (polling). */
export async function statusJob(jobId: string) {
  return executarAcao("viewer", async () => {
    if (!z.string().uuid().safeParse(jobId).success) throw new Error("Job inválido.");
    const { data } = await mlDb()
      .from("ml_jobs")
      .select("id, type, status, attempts, max_attempts, last_error, result, progress, run_at, started_at, finished_at")
      .eq("id", jobId)
      .maybeSingle();
    if (!data) throw new Error("Job não encontrado.");
    const j = data as Pick<JobRow, "id" | "type" | "status" | "attempts" | "max_attempts" | "last_error" | "result" | "progress" | "run_at" | "started_at" | "finished_at">;
    // filhos (ex.: descoberta por categoria) entram no progresso agregado
    const { data: filhos } = await mlDb().from("ml_jobs").select("status").eq("parent_id", jobId);
    const contagem: Record<string, number> = {};
    for (const f of (filhos ?? []) as { status: string }[]) contagem[f.status] = (contagem[f.status] ?? 0) + 1;
    return { job: { ...j, label: labelJob(j.type) }, filhos: contagem };
  });
}

/** Dashboard: "Executar descoberta agora". Pede confirmação só se já houver uma igual rodando. */
export async function executarDescobertaAgora(forcar = false) {
  return executarAcao("operator", async (s) => {
    const ativa = await jobAtivoPorChave("manual:discover");
    if (ativa && !forcar) return { jaAtiva: true, jobId: ativa.id, mensagem: "Já existe uma descoberta em execução." };
    const { job } = await enfileirar({ tipo: "DISCOVER_BESTSELLERS", idempotencyKey: "manual:discover", criadoPor: s.userId });
    await auditar({ acao: "descoberta.executar_agora", actorId: s.userId, metadata: { job: job.id } });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Descoberta iniciada." };
  });
}

/** Dashboard: "Processar pendências" — dispara os workers para o que estiver elegível. */
export async function processarPendencias() {
  return executarAcao("operator", async (s) => {
    const tipos = ["PROCESS_PIPELINE", "DISPATCH_PUBLICATIONS", "GENERATE_PENDING_CREATIVES"] as const;
    const ids: string[] = [];
    for (const tipo of tipos) {
      const { job } = await enfileirar({ tipo, idempotencyKey: `manual:${tipo}`, criadoPor: s.userId });
      ids.push(job.id);
    }
    await chutarWorker();
    return { jobId: ids[0], mensagem: "Processamento iniciado. Etapas manuais continuam na Central de Pendências." };
  });
}

export async function alternarPausaGlobal(pausar: boolean) {
  return executarAcao("admin", async (s) => {
    const { antes, depois } = await salvarConfig("automacao", { pausado: pausar }, s.userId);
    await auditar({ acao: pausar ? "automacao.pausar_tudo" : "automacao.retomar_tudo", entidade: "settings", entidadeId: "automacao", antes, depois, actorId: s.userId });
    revalidatePath("/ml", "layout");
    return { mensagem: pausar ? "Automações pausadas." : "Automações retomadas." };
  });
}

/** Garante que o pg_cron saiba onde chamar o worker (domínio publicado). */
export async function registrarUrlApp() {
  return executarAcao("admin", async (s) => {
    const url = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url || /localhost|127\.0\.0\.1/.test(url)) throw new Error("Só é possível registrar no domínio publicado.");
    const rt = await lerConfig("runtime");
    if (rt.app_url === url) return {};
    await salvarConfig("runtime", { app_url: url }, s.userId);
    await auditar({ acao: "runtime.registrar_url", actorId: s.userId, depois: { app_url: url } });
    return {};
  });
}
