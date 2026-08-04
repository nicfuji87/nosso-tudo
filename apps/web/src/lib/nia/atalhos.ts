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
