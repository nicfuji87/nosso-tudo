import type { Metadata } from "next";
import {
  AlertOctagon,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Hourglass,
  ImagePlus,
  Link2,
  Palette,
  PinIcon,
  Send,
  ServerCrash,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { Secao } from "@/components/ml/campos";
import { AcoesDashboard } from "@/components/ml/dashboard/acoes-dashboard";
import {
  AlertasBloco,
  AtividadesBloco,
  PerformanceBloco,
  ProdutosRecentesBloco,
  ProximosJobsBloco,
} from "@/components/ml/dashboard/blocos";
import { FamiliasBloco } from "@/components/ml/dashboard/blocos-v2";
import { ContadorLink } from "@/components/ml/dashboard/contador";
import { OnboardingCard, type PassoOnboarding } from "@/components/ml/dashboard/onboarding";
import {
  CONTADORES_V2_VAZIOS,
  CONTADORES_VAZIOS,
  type AgendamentoResumo,
  type ContadoresV2,
  type MelhorItem,
  type Atividade,
  type ContadoresDashboard,
  type IntegracaoResumo,
  type PendenciaResumo,
  type PinTop,
  type ProdutoRecente,
} from "@/components/ml/dashboard/tipos";
import {
  ATOR_LABEL,
  linkEntidade,
  rotuloAcao,
  rotuloEntidade,
  rotuloStatusEntidade,
  truncarTexto,
} from "@/components/ml/logs/formatos";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { TIPO_VISUAL_LABEL } from "@/lib/ml/familias/plano";
import { lerConfig } from "@/lib/ml/config";
import { diaNoFuso } from "@/lib/ml/tempo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const TIPOS_ALERTA = ["integration_auth", "publish_blocked", "product_changed", "job_failed", "config_incomplete"];
const STATUS_RUINS = ["disconnected", "error", "expiring", "invalid", "insufficient_scope"];

interface LinhaBreakdown {
  key: string;
  label: string | null;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  ctr: number | null;
}

interface AuditoriaResumo {
  id: number;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

interface TransicaoResumo {
  id: number;
  entity_type: string;
  entity_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  actor_type: string;
  created_at: string;
}

function mesclarContadores(bruto: unknown): ContadoresDashboard {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<ContadoresDashboard>;
  return {
    ...CONTADORES_VAZIOS,
    ...b,
    metricas_7d: { ...CONTADORES_VAZIOS.metricas_7d, ...(b.metricas_7d ?? {}) },
  };
}

function mesclarV2(bruto: unknown): ContadoresV2 {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<Record<keyof ContadoresV2, unknown>>;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const porTipo: Record<string, number> = {};
  if (b.publicados_por_tipo && typeof b.publicados_por_tipo === "object")
    for (const [k, v] of Object.entries(b.publicados_por_tipo as Record<string, unknown>)) porTipo[k] = n(v);
  return {
    ...CONTADORES_V2_VAZIOS,
    familias_em_teste: n(b.familias_em_teste),
    produtos_sem_referencia: n(b.produtos_sem_referencia),
    criativos_alerta_fidelidade: n(b.criativos_alerta_fidelidade),
    criativos_fidelidade_pendente: n(b.criativos_fidelidade_pendente),
    pacotes_pendentes: n(b.pacotes_pendentes),
    publicados_por_tipo: porTipo,
  };
}

/** Linha de maior outbound (desempate por impressões); null sem cliques de saída. */
function melhorDe(dados: unknown, rotular: (l: LinhaBreakdown) => string): MelhorItem | null {
  const linhas = ((dados ?? []) as (LinhaBreakdown & { pins?: number })[])
    .filter((l) => Number(l.outbound_clicks) > 0)
    .sort((a, b) => Number(b.outbound_clicks) - Number(a.outbound_clicks) || Number(b.impressions) - Number(a.impressions));
  const l = linhas[0];
  if (!l) return null;
  const imp = Number(l.impressions) || 0;
  const oc = Number(l.outbound_clicks) || 0;
  return { rotulo: rotular(l), outbound_clicks: oc, impressions: imp, ctr: imp > 0 ? oc / imp : null, pins: Number(l.pins) || 0 };
}

export default async function MlDashboardPage() {
  const supabase = createClient();
  const agoraIso = new Date().toISOString();
  const [role, geral, automacao] = await Promise.all([getMlRole(), lerConfig("geral"), lerConfig("automacao")]);
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");
  const podeAdministrar = temPapel(role, "admin");

  const de30 = diaNoFuso(new Date(Date.now() - 29 * 86400000), tz);
  const ate = diaNoFuso(new Date(), tz);

  const [
    dash,
    agendamentosR,
    integracoesR,
    pendenciasR,
    produtosR,
    auditoriaR,
    transicoesR,
    boardsR,
    categoriasR,
    diagnosticoR,
    breakdownR,
    dashV2,
    cenaR,
    tipoR,
  ] = await Promise.all([
    supabase.rpc("ml_dashboard"),
    supabase
      .from("ml_schedules")
      .select("id, name, cron_expression, timezone, enabled, next_run_at, last_run_at, last_status, last_duration_ms")
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase.from("ml_integrations").select("provider, status, account_name, last_error, access_expires_at"),
    supabase
      .from("ml_tasks")
      .select("id, type, title, detail, entity_type, entity_id, payload, priority, created_at")
      .in("type", TIPOS_ALERTA)
      .or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lt."${agoraIso}")`)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("ml_products")
      .select("id, title, thumbnail, score, score_confidence, status, first_seen_at, current_price")
      .order("first_seen_at", { ascending: false })
      .limit(6),
    podeOperar
      ? supabase
          .from("ml_audit_log")
          .select("id, actor_type, action, entity_type, entity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] as AuditoriaResumo[] }),
    supabase
      .from("ml_status_history")
      .select("id, entity_type, entity_id, from_status, to_status, reason, actor_type, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("ml_pinterest_boards").select("id", { count: "exact", head: true }).eq("active", true).is("removed_at", null),
    supabase.from("ml_categories").select("id", { count: "exact", head: true }).eq("tracked", true),
    podeAdministrar
      ? supabase.from("ml_jobs").select("id").eq("type", "DIAGNOSTICS").eq("status", "succeeded").limit(1)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.rpc("ml_analytics_breakdown", { p_from: de30, p_to: ate, p_dimension: "pin", p_filters: {} }),
    supabase.rpc("ml_dashboard_v2"),
    supabase.rpc("ml_analytics_breakdown", { p_from: de30, p_to: ate, p_dimension: "scene", p_filters: {} }),
    supabase.rpc("ml_analytics_breakdown", { p_from: de30, p_to: ate, p_dimension: "visual_type", p_filters: {} }),
  ]);

  const c = mesclarContadores(dash.data);
  const v2 = mesclarV2(dashV2.data);
  const melhorCena = melhorDe(cenaR.data, (l) => l.label || l.key);
  const melhorTipo = melhorDe(tipoR.data, (l) => (TIPO_VISUAL_LABEL as Record<string, string>)[l.key] ?? l.label ?? l.key);
  const agendamentos = (agendamentosR.data ?? []) as AgendamentoResumo[];
  const integracoes = (integracoesR.data ?? []) as IntegracaoResumo[];
  const pendencias = (pendenciasR.data ?? []) as PendenciaResumo[];
  const produtos = (produtosR.data ?? []) as ProdutoRecente[];
  const auditoria = (auditoriaR.data ?? []) as AuditoriaResumo[];
  const transicoes = (transicoesR.data ?? []) as TransicaoResumo[];

  // ---- Melhores Pins (agregado no banco, dimensão "pin") ----
  const topLinhas = ((breakdownR.data ?? []) as LinhaBreakdown[])
    .filter((l) => Number(l.outbound_clicks) > 0)
    .sort((a, b) => Number(b.outbound_clicks) - Number(a.outbound_clicks) || Number(b.impressions) - Number(a.impressions))
    .slice(0, 5);

  // ---- Nomes de produtos para atividades + dados dos Pins do top 5 (consultas limitadas) ----
  const idsProdutosAtividade = [
    ...new Set(
      [...transicoes, ...auditoria]
        .filter((x) => x.entity_type === "product" && x.entity_id)
        .map((x) => x.entity_id as string),
    ),
  ];
  const [pinsTopR, nomesR] = await Promise.all([
    topLinhas.length
      ? supabase
          .from("ml_pins")
          .select("id, creative_id, title, external_url, media_url, product_id, published_at")
          .in("id", topLinhas.map((l) => l.key))
      : Promise.resolve({ data: [] }),
    idsProdutosAtividade.length
      ? supabase.from("ml_products").select("id, title").in("id", idsProdutosAtividade.slice(0, 40))
      : Promise.resolve({ data: [] }),
  ]);
  const pinsTop = (pinsTopR.data ?? []) as {
    id: string;
    creative_id: string;
    title: string | null;
    external_url: string | null;
    media_url: string | null;
  }[];
  const pinPorId = new Map(pinsTop.map((p) => [p.id, p]));
  const top: PinTop[] = topLinhas.map((l) => {
    const pin = pinPorId.get(l.key);
    const imp = Number(l.impressions) || 0;
    const oc = Number(l.outbound_clicks) || 0;
    return {
      chave: l.key,
      titulo: pin?.title || l.label || "Pin sem título",
      thumbnail: pin?.media_url ?? null,
      href: pin ? `/ml/publicacoes?pin=${pin.id}` : "/ml/analytics",
      externo: pin?.external_url ?? null,
      impressions: imp,
      outbound_clicks: oc,
      saves: Number(l.saves) || 0,
      ctr: imp > 0 ? oc / imp : null,
    };
  });

  const nomes = new Map(((nomesR.data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
  const nomeEntidade = (tipo: string | null, id: string | null) => {
    const base = rotuloEntidade(tipo);
    if (tipo === "product" && id && nomes.has(id)) return `${base} “${truncarTexto(nomes.get(id), 60)}”`;
    return base;
  };

  const atividades: Atividade[] = [
    ...auditoria.map<Atividade>((a) => ({
      id: `a-${a.id}`,
      quando: a.created_at,
      tipo: "auditoria",
      titulo: rotuloAcao(a.action),
      detalhe: a.entity_type ? nomeEntidade(a.entity_type, a.entity_id) : null,
      ator: ATOR_LABEL[a.actor_type] ?? a.actor_type,
      href: linkEntidade(a.entity_type, a.entity_id),
    })),
    ...transicoes.map<Atividade>((t) => ({
      id: `t-${t.id}`,
      quando: t.created_at,
      tipo: "transicao",
      titulo: `${nomeEntidade(t.entity_type, t.entity_id)}: ${rotuloStatusEntidade(t.entity_type, t.from_status)} → ${rotuloStatusEntidade(t.entity_type, t.to_status)}`,
      detalhe: t.reason ? truncarTexto(t.reason, 120) : null,
      ator: ATOR_LABEL[t.actor_type] ?? t.actor_type,
      href: linkEntidade(t.entity_type, t.entity_id),
    })),
  ]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, 15);

  // ---- Alertas ----
  const intPorProvider = new Map(integracoes.map((i) => [i.provider, i]));
  const integracoesRuins = integracoes.filter((i) =>
    i.provider === "mercadolivre" || i.provider === "pinterest"
      ? STATUS_RUINS.includes(i.status)
      : i.status === "error" || i.status === "invalid",
  );

  // ---- Próximos jobs ----
  const ativos = agendamentos.filter((a) => a.enabled);
  const proximos = ativos.slice(0, 6);
  const desativados = agendamentos.length - ativos.length;

  // ---- Onboarding (spec §3.1) — só para quem pode configurar ----
  const conectado = (p: string) => {
    const s = intPorProvider.get(p)?.status;
    return s === "connected" || s === "expiring";
  };
  const passos: PassoOnboarding[] = [
    { chave: "ml", titulo: "Conectar Mercado Livre", descricao: "OAuth da conta de afiliado.", href: "/ml/integracoes", feito: conectado("mercadolivre") },
    { chave: "pinterest", titulo: "Conectar Pinterest", descricao: "OAuth da conta que publica os Pins.", href: "/ml/integracoes", feito: conectado("pinterest") },
    { chave: "boards", titulo: "Boards sincronizados", descricao: "Escolha onde os Pins serão publicados.", href: "/ml/integracoes", feito: (boardsR.count ?? 0) > 0 },
    { chave: "categorias", titulo: "Categorias escolhidas", descricao: "Categorias do ML acompanhadas na descoberta.", href: "/ml/configuracoes", feito: (categoriasR.count ?? 0) > 0 },
    { chave: "openai", titulo: "OpenAI", descricao: "Copy, análise e imagem por IA.", href: "/ml/integracoes", feito: conectado("openai"), opcional: true },
    { chave: "apify", titulo: "Apify", descricao: "Enriquecimento extra de produtos.", href: "/ml/integracoes", feito: conectado("apify"), opcional: true },
    { chave: "horarios", titulo: "Horários das automações", descricao: "Revise descoberta, publicação e analytics.", href: "/ml/automacoes", feito: false, revisar: true },
    { chave: "teste", titulo: "Teste completo", descricao: "Diagnóstico de ponta a ponta antes de automatizar.", href: "/ml/integracoes#diagnostico", feito: ((diagnosticoR.data ?? []) as unknown[]).length > 0 },
  ];
  const onboardingPendente = podeAdministrar && passos.some((p) => !p.opcional && !p.revisar && !p.feito);

  const totalPendenciasHumanas =
    c.aguardando_aprovacao + c.aguardando_link + c.criativos_revisao + c.imagens_manuais + c.pins_aprovacao + c.pendencias_abertas;
  const tomAcao = (n: number) => (n > 0 ? "acao" : "neutro");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          totalPendenciasHumanas > 0
            ? `${totalPendenciasHumanas} item(ns) esperando por você.`
            : "Tudo em dia — nada esperando por você agora."
        }
        actions={<AcoesDashboard podeOperar={podeOperar} podeAdministrar={podeAdministrar} pausado={automacao.pausado} />}
      />

      {onboardingPendente && <OnboardingCard passos={passos} />}

      <AlertasBloco integracoes={integracoesRuins} pendencias={pendencias} totalPendencias={c.pendencias_abertas} tz={tz} />

      <Secao
        titulo="Pendências humanas"
        descricao="Só o que precisa de você — clique para abrir a fila."
      >
        {totalPendenciasHumanas === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-3 text-body-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden /> Nenhuma pendência. A operação está seguindo sozinha.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ContadorLink href="/ml/pendencias" rotulo="Produtos aguardando aprovação" valor={c.aguardando_aprovacao} icone={ThumbsUp} tom={tomAcao(c.aguardando_aprovacao)} />
            <ContadorLink href="/ml/pendencias/links" rotulo="Links de afiliado a colar" valor={c.aguardando_link} icone={Link2} tom={tomAcao(c.aguardando_link)} />
            <ContadorLink href="/ml/criativos?status=review" rotulo="Criativos em revisão" valor={c.criativos_revisao} icone={Palette} tom={tomAcao(c.criativos_revisao)} />
            <ContadorLink href="/ml/pendencias/imagens" rotulo="Imagens manuais (ChatGPT)" valor={c.imagens_manuais} icone={ImagePlus} tom={tomAcao(c.imagens_manuais)} />
            <ContadorLink href="/ml/publicacoes?status=pending_approval" rotulo="Pins aguardando aprovação" valor={c.pins_aprovacao} icone={PinIcon} tom={tomAcao(c.pins_aprovacao)} />
            <ContadorLink href="/ml/pendencias" rotulo="Exceções abertas" valor={c.pendencias_abertas} icone={AlertOctagon} tom={c.pendencias_abertas > 0 ? "alerta" : "neutro"} />
          </div>
        )}
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Operação" descricao="Hoje e últimos 7 dias — clique para ver a lista.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ContadorLink href="/ml/descobertas" rotulo="Descobertos em 24 h" dica={`${c.descobertos_7d} em 7 dias · ${c.aguardando_analise} em análise`} valor={c.descobertos_24h} icone={Compass} />
            <ContadorLink href="/ml/produtos?status=approved" rotulo="Aprovados hoje" valor={c.aprovados_hoje} icone={ClipboardCheck} />
            <ContadorLink href="/ml/criativos?status=generating" rotulo="Criativos em produção" valor={c.criativos_em_geracao} icone={Hourglass} />
            <ContadorLink href="/ml/publicacoes?status=published" rotulo="Pins publicados hoje" dica={`${c.pins_publicados_7d} em 7 dias · ${c.pins_agendados} agendados`} valor={c.pins_hoje} icone={Send} tom={c.pins_hoje > 0 ? "ok" : "neutro"} />
            <ContadorLink href="/ml/publicacoes?vista=falhas" rotulo="Pins com falha ou bloqueados" valor={c.pins_falha} icone={XCircle} tom={c.pins_falha > 0 ? "erro" : "neutro"} />
            <ContadorLink href="/ml/logs?status=dead" rotulo="Jobs com falha (7 dias)" valor={c.jobs_falha_7d} icone={ServerCrash} tom={c.jobs_falha_7d > 0 ? "erro" : "neutro"} />
          </div>
        </Secao>
        <PerformanceBloco c={c} top={top} />
      </div>

      <FamiliasBloco v2={v2} melhorCena={melhorCena} melhorTipo={melhorTipo} erro={dashV2.error?.message ?? null} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProximosJobsBloco agendamentos={proximos} desativados={desativados} pausado={automacao.pausado} jobsAtivos={c.jobs_ativos} tz={tz} />
        <ProdutosRecentesBloco produtos={produtos} tz={tz} />
      </div>

      <AtividadesBloco atividades={atividades} tz={tz} podeVerLogs={podeOperar} />
    </div>
  );
}
