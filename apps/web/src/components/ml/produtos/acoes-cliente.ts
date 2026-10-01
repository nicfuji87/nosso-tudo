import { aprovarProdutos } from "@/app/ml/(painel)/produtos/actions";
import type { RespostaAcao } from "@/components/ml/acao-botao";

/**
 * Aprovação de UM produto para o `AcaoBotao`: a action de lote devolve ok
 * mesmo quando o item falha (vem em `falhas`) — aqui isso vira erro legível.
 */
export async function aprovarUm(id: string): Promise<RespostaAcao> {
  const r = await aprovarProdutos([id]);
  if ("error" in r) return { error: r.error };
  const falha = r.falhas[0];
  if (falha) return { error: falha.erro };
  return { ok: true, mensagem: "Produto aprovado." };
}
