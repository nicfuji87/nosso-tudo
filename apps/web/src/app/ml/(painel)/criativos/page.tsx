import type { Metadata } from "next";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { carregarBoards, carregarCriativos, ehUuid } from "@/components/ml/criativos/carregar";
import { carregarFamilias, carregarOpcoesFamilia } from "@/components/ml/criativos/carregar-familias";
import { FiltrosCriativos, type Vista } from "@/components/ml/criativos/filtros";
import { PainelCriativos } from "@/components/ml/criativos/painel-criativos";
import { DIALOGOS_V2, MODOS_IMAGEM, type CriativoView, type DialogoV2, type FamiliaView, type PresetOpcao } from "@/components/ml/criativos/rotulos";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { CREATIVE_STATUSES } from "@/lib/ml/estados";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Criativos" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const LIMITE_FAMILIAS = 40;

export default async function CriativosPage({ searchParams }: { searchParams: Params }) {
  const vistaParam = um(searchParams.vista);
  const vista: Vista = vistaParam === "lista" || vistaParam === "revisao" || vistaParam === "kanban" ? vistaParam : "familias";
  const statusParam = um(searchParams.status);
  const status = statusParam && (CREATIVE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null;
  const modoParam = um(searchParams.modo);
  const modo = modoParam && (MODOS_IMAGEM as readonly string[]).includes(modoParam) ? modoParam : null;
  const produtoParam = um(searchParams.produto);
  const produto = ehUuid(produtoParam) ? produtoParam : null;
  const familiaParam = um(searchParams.familia);
  const familia = ehUuid(familiaParam) ? familiaParam : null;
  const arquivadas = um(searchParams.arquivadas) === "1";
  const q = um(searchParams.q)?.slice(0, 80) ?? null;
  const criativoParam = um(searchParams.criativo);
  const criativoInicial = ehUuid(criativoParam) ? criativoParam : null;
  const acaoParam = um(searchParams.acao);
  const acaoInicial = criativoInicial && (DIALOGOS_V2 as readonly string[]).includes(acaoParam ?? "") ? (acaoParam as DialogoV2) : null;

  const supabase = createClient();

  // Vista "Por família": famílias primeiro, depois as variantes delas.
  let familias: FamiliaView[] = [];
  let criativos: CriativoView[];
  if (vista === "familias") {
    familias = await carregarFamilias({ produto, familia, q, status, arquivadas, limite: LIMITE_FAMILIAS });
    criativos = familias.length
      ? await carregarCriativos({ familias: familias.map((f) => f.id), status: status ?? (arquivadas ? "archived" : null), modo, limite: 600 })
      : [];
  } else {
    criativos = await carregarCriativos({
      status: vista === "revisao" ? "review" : status,
      modo,
      produto,
      q,
      familias: familia ? [familia] : undefined,
      limite: 200,
    });
  }

  const [boards, geral, role, revisao, produtoFiltro, opcoesFamilia, presetsRes, openaiRes, semFamiliaRes] = await Promise.all([
    carregarBoards(),
    lerConfig("geral"),
    getMlRole(),
    supabase.from("ml_creatives").select("id", { count: "exact", head: true }).eq("status", "review"),
    produto ? supabase.from("ml_products").select("id, title").eq("id", produto).maybeSingle() : Promise.resolve({ data: null }),
    carregarOpcoesFamilia(familia),
    supabase.from("ml_scene_presets").select("id, name, environment").eq("active", true).order("sort", { ascending: true }).limit(100),
    supabase.from("ml_integrations").select("status").eq("provider", "openai").maybeSingle(),
    vista === "familias"
      ? supabase.from("ml_creatives").select("id", { count: "exact", head: true }).is("family_id", null).neq("status", "archived")
      : Promise.resolve({ count: 0 }),
  ]);

  // ?criativo= fora do filtro atual: carrega só ele para abrir o editor.
  const extras =
    criativoInicial && !criativos.some((c) => c.id === criativoInicial) ? await carregarCriativos({ ids: [criativoInicial], limite: 1 }) : [];

  const produtos = new Map<string, string>();
  const pf = produtoFiltro.data as { id: string; title: string } | null;
  if (pf) produtos.set(pf.id, pf.title);
  for (const c of criativos) if (c.produto) produtos.set(c.produto.id, c.produto.title);
  for (const f of familias) if (f.produto) produtos.set(f.produto.id, f.produto.title);
  const opcoesProduto = [...produtos].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

  const presets = (presetsRes.data ?? []) as PresetOpcao[];
  const openai = (openaiRes.data as { status: string } | null)?.status === "connected";
  const filtrado = Boolean(status || modo || produto || q || familia || arquivadas);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Criativos"
        description={
          vista === "revisao"
            ? "Revisão rápida: compare lado a lado e aprove em lote (5–15 s por criativo)."
            : vista === "familias"
              ? "Cada produto vira uma família de variantes: revise fidelidade, aprove e agende sem repetir."
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
      <FiltrosCriativos vista={vista} produtos={opcoesProduto} familias={opcoesFamilia} totalRevisao={revisao.count ?? 0} />
      {vista === "familias" && familias.length >= LIMITE_FAMILIAS && (
        <p className="text-caption text-muted-foreground">Mostrando as {LIMITE_FAMILIAS} famílias mais recentes — use os filtros para refinar.</p>
      )}
      {vista !== "familias" && criativos.length >= 200 && (
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
        acaoInicial={acaoInicial}
        filtrado={filtrado}
        familias={familias}
        presets={presets}
        openai={openai}
        semFamilia={semFamiliaRes.count ?? 0}
      />
    </div>
  );
}
