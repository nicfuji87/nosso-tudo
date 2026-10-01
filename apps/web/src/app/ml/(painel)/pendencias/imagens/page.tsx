import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { carregarCriativos, ehUuid } from "@/components/ml/criativos/carregar";
import { ImagemManual } from "@/components/ml/pendencias/imagem-manual";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";

export const metadata: Metadata = { title: "Imagens manuais" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

export default async function ImagensManuaisPage({ searchParams }: { searchParams: Params }) {
  const idParam = Array.isArray(searchParams.id) ? searchParams.id[0] : searchParams.id;
  const [lista, geral, role] = await Promise.all([
    carregarCriativos({ status: "waiting_manual_image", limite: 100, maisAntigosPrimeiro: true }),
    lerConfig("geral"),
    getMlRole(),
  ]);

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link href="/ml/pendencias">
        <ArrowLeft /> Central de Pendências
      </Link>
    </Button>
  );

  if (!lista.length) {
    return (
      <div className="space-y-6">
        {voltar}
        <EmptyState
          icon={PartyPopper}
          title="Nenhuma imagem manual pendente"
          description="Todos os criativos do modo ChatGPT/upload já têm imagem. Os novos aparecem aqui assim que os textos ficarem prontos."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="tech">
                <Link href="/ml/criativos?vista=revisao">Revisar criativos</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/ml/pendencias">Voltar à Central</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const atual = (ehUuid(idParam) && lista.find((c) => c.id === idParam)) || lista[0]!;

  return (
    <div className="space-y-6">
      {voltar}
      <ImagemManual key={atual.id} lista={lista} atual={atual} tz={geral.timezone} podeOperar={temPapel(role, "operator")} />
    </div>
  );
}
