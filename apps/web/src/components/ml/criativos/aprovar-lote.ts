import { aprovarCriativos } from "@/app/ml/(painel)/criativos/actions";

export interface FalhaAprovacao {
  id: string;
  mensagem: string;
}

export interface ResultadoAprovacao {
  feitos: string[];
  falhas: FalhaAprovacao[];
}

/**
 * Aprova criativos um a um (pool pequeno) para saber QUAL falhou e por quê —
 * nas variantes V2 a aprovação falha por item quando a fidelidade não foi
 * liberada ou o pacote Pinterest não está pronto (a action só devolve as mensagens).
 */
export async function aprovarComFalhas(ids: string[], concorrencia = 3): Promise<ResultadoAprovacao> {
  const feitos: string[] = [];
  const falhas: FalhaAprovacao[] = [];
  const fila = [...new Set(ids)];
  async function trabalhador() {
    for (;;) {
      const id = fila.shift();
      if (!id) return;
      try {
        const r = await aprovarCriativos([id]);
        if (!r.ok) falhas.push({ id, mensagem: r.error });
        else if (r.feitos > 0) feitos.push(id);
        else falhas.push({ id, mensagem: r.falhas[0] ?? "Não foi possível aprovar." });
      } catch (e) {
        falhas.push({ id, mensagem: e instanceof Error ? e.message : "Erro inesperado." });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, fila.length) }, trabalhador));
  return { feitos, falhas };
}
