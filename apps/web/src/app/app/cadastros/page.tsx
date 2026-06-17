import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import {
  listCartoes,
  listCategorias,
  listContas,
  listEntidades,
  listRecorrencias,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { CadastrosView } from "@/components/cadastros/cadastros-view";

export const metadata: Metadata = { title: "Cadastros" };

export default async function CadastrosPage() {
  const { workspace } = await getWorkspaceContext();
  const [categorias, entidades, contas, cartoes, recorrencias] = await Promise.all([
    listCategorias(workspace.id),
    listEntidades(workspace.id),
    listContas(workspace.id),
    listCartoes(workspace.id),
    listRecorrencias(workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastros"
        description="Categorias, contas fixas, pessoas, contas e cartões da sua casa."
      />
      <CadastrosView
        categorias={categorias}
        entidades={entidades}
        contas={contas}
        cartoes={cartoes}
        recorrencias={recorrencias}
      />
    </div>
  );
}
