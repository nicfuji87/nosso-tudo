import { listCartoes, listContas, listEntidades } from "@/lib/db/queries";
import type { MeioPagamento } from "@/lib/types/db";
import type { AtalhoPagamento, AtalhosNia } from "@/lib/nia/atalhos";

/** Teto por fileira — mais que isso o chat vira um painel de botões. */
const MAX_CHIPS = 8;

/**
 * Monta os atalhos a partir dos cadastros do workspace. Os cartões viram chips
 * nominais (crédito); Pix/débito/dinheiro entram como meios avulsos, amarrados
 * à conta da família quando existe só uma — com duas ou mais, deixa a conta em
 * aberto para não escolher errado no lugar do usuário.
 */
export async function getAtalhos(workspaceId: string): Promise<AtalhosNia> {
  const [entidades, cartoes, contas] = await Promise.all([
    listEntidades(workspaceId),
    listCartoes(workspaceId),
    listContas(workspaceId),
  ]);

  const contaUnica = contas.length === 1 ? contas[0]!.apelido : undefined;

  const pagamentos: AtalhoPagamento[] = [
    ...cartoes.map((c) => ({
      label: c.apelido,
      frase: `no ${c.apelido}`,
      meio: "cartao_credito" as MeioPagamento,
      cartao: c.apelido,
    })),
    { label: "Pix", frase: "no Pix", meio: "pix", conta: contaUnica },
    { label: "Débito", frase: "no débito", meio: "cartao_debito", conta: contaUnica },
    { label: "Dinheiro", frase: "em dinheiro", meio: "dinheiro" },
  ];

  return {
    beneficiarios: entidades.map((e) => e.nome).slice(0, MAX_CHIPS),
    pagamentos: pagamentos.slice(0, MAX_CHIPS),
  };
}
