import { NextResponse, type NextRequest } from "next/server";
import { requireMlAction } from "@/lib/ml/acesso";
import { consumirStateOAuth, redirectUri, atualizarIntegracao } from "@/lib/ml/integracoes/estado";
import * as ml from "@/lib/ml/integracoes/mercadolivre";
import * as pinterest from "@/lib/ml/integracoes/pinterest";
import { auditar } from "@/lib/ml/auditoria";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { redigirTexto } from "@/lib/ml/redacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retorno do OAuth. Valida o state (uso único, mesmo usuário que iniciou) e
 * troca o code por tokens no servidor. Tokens vão direto para o Vault.
 */
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const voltar = (q: string) => NextResponse.redirect(new URL(`/ml/integracoes?${q}&provider=${provider}`, req.url));
  if (provider !== "mercadolivre" && provider !== "pinterest") return voltar("erro=Integração%20inválida");

  const sp = req.nextUrl.searchParams;
  const erroProvedor = sp.get("error_description") ?? sp.get("error");
  if (erroProvedor) return voltar(`erro=${encodeURIComponent(`Autorização negada: ${erroProvedor}`)}`);
  const code = sp.get("code");
  const stateParam = sp.get("state");
  if (!code || !stateParam) return voltar("erro=Resposta%20incompleta%20do%20provedor");

  const sessao = await requireMlAction("admin");
  if ("error" in sessao) return voltar(`erro=${encodeURIComponent(sessao.error)}`);

  const state = await consumirStateOAuth(stateParam, provider);
  if (!state) return voltar("erro=Sessão%20de%20conexão%20expirada.%20Tente%20de%20novo.");
  if (state.profile_id && state.profile_id !== sessao.userId) return voltar("erro=Conexão%20iniciada%20por%20outro%20usuário");

  try {
    const uri = redirectUri(provider, req.nextUrl.origin);
    if (provider === "mercadolivre") await ml.trocarCodigo(code, state.code_verifier, uri);
    else {
      await pinterest.trocarCodigo(code, uri);
      // primeira sincronização de boards já em segundo plano
      await enfileirar({ tipo: "SYNC_BOARDS", idempotencyKey: "sync_boards", criadoPor: sessao.userId });
      await chutarWorker();
    }
    await auditar({ acao: "integracao.conectar", entidade: "integration", entidadeId: provider, actorId: sessao.userId });
    return voltar("ok=conectado");
  } catch (e) {
    const msg = redigirTexto(e instanceof Error ? e.message : "Falha ao conectar");
    await atualizarIntegracao(provider, { status: "error", last_error: msg });
    return voltar(`erro=${encodeURIComponent(msg)}`);
  }
}
