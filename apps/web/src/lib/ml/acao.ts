import "server-only";
import { requireMlAction, type MlRole, type MlSessao } from "./acesso";
import { contextoMl } from "./contexto";
import { redigirTexto } from "./redacao";

/**
 * Envelope padrão das Server Actions do ML: autoriza pelo papel mínimo, roda
 * no contexto do usuário (auditoria) e converte exceção em erro legível —
 * nunca vaza stack/segredo para o browser.
 */
export type ResultadoAcao<T = Record<string, never>> = ({ ok: true } & T) | { ok?: false; error: string };

export async function executarAcao<T extends object>(
  papel: MlRole,
  fn: (s: MlSessao) => Promise<T | void>,
): Promise<ResultadoAcao<T>> {
  const sessao = await requireMlAction(papel);
  if ("error" in sessao) return { error: sessao.error };
  try {
    const r = await contextoMl.run({ actorId: sessao.userId, actorType: "user" }, () => fn(sessao));
    return { ok: true, ...((r ?? {}) as T) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado.";
    console.error("[ml/acao]", msg);
    return { error: redigirTexto(msg).slice(0, 500) };
  }
}
