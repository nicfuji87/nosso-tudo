import { NextResponse, type NextRequest } from "next/server";
import { requireMlAction } from "@/lib/ml/acesso";
import { criarStateOAuth, gerarPkce, redirectUri } from "@/lib/ml/integracoes/estado";
import * as ml from "@/lib/ml/integracoes/mercadolivre";
import * as pinterest from "@/lib/ml/integracoes/pinterest";
import { auditar } from "@/lib/ml/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Início do OAuth ("Conectar"). Só admin do ML. State de uso único + PKCE (ML). */
export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const voltar = (q: string) => NextResponse.redirect(new URL(`/ml/integracoes?${q}`, req.url));
  const sessao = await requireMlAction("admin");
  if ("error" in sessao) return voltar(`erro=${encodeURIComponent(sessao.error)}`);

  const provider = params.provider;
  if (provider !== "mercadolivre" && provider !== "pinterest") return voltar("erro=Integração%20inválida");
  const origem = req.nextUrl.origin;

  try {
    if (provider === "mercadolivre") {
      const { verifier, challenge } = gerarPkce();
      const state = await criarStateOAuth({ provider, userId: sessao.userId, codeVerifier: verifier });
      const url = await ml.urlAutorizacao({ state, challenge, redirectUri: redirectUri(provider, origem) });
      await auditar({ acao: "integracao.oauth_inicio", entidade: "integration", entidadeId: provider, actorId: sessao.userId });
      return NextResponse.redirect(url);
    }
    const state = await criarStateOAuth({ provider, userId: sessao.userId });
    const url = await pinterest.urlAutorizacao({ state, redirectUri: redirectUri(provider, origem) });
    await auditar({ acao: "integracao.oauth_inicio", entidade: "integration", entidadeId: provider, actorId: sessao.userId });
    return NextResponse.redirect(url);
  } catch (e) {
    return voltar(`erro=${encodeURIComponent(e instanceof Error ? e.message : "Falha ao iniciar a conexão")}&provider=${provider}`);
  }
}
