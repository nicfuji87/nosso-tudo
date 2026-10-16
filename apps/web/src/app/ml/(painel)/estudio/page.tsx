import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { PageHeader } from "@/components/patterns/page-header";
import { Estudio } from "@/components/ml/estudio/estudio";

export const metadata: Metadata = { title: "Criar Pin" };
// A geração dos textos (IA com visão) roda dentro da Server Action.
export const maxDuration = 60;

export default async function EstudioPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const sessao = await requireMlPage("viewer");
  const supabase = createClient();
  const [{ data: prompts }, { data: boards }, { data: integ }] = await Promise.all([
    supabase.from("ml_estudio_prompts").select("id, nome, texto, usos").order("usos", { ascending: false }).order("nome"),
    supabase.from("ml_pinterest_boards").select("id, name, is_default").eq("active", true).is("removed_at", null).order("name"),
    supabase.from("ml_integrations").select("provider, status").in("provider", ["openai", "apify", "pinterest", "mercadolivre"]),
  ]);
  const conectado = (p: string) => ((integ ?? []) as { provider: string; status: string }[]).some((i) => i.provider === p && ["connected", "expiring"].includes(i.status));
  const q = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;

  return (
    <div className="space-y-6">
      <PageHeader title="Criar Pin" description="Busque um produto que vende bem, gere 3 imagens, escolha uma e publique no Pinterest." />
      <Estudio
        prompts={(prompts ?? []) as { id: string; nome: string; texto: string; usos: number }[]}
        boards={((boards ?? []) as { id: string; name: string; is_default: boolean }[]).map((b) => ({ id: b.id, nome: b.name, padrao: b.is_default }))}
        integracoes={{ openai: conectado("openai"), apify: conectado("apify"), pinterest: conectado("pinterest"), mercadolivre: conectado("mercadolivre") }}
        podeEditar={temPapel(sessao.role, "operator")}
        buscaInicial={q?.slice(0, 200) ?? null}
      />
    </div>
  );
}
