import type { MeioPagamento } from "@/lib/types/db";

/**
 * Atalho de pagamento oferecido como "balão" no chat: um chip por cartão da
 * família + os meios avulsos (Pix, débito, dinheiro).
 *
 * Este módulo é compartilhado com o client — a montagem (que lê o banco) fica
 * em `atalhos-server.ts`.
 */
export interface AtalhoPagamento {
  /** Rótulo curto do chip: "Nubank", "Pix", "Dinheiro". */
  label: string;
  /** Como isso entra no texto da mensagem: "no Nubank", "no Pix". */
  frase: string;
  meio: MeioPagamento;
  /** Apelido do cartão, quando o chip aponta para um cartão específico. */
  cartao?: string;
  /** Apelido da conta, quando o chip aponta para uma conta específica. */
  conta?: string;
}

export interface AtalhosNia {
  /** Nomes de pessoas/grupos da família ("Casa", "Henrique", …). */
  beneficiarios: string[];
  pagamentos: AtalhoPagamento[];
}

export const ATALHOS_VAZIOS: AtalhosNia = { beneficiarios: [], pagamentos: [] };

/**
 * Índice do chip que corresponde ao pagamento já proposto pela Nia — para o
 * card abrir com a opção certa marcada. Casa por meio + apelido; se o apelido
 * não bate em nada, cai no primeiro chip do mesmo meio.
 */
export function acharPagamento(
  lista: AtalhoPagamento[],
  meio: MeioPagamento | null,
  apelido: string | null,
): number | null {
  if (!meio) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  if (apelido) {
    const exato = lista.findIndex((p) => p.meio === meio && norm(p.label) === norm(apelido));
    if (exato >= 0) return exato;
  }
  const primeiro = lista.findIndex((p) => p.meio === meio);
  return primeiro >= 0 ? primeiro : null;
}
