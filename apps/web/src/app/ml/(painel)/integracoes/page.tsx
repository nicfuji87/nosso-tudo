import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { redirectUri } from "@/lib/ml/integracoes/estado";
import { createClient } from "@/lib/supabase/server";
import { BannerRetorno } from "@/components/ml/integracoes/banner-retorno";
import { PrimeirosPassos } from "@/components/ml/integracoes/primeiros-passos";
import { IntegracaoMercadoLivre } from "@/components/ml/integracoes/mercadolivre";
import { IntegracaoPinterest } from "@/components/ml/integracoes/pinterest";
import { IntegracaoOpenAI } from "@/components/ml/integracoes/openai";
import { IntegracaoApify } from "@/components/ml/integracoes/apify";
import { Diagnostico } from "@/components/ml/integracoes/diagnostico";
import type { IntegracaoView } from "@/components/ml/integracoes/tipos";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

const COLUNAS =
  "provider, status, account_id, account_name, scopes, config, secret_hints, access_expires_at, refresh_expires_at, connected_at, last_refresh_at, last_checked_at, last_error";

function vazia(provider: IntegracaoView["provider"]): IntegracaoView {
  return {
    provider,
    status: "disconnected",
    account_id: null,
    account_name: null,
    scopes: [],
    config: {},
    secret_hints: {},
    access_expires_at: null,
    refresh_expires_at: null,
    connected_at: null,
    last_refresh_at: null,
    last_checked_at: null,
    last_error: null,
  };
}

/** Origem pública da requisição atual (para mostrar o Redirect URI exato). */
function origemRequisicao(): string | null {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function IntegracoesPage({ searchParams }: { searchParams: { ok?: string; erro?: string; provider?: string } }) {
  const sessao = await requireMlPage("viewer");
  const supabase = createClient();

  const [geral, ia, integracoesRes, boardsRes, categoriasRes, diagRes] = await Promise.all([
    lerConfig("geral"),
    lerConfig("ia"),
    supabase.from("ml_integrations").select(COLUNAS),
    supabase.from("ml_pinterest_boards").select("id", { count: "exact", head: true }).eq("active", true).is("removed_at", null),
    supabase.from("ml_categories").select("id", { count: "exact", head: true }).eq("tracked", true),
    temPapel(sessao.role, "operator")
      ? supabase.from("ml_jobs").select("id").eq("type", "DIAGNOSTICS").eq("status", "succeeded").limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const porProvedor = new Map(((integracoesRes.data ?? []) as IntegracaoView[]).map((i) => [i.provider, { ...i, scopes: i.scopes ?? [], config: i.config ?? {}, secret_hints: i.secret_hints ?? {} }]));
  const ml = porProvedor.get("mercadolivre") ?? vazia("mercadolivre");
  const pin = porProvedor.get("pinterest") ?? vazia("pinterest");
  const oai = porProvedor.get("openai") ?? vazia("openai");
  const apify = porProvedor.get("apify") ?? vazia("apify");

  const tz = geral.timezone;
  const origem = origemRequisicao();
  const permissoes = { operar: temPapel(sessao.role, "operator"), administrar: temPapel(sessao.role, "admin") };
  const boardsAtivos = boardsRes.count ?? 0;
  const ok = (s: IntegracaoView) => s.status === "connected" || s.status === "expiring";

  const etapas = [
    { titulo: "Conectar Mercado Livre", href: "#mercadolivre", feito: ok(ml) },
    { titulo: "Conectar Pinterest", href: "#pinterest", feito: ok(pin) },
    { titulo: "Ter boards no Pinterest", href: "/ml/configuracoes?secao=publicacao", feito: boardsAtivos > 0 },
    { titulo: "Escolher categorias", href: "/ml/configuracoes?secao=categorias", feito: (categoriasRes.count ?? 0) > 0 },
    { titulo: "Chave da OpenAI", href: "#openai", feito: oai.status === "connected", opcional: true },
    { titulo: "Token do Apify", href: "#apify", feito: apify.status === "connected", opcional: true },
    { titulo: "Revisar horários", href: "/ml/automacoes", feito: false, opcional: true },
    { titulo: "Rodar o Teste completo", href: "#diagnostico", feito: (diagRes.data ?? []).length > 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrações"
        description="Conecte as contas que o app usa. Senhas e chaves ficam guardadas de forma cifrada e nunca aparecem na tela — só os últimos caracteres."
      />

      <BannerRetorno ok={searchParams.ok} erro={searchParams.erro} provider={searchParams.provider} />

      <PrimeirosPassos etapas={etapas} />

      <IntegracaoMercadoLivre integ={ml} tz={tz} redirectUri={redirectUri("mercadolivre", origem)} permissoes={permissoes} />

      <IntegracaoPinterest integ={pin} tz={tz} redirectUri={redirectUri("pinterest", origem)} permissoes={permissoes} boardsAtivos={boardsAtivos} />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <IntegracaoOpenAI integ={oai} tz={tz} permissoes={permissoes} modeloTexto={ia.modelo_texto} modeloImagem={ia.modelo_imagem} />
        <IntegracaoApify integ={apify} tz={tz} permissoes={permissoes} />
      </div>

      <Diagnostico podeExecutar={permissoes.operar} />

      <p className="flex items-center gap-2 text-caption text-muted-foreground">
        <ShieldCheck className="size-4 text-success" aria-hidden />
        Segredos guardados no cofre cifrado do Supabase; toda alteração fica registrada na auditoria.
      </p>
    </div>
  );
}
