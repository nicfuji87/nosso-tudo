"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import * as ml from "@/lib/ml/integracoes/mercadolivre";
import * as pinterest from "@/lib/ml/integracoes/pinterest";
import * as openai from "@/lib/ml/integracoes/openai";
import * as apify from "@/lib/ml/integracoes/apify";
import { salvarConfig } from "@/lib/ml/config";

const revalidar = () => revalidatePath("/ml", "layout");
const provedores = z.enum(["mercadolivre", "pinterest", "openai", "apify"]);

export async function salvarAppMercadoLivre(clientId: string, clientSecret?: string) {
  return executarAcao("admin", async (s) => {
    const cid = z.string().regex(/^\d{4,25}$/, "O App ID do Mercado Livre é numérico.").parse(clientId.trim());
    const sec = z.string().min(8).max(200).optional().parse(clientSecret?.trim() || undefined);
    await ml.salvarCredenciaisApp(cid, sec);
    await auditar({ acao: "integracao.credenciais", entidade: "integration", entidadeId: "mercadolivre", actorId: s.userId, depois: { client_id: cid, secret_alterado: Boolean(sec) } });
    revalidar();
    return { mensagem: "Credenciais do app salvas. Agora clique em Conectar." };
  });
}

export async function salvarAppPinterest(clientId: string, clientSecret: string | undefined, ambiente: string) {
  return executarAcao("admin", async (s) => {
    const cid = z.string().regex(/^\d{4,25}$/, "O App ID do Pinterest é numérico.").parse(clientId.trim());
    const sec = z.string().min(8).max(200).optional().parse(clientSecret?.trim() || undefined);
    const amb = z.enum(["production", "sandbox"]).parse(ambiente);
    await pinterest.salvarCredenciaisApp({ clientId: cid, clientSecret: sec, ambiente: amb });
    await auditar({ acao: "integracao.credenciais", entidade: "integration", entidadeId: "pinterest", actorId: s.userId, depois: { client_id: cid, ambiente: amb, secret_alterado: Boolean(sec) } });
    revalidar();
    return { mensagem: "Credenciais salvas. Agora clique em Conectar." };
  });
}

/** Token gerado no portal (ex.: sandbox) — alternativa ao OAuth para testes. */
export async function salvarTokenPinterest(token: string, ambiente: string) {
  return executarAcao("admin", async (s) => {
    const t = z.string().min(20).max(400).parse(token.trim());
    const amb = z.enum(["production", "sandbox"]).parse(ambiente);
    await pinterest.salvarTokenManual(t, amb);
    await enfileirar({ tipo: "SYNC_BOARDS", idempotencyKey: "sync_boards", criadoPor: s.userId });
    await auditar({ acao: "integracao.token_manual", entidade: "integration", entidadeId: "pinterest", actorId: s.userId, depois: { ambiente: amb } });
    await chutarWorker();
    revalidar();
    return { mensagem: "Token salvo e testado." };
  });
}

export async function testarIntegracao(provider: string) {
  return executarAcao("operator", async (s) => {
    const p = provedores.parse(provider);
    const r =
      p === "mercadolivre" ? await ml.testarConexao() : p === "pinterest" ? await pinterest.testarConexao() : p === "openai" ? await openai.testarConexao() : await apify.testarConexao();
    await auditar({ acao: "integracao.testar", entidade: "integration", entidadeId: p, actorId: s.userId, metadata: { ok: r.ok } });
    revalidar();
    if (!r.ok) throw new Error(r.erro);
    return { mensagem: `Conexão OK — ${r.conta}` };
  });
}

export async function desconectarIntegracao(provider: string) {
  return executarAcao("admin", async (s) => {
    const p = provedores.parse(provider);
    if (p === "mercadolivre") await ml.desconectar();
    else if (p === "pinterest") await pinterest.desconectar();
    else if (p === "openai") await openai.salvarChave(null);
    else await apify.salvarConfig({ token: null });
    await auditar({ acao: "integracao.desconectar", entidade: "integration", entidadeId: p, actorId: s.userId });
    revalidar();
    return { mensagem: "Desconectado." };
  });
}

