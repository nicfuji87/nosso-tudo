import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import { getItensPorTransacao, listCategorias, listTransacoes } from "@/lib/db/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { TransacoesView } from "@/components/transacoes/transacoes-view";

export const metadata: Metadata = { title: "Transações" };

export default async function TransacoesPage() {
  const { workspace } = await getWorkspaceContext();
  const [transacoes, categorias] = await Promise.all([
    listTransacoes(workspace.id, { limit: 200 }),
    listCategorias(workspace.id),
  ]);
  const itensPorTx = await getItensPorTransacao(
    workspace.id,
    transacoes.map((t) => t.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transações"
        description="Tudo o que entra e sai, em um só lugar."
      />
      <TransacoesView transacoes={transacoes} categorias={categorias} itensPorTx={itensPorTx} />
    </div>
  );
}
