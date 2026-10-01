import type { Metadata } from "next";
import { PageHeader } from "@/components/patterns/page-header";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { lerTodasConfigs, NIVEIS_AUTOMACAO, versaoConfig } from "@/lib/ml/config";
import { TIMEZONES_SUGERIDOS } from "@/lib/ml/cron";
import { createClient } from "@/lib/supabase/server";
import { AbasConfiguracoes } from "@/components/ml/configuracoes/abas";
import { FormGeral } from "@/components/ml/configuracoes/geral";
import { FormAutomacao } from "@/components/ml/configuracoes/automacao";
import { GerenciarCategorias, type CategoriaLite } from "@/components/ml/configuracoes/categorias";
import { FormDescoberta } from "@/components/ml/configuracoes/descoberta";
import { ConfigScoring, type VersaoScoring } from "@/components/ml/configuracoes/scoring";
import { FormPublicacao } from "@/components/ml/configuracoes/publicacao";
import { BoardsPorCategoria, type BoardLite, type OpcaoCategoria } from "@/components/ml/configuracoes/boards";
import { FormIA } from "@/components/ml/configuracoes/ia";
import { FormCriativos } from "@/components/ml/configuracoes/criativos";
import { ConfigSeguranca, type MembroLite } from "@/components/ml/configuracoes/seguranca";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const SECOES = ["geral", "automacao", "categorias", "scoring", "publicacao", "ia", "criativos", "seguranca"] as const;
type Secao = (typeof SECOES)[number];

type Supa = ReturnType<typeof createClient>;

/** Categorias carregadas (raízes + subcategorias já expandidas). PostgREST corta em 1000 por página. */
async function carregarCategorias(supabase: Supa): Promise<CategoriaLite[]> {
  const out: CategoriaLite[] = [];
  const PAGINA = 1000;
  for (let p = 0; p < 5; p++) {
    const { data, error } = await supabase
      .from("ml_categories")
      .select("id, name, parent_id, has_children, tracked, prohibited, commission_pct, max_products, priority, path")
      .order("id")
      .range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error || !data) break;
    for (const r of data as Record<string, unknown>[]) {
      const caminho = Array.isArray(r.path)
        ? (r.path as unknown[]).flatMap((x) =>
            x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string"
              ? [{ id: (x as { id: string }).id, name: String((x as { name?: unknown }).name ?? "") }]
              : [],
          )
        : [];
      out.push({
        id: String(r.id),
        name: String(r.name),
        parent_id: (r.parent_id as string | null) ?? null,
        has_children: (r.has_children as boolean | null) ?? null,
        tracked: Boolean(r.tracked),
        prohibited: Boolean(r.prohibited),
        commission_pct: r.commission_pct == null ? null : Number(r.commission_pct),
        max_products: r.max_products == null ? null : Number(r.max_products),
        priority: Number(r.priority ?? 0),
        path: caminho,
      });
    }
    if (data.length < PAGINA) break;
  }
  return out;
}

async function carregarMembros(supabase: Supa): Promise<MembroLite[]> {
  type Linha = { profile_id: string; role: string; created_at: string; profile?: { nome: string | null; email: string | null } | null };
  const comPerfil = await supabase
    .from("ml_members")
    .select("profile_id, role, created_at, profile:profiles!ml_members_profile_id_fkey(nome, email)")
    .order("created_at");
  let linhas: Linha[];
  if (comPerfil.error) {
    // Embed indisponível (FK/RLS) — lista sem nomes.
    const simples = await supabase.from("ml_members").select("profile_id, role, created_at").order("created_at");
    linhas = (simples.data ?? []) as Linha[];
  } else {
    linhas = (comPerfil.data ?? []) as unknown as Linha[];
  }
  const ordem = ["owner", "admin", "operator", "viewer"];
  return linhas
    .map((l) => ({ profile_id: l.profile_id, role: l.role, created_at: l.created_at, nome: l.profile?.nome ?? null, email: l.profile?.email ?? null }))
    .sort((a, b) => ordem.indexOf(a.role) - ordem.indexOf(b.role));
}

