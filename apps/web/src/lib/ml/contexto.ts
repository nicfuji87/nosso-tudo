import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de execução (job atual + quem disparou) propagado sem passar
 * parâmetro por toda a pilha. Usado para ligar chamadas de API e logs ao job.
 */
export interface ContextoExecucao {
  jobId?: string;
  actorId?: string | null;
  actorType: "user" | "system" | "automation";
  /** O job pediu cancelamento? (política "cancelar anterior") */
  cancelado?: () => Promise<boolean>;
}

export const contextoMl = new AsyncLocalStorage<ContextoExecucao>();

export function contextoAtual(): ContextoExecucao {
  return contextoMl.getStore() ?? { actorType: "system" };
}
