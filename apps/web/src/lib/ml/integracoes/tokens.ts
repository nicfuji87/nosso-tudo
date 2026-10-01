import "server-only";
import { mlDb } from "../db";
import { lerSegredo, type Provider } from "../segredos";
import { ErroAguardar, ErroPermanente } from "../jobs/erros";
import { lerIntegracao } from "./estado";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Access token válido, renovando antes de expirar. O refresh é serializado
 * por trava no banco (`ml_integration_try_lock`): o refresh token do ML é de
 * uso único — dois workers renovando juntos derrubariam a conexão.
 */
export async function obterTokenValido(
  provider: Provider,
  renovar: () => Promise<void>,
  margemMs = 10 * 60_000,
): Promise<string> {
  for (let volta = 0; volta < 2; volta++) {
    const integ = await lerIntegracao(provider);
    const token = await lerSegredo(provider, "access_token");
    if (!token || integ.status === "disconnected") {
      throw new ErroPermanente(`${nomeProvider(provider)} não está conectado. Conecte em Integrações.`);
    }
    const expira = integ.access_expires_at ? new Date(integ.access_expires_at).getTime() : null;
    if (expira == null || expira - Date.now() > margemMs) return token;

    const { data: travou } = await mlDb().rpc("ml_integration_try_lock", { p_provider: provider, p_seconds: 60 });
    if (travou) {
      try {
        await renovar();
      } finally {
        await mlDb().rpc("ml_integration_unlock", { p_provider: provider });
      }
      continue; // relê o token novo
    }
    // Outro worker está renovando: espera um pouco e relê.
    for (let i = 0; i < 8; i++) {
      await espera(1000);
      const atual = await lerIntegracao(provider);
      if (!atual.lock_until || new Date(atual.lock_until).getTime() < Date.now()) break;
    }
  }
  const integ = await lerIntegracao(provider);
  const token = await lerSegredo(provider, "access_token");
  if (token && integ.access_expires_at && new Date(integ.access_expires_at).getTime() > Date.now()) return token;
  throw new ErroAguardar(`Renovação do token de ${nomeProvider(provider)} em andamento.`, 15_000);
}

export function nomeProvider(p: Provider): string {
  return { mercadolivre: "Mercado Livre", pinterest: "Pinterest", openai: "OpenAI", apify: "Apify" }[p];
}
