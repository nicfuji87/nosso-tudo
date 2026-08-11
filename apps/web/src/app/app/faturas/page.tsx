import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import { getFaturasEContasFixas } from "@/lib/db/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { FaturasView } from "@/components/faturas/faturas-view";

export const metadata: Metadata = { title: "Faturas" };

export default async function FaturasPage() {
  const { workspace } = await getWorkspaceContext();
  const dados = await getFaturasEContasFixas(workspace.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faturas e contas fixas"
        description="O que vence, quanto já está conciliado e o que ficou sem baixa."
      />
      <FaturasView dados={dados} />
    </div>
  );
}
