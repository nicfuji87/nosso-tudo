import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PartyPopper, RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { ehUuid, fotoPrincipal } from "@/components/ml/criativos/carregar";
import { FilaLinks } from "@/components/ml/pendencias/fila-links";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fila de links de afiliado" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const COLUNAS = "id, title, permalink, thumbnail, pictures, current_price, original_price, discount_pct, score, score_confidence, status, external_id";

interface ProdutoFila {
  id: string;
  title: string;
  permalink: string | null;
  thumbnail: string | null;
  pictures: unknown;
  current_price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  score: number | null;
  score_confidence: number | null;
  status: string;
  external_id: string;
}

export default async function FilaLinksPage({ searchParams }: { searchParams: Params }) {
  const pular = (um(searchParams.pular) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(ehUuid)
    .slice(0, 300);
  const idParam = um(searchParams.id);

  const supabase = createClient();
  const role = await getMlRole();

  let produto: ProdutoFila | null = null;
  if (ehUuid(idParam)) {
    const { data } = await supabase.from("ml_products").select(COLUNAS).eq("id", idParam).maybeSingle();
    produto = (data as ProdutoFila | null) ?? null;
  }
  if (!produto) {
    let q = supabase
      .from("ml_products")
      .select(COLUNAS)
      .eq("status", "waiting_affiliate_link")
      .order("score", { ascending: false, nullsFirst: false })
      .order("approved_at", { ascending: true })
      .limit(1);
    if (pular.length) q = q.not("id", "in", `(${pular.join(",")})`);
    const { data } = await q;
    produto = ((data ?? []) as ProdutoFila[])[0] ?? null;
  }

  const { count } = await supabase.from("ml_products").select("id", { count: "exact", head: true }).eq("status", "waiting_affiliate_link");
  const restantes = count ?? 0;

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="-ml-3">
      <Link href="/ml/pendencias">
        <ArrowLeft /> Central de Pendências
      </Link>
    </Button>
  );

  if (!produto) {
    const soIgnorados = restantes > 0;
    return (
      <div className="space-y-6">
        {voltar}
        <EmptyState
          icon={PartyPopper}
          title={soIgnorados ? "Fim da fila desta sessão" : "Fila zerada!"}
          description={
            soIgnorados
              ? `Restam ${restantes} produto(s) que você ignorou por agora. Volte a eles quando tiver o link.`
              : "Todos os produtos aprovados já têm link de afiliado. Os criativos seguem automaticamente."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {soIgnorados && (
                <Button asChild variant="tech">
                  <Link href="/ml/pendencias/links">
                    <RotateCcw /> Rever os ignorados
                  </Link>
                </Button>
              )}
              <Button asChild variant={soIgnorados ? "secondary" : "tech"}>
                <Link href="/ml/pendencias">Voltar à Central</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {voltar}
      <FilaLinks
        key={produto.id}
        produto={{
          id: produto.id,
          title: produto.title,
          permalink: produto.permalink,
          imagem: fotoPrincipal(produto),
          preco: produto.current_price != null ? Number(produto.current_price) : null,
          precoOriginal: produto.original_price != null ? Number(produto.original_price) : null,
          desconto: produto.discount_pct != null ? Number(produto.discount_pct) : null,
          score: produto.score != null ? Number(produto.score) : null,
          confianca: produto.score_confidence != null ? Number(produto.score_confidence) : null,
          aguardandoLink: produto.status === "waiting_affiliate_link",
          codigo: produto.external_id,
        }}
        restantes={restantes}
        pular={pular}
        podeOperar={temPapel(role, "operator")}
      />
    </div>
  );
}
