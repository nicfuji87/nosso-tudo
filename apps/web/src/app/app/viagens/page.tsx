import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import { getCarteira } from "@/lib/viagens/carteira";
import { CarteiraMilhas } from "@/components/viagens/carteira-milhas";

export const metadata: Metadata = { title: "Viagens · Nosso Tudo" };

export default async function ViagensPage() {
  const { workspace } = await getWorkspaceContext();
  const carteira = await getCarteira(workspace.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="max-w-2xl text-body-sm text-muted-foreground">
          Sua carteira de milhas com o custo real de cada uma — o que você de fato pagou, não uma
          estimativa de mercado. É esse número que decide se vale emitir com milha ou pagar em
          dinheiro.
        </p>
      </div>

      <CarteiraMilhas carteira={carteira} />
    </div>
  );
}
