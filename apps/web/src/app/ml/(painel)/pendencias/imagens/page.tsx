import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { carregarCriativos, ehUuid } from "@/components/ml/criativos/carregar";
import { ordenarReferencias } from "@/components/ml/criativos/rotulos";
import { ImagemManual, type ReferenciaManual } from "@/components/ml/pendencias/imagem-manual";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Imagens manuais" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

interface MidiaLinha {
  id: string;
  public_url: string;
  media_role: string;
  reference_priority: number | null;
  width: number | null;
  height: number | null;
}

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

  // V2: todas as referências selecionadas (ordem de source_media_ids; principal primeiro).
  let referencias: ReferenciaManual[] = [];
  if (atual.family_id) {
    const { data } = await createClient()
      .from("ml_product_media")
      .select("id, public_url, media_role, reference_priority, width, height")
      .eq("product_id", atual.product_id)
      .eq("status", "ready")
      .not("public_url", "is", null)
      .order("sort_order", { ascending: true })
      .limit(60);
    referencias = ordenarReferencias(atual.source_media_ids, (data ?? []) as MidiaLinha[]).map((m, i) => ({
      id: m.id,
      url: m.public_url,
      principal: i === 0,
      papel: m.media_role,
      width: m.width,
      height: m.height,
    }));
  }

  return (
    <div className="space-y-6">
      {voltar}
      <ImagemManual
        key={atual.id}
        lista={lista}
        atual={atual}
        referencias={referencias}
        tz={geral.timezone}
        podeOperar={temPapel(role, "operator")}
      />
    </div>
  );
}