export default async function ConfiguracoesPage({ searchParams }: { searchParams: { secao?: string } }) {
  const sessao = await requireMlPage("viewer");
  const supabase = createClient();
  const secao: Secao = (SECOES as readonly string[]).includes(searchParams.secao ?? "") ? (searchParams.secao as Secao) : "geral";

  const admin = temPapel(sessao.role, "admin");
  const operador = temPapel(sessao.role, "operator");
  const dono = temPapel(sessao.role, "owner");

  const [cfg, versaoIa, mlRes, categorias, boardsRes, versoesRes, membros] = await Promise.all([
    lerTodasConfigs(),
    versaoConfig("ia"),
    supabase.from("ml_integrations").select("status").eq("provider", "mercadolivre").maybeSingle(),
    carregarCategorias(supabase),
    supabase
      .from("ml_pinterest_boards")
      .select("id, name, pin_count, privacy, category_ids, is_default, active")
      .is("removed_at", null)
      .order("is_default", { ascending: false })
      .order("name")
      .limit(500),
    supabase.from("ml_scoring_versions").select("version, weights, note, created_at").order("version", { ascending: false }).limit(50),
    admin ? carregarMembros(supabase) : Promise.resolve([] as MembroLite[]),
  ]);

  const tz = cfg.geral.timezone;
  const mlStatus = (mlRes.data as { status: string } | null)?.status ?? "disconnected";
  const mlConectado = mlStatus === "connected" || mlStatus === "expiring";
  const boards = ((boardsRes.data ?? []) as BoardLite[]).map((b) => ({ ...b, category_ids: b.category_ids ?? [] }));
  const versoes = (versoesRes.data ?? []) as VersaoScoring[];

  // Opções de categoria para os boards: acompanhadas + as que já estão mapeadas.
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const idsOpcoes = new Set<string>([...categorias.filter((c) => c.tracked).map((c) => c.id), ...boards.flatMap((b) => b.category_ids)]);
  const opcoesCategoria: OpcaoCategoria[] = [...idsOpcoes]
    .map((id) => {
      const c = porId.get(id);
      return { id, nome: c?.name ?? id, acompanhada: Boolean(c?.tracked) };
    })
    .sort((a, b) => Number(b.acompanhada) - Number(a.acompanhada) || a.nome.localeCompare(b.nome, "pt-BR"));

  const fusos = [...TIMEZONES_SUGERIDOS] as string[];
  const niveis = NIVEIS_AUTOMACAO.map((n) => ({ nivel: n.nivel, nome: n.nome, desc: n.desc }));
  const k = (v: unknown) => JSON.stringify(v);

  const abas = [
    { valor: "geral", label: "Geral", conteudo: <FormGeral key={k(cfg.geral)} config={cfg.geral} fusos={fusos} podeEditar={admin} /> },
    {
      valor: "automacao",
      label: "Automação",
      conteudo: <FormAutomacao key={k(cfg.automacao)} config={cfg.automacao} nivelAtual={cfg.geral.nivel_automacao} niveis={niveis} podeEditar={admin} />,
    },
    {
      valor: "categorias",
      label: "Categorias",
      conteudo: (
        <div className="space-y-6">
          <GerenciarCategorias categorias={categorias} mlConectado={mlConectado} podeEditar={admin} podeOperar={operador} />
          <FormDescoberta key={k(cfg.descoberta)} config={cfg.descoberta} podeEditar={admin} />
        </div>
      ),
    },
    {
      valor: "scoring",
      label: "Scoring",
      conteudo: <ConfigScoring key={k(cfg.scoring)} config={cfg.scoring} versoes={versoes} podeEditar={admin} podeOperar={operador} tz={tz} />,
    },
    {
      valor: "publicacao",
      label: "Publicação",
      conteudo: (
        <div className="space-y-6">
          <FormPublicacao key={k(cfg.publicacao)} config={cfg.publicacao} tz={tz} podeEditar={admin} />
          <BoardsPorCategoria boards={boards} categorias={opcoesCategoria} podeEditar={admin} />
        </div>
      ),
    },
    { valor: "ia", label: "IA", conteudo: <FormIA key={k(cfg.ia)} config={cfg.ia} versao={versaoIa} podeEditar={admin} /> },
    { valor: "criativos", label: "Criativos", conteudo: <FormCriativos key={k(cfg.criativos)} config={cfg.criativos} podeEditar={admin} /> },
    {
      valor: "seguranca",
      label: "Segurança",
      conteudo: <ConfigSeguranca membros={membros} usuarioId={sessao.userId} podeGerenciar={dono} podeVerMembros={admin} tz={tz} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description={
          admin
            ? "Regras de descoberta, score, automação e publicação. Toda alteração é validada e fica registrada na auditoria."
            : "Você pode consultar as configurações; somente administradores do ML podem alterá-las."
        }
      />
      <AbasConfiguracoes abas={abas} inicial={secao} />
    </div>
  );
}