export async function salvarOpenAI(apiKey: string | null, modelos?: { texto?: string; imagem?: string }) {
  return executarAcao("admin", async (s) => {
    if (apiKey) {
      const r = await openai.salvarChave(z.string().min(20).max(300).parse(apiKey.trim()));
      if (!r.ok) throw new Error(`Chave recusada pela OpenAI: ${r.erro}`);
    }
    if (modelos?.texto || modelos?.imagem) {
      await salvarConfig(
        "ia",
        {
          ...(modelos.texto ? { modelo_texto: z.string().min(2).max(80).parse(modelos.texto) } : {}),
          ...(modelos.imagem ? { modelo_imagem: z.string().min(2).max(80).parse(modelos.imagem) } : {}),
        },
        s.userId,
      );
    }
    await auditar({ acao: "integracao.openai", entidade: "integration", entidadeId: "openai", actorId: s.userId, depois: { chave_alterada: Boolean(apiKey), ...modelos } });
    revalidar();
    return { mensagem: apiKey ? "Chave validada e salva." : "Modelos salvos." };
  });
}

export async function salvarApify(dados: { token?: string; actorId?: string; inputTemplate?: string }) {
  return executarAcao("admin", async (s) => {
    const d = z
      .object({
        token: z.string().min(10).max(300).optional(),
        actorId: z.string().regex(/^[\w.-]+[~/][\w.-]+$|^\w{10,30}$/, "Use usuario~nome-do-actor ou o ID.").optional(),
        inputTemplate: z.string().max(4000).optional(),
      })
      .parse({ token: dados.token?.trim() || undefined, actorId: dados.actorId?.trim() || undefined, inputTemplate: dados.inputTemplate?.trim() || undefined });
    const r = await apify.salvarConfig({ token: d.token, actorId: d.actorId?.replace("/", "~"), inputTemplate: d.inputTemplate });
    if (!r.ok) throw new Error(r.erro);
    await auditar({ acao: "integracao.apify", entidade: "integration", entidadeId: "apify", actorId: s.userId, depois: { actor: d.actorId, token_alterado: Boolean(d.token) } });
    revalidar();
    return { mensagem: "Apify salvo." };
  });
}

export async function sincronizarBoardsAgora() {
  return executarAcao("operator", async (s) => {
    const { job } = await enfileirar({ tipo: "SYNC_BOARDS", idempotencyKey: "sync_boards", criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Sincronizando boards…" };
  });
}

export async function criarBoard(nome: string, descricao?: string) {
  return executarAcao("admin", async (s) => {
    const b = await pinterest.criarBoard({ name: z.string().min(2).max(180).parse(nome), description: descricao?.slice(0, 500), privacy: "PUBLIC" });
    await auditar({ acao: "pinterest.criar_board", entidade: "board", entidadeId: b.id, actorId: s.userId, depois: { nome } });
    await enfileirar({ tipo: "SYNC_BOARDS", idempotencyKey: "sync_boards", criadoPor: s.userId });
    await chutarWorker();
    revalidar();
    return { mensagem: `Board "${b.name}" criado.` };
  });
}

/** "Executar diagnóstico" — vira job (pode levar alguns segundos). */
export async function executarDiagnostico() {
  return executarAcao("operator", async (s) => {
    const { job } = await enfileirar({ tipo: "DIAGNOSTICS", idempotencyKey: "diagnostics", criadoPor: s.userId, prioridade: 1 });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Diagnóstico iniciado." };
  });
}

export async function resultadoDiagnostico(jobId: string) {
  return executarAcao("operator", async () => {
    const { mlDb } = await import("@/lib/ml/db");
    const { data } = await mlDb().from("ml_jobs").select("status, result, progress, last_error").eq("id", z.string().uuid().parse(jobId)).maybeSingle();
    const j = data as { status: string; result: { itens?: unknown[] } | null; progress: { itens?: unknown[] } | null; last_error: string | null } | null;
    return { status: j?.status ?? "desconhecido", itens: (j?.result?.itens ?? j?.progress?.itens ?? []) as unknown[], erro: j?.last_error ?? null };
  });
}
