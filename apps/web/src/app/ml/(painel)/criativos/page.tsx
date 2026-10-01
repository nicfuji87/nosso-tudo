import type { Metadata } from "next";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { carregarBoards, carregarCriativos, ehUuid } from "@/components/ml/criativos/carregar";
import { FiltrosCriativos, type Vista } from "@/components/ml/criativos/filtros";
import { PainelCriativos } from "@/components/ml/criativos/painel-criativos";
import { MODOS_IMAGEM } from "@/components/ml/criativos/rotulos";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { CREATIVE_STATUSES } from "@/lib/ml/estados";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Criativos" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function CriativosPage({ searchParams }: { searchParams: Params }) {
  const vistaParam = um(searchParams.vista);
  const vista: Vista = vistaParam === "lista" || vistaParam === "revisao" ? vistaParam : "kanban";
  const statusParam = um(searchParams.status);
  const status = statusParam && (CREATIVE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null;
  const modoParam = um(searchParams.modo);
  const modo = modoParam && (MODOS_IMAGEM as readonly string[]).includes(modoParam) ? modoParam : null;
  const produtoParam = um(searchParams.produto);
  const produto = ehUuid(produtoParam) ? produtoParam : null;
  const q = um(searchParams.q)?.slice(0, 80) ?? null;
  const criativoParam = um(searchParams.criativo);
  const criativoInicial = ehUuid(criativoParam) ? criativoParam : null;

  const supabase = createClient();
  const [criativos, boards, geral, role, revisao, produtoFiltro] = await Promise.all([
    carregarCriativos({ status: vista === "revisao" ? "review" : status, modo, produto, q, limite: 200 }),
    carregarBoards(),
    lerConfig("geral"),
    getMlRole(),
    supabase.from("ml_creatives").select("id", { count: "exact", head: true }).eq("status", "review"),
    produto ? supabase.from("ml_products").select("id, title").eq("id", produto).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // ?criativo= fora do filtro atual: carrega só ele para abrir o editor.
  const extras =
    criativoInicial && !criativos.some((c) => c.id === criativoInicial) ? await carregarCriativos({ ids: [criativoInicial], limite: 1 }) : [];

  const produtos = new Map<string, string>();
  const pf = produtoFiltro.data as { id: string; title: string } | null;
  if (pf) produtos.set(pf.id, pf.title);
  for (const c of criativos) if (c.produto) produtos.set(c.produto.id, c.produto.title);
  const opcoesProduto = [...produtos].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  const filtrado = Boolean(status || modo || produto || q);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Criativos"
        description={
          vista === "revisao"
            ? "Revisão rápida: compare lado a lado e aprove em lote (5–15 s por criativo)."
            : "Da geração à publicação: edite, aprove, rejeite e transforme em Pin."
        }
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/ml/pendencias/imagens">
              <ImagePlus /> Imagens manuais
            </Link>
          </Button>
        }
      />
      <FiltrosCriativos vista={vista} produtos={opcoesProduto} totalRevisao={revisao.count ?? 0} />
      {criativos.length >= 200 && (
        <p className="text-caption text-muted-foreground">Mostrando os 200 mais recentes — use os filtros para refinar.</p>
      )}
      <PainelCriativos
        criativos={criativos}
        extras={extras}
        boards={boards}
        tz={geral.timezone}
        vista={vista}
        podeOperar={temPapel(role, "operator")}
        criativoInicial={criativoInicial}
        filtrado={filtrado}
      />
    </div>
  );
}
