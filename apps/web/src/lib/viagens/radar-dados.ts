import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resumirLotes, type LoteMilhas } from "@/lib/viagens/custo";
import { getGrafo } from "@/lib/viagens/grafo";
import { calcularMilheiro, PROGRAMAS_PADRAO } from "@/lib/viagens/milheiro";
import type { Cabine, PrecoMilheiro } from "@/lib/viagens/radar-calc";
import { hojeISO } from "@/lib/format";

/**
 * Leitura e escrita do radar e das promoções.
 *
 * Telas usam o client do usuário (RLS p_ws garante o workspace). A rotina
 * diária não tem sessão: usa service_role e filtra workspace_id à mão.
 */

export interface RotaRadar {
  id: string;
  workspaceId: string;
  nome: string;
  origens: string[];
  destinos: string[];
  dataInicio: string;
  dataFim: string;
  duracaoMin: number | null;
  duracaoMax: number | null;
  pessoas: number;
  cabine: Cabine;
  programas: string[];
  apenasDireto: boolean;
  incluirDinheiro: boolean;
  alertaMilhasPp: number | null;
  alertaReaisPpCents: number | null;
  ativo: boolean;
  ultimaExecucao: string | null;
  ultimoErro: string | null;
}

interface RotaRow {
  id: string;
  workspace_id: string;
  nome: string;
  origens: string[];
  destinos: string[];
  data_inicio: string;
  data_fim: string;
  duracao_min: number | null;
  duracao_max: number | null;
  pessoas: number;
  cabine: Cabine;
  programas: string[];
  apenas_direto: boolean;
  incluir_dinheiro: boolean;
  alerta_milhas_pp: number | null;
  alerta_reais_pp_cents: number | string | null;
  ativo: boolean;
  ultima_execucao: string | null;
  ultimo_erro: string | null;
}

export const COLS_ROTA =
  "id, workspace_id, nome, origens, destinos, data_inicio, data_fim, duracao_min, duracao_max, pessoas, cabine, " +
  "programas, apenas_direto, incluir_dinheiro, alerta_milhas_pp, alerta_reais_pp_cents, ativo, ultima_execucao, ultimo_erro";

export function toRota(r: RotaRow): RotaRadar {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    nome: r.nome,
    origens: r.origens,
    destinos: r.destinos,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    duracaoMin: r.duracao_min,
    duracaoMax: r.duracao_max,
    pessoas: r.pessoas,
    cabine: r.cabine,
    programas: r.programas ?? [],
    apenasDireto: r.apenas_direto,
    incluirDinheiro: r.incluir_dinheiro,
    alertaMilhasPp: r.alerta_milhas_pp,
    alertaReaisPpCents: r.alerta_reais_pp_cents == null ? null : Number(r.alerta_reais_pp_cents),
    ativo: r.ativo,
    ultimaExecucao: r.ultima_execucao,
    ultimoErro: r.ultimo_erro,
  };
}

export interface ConfigRadar {
  workspaceId: string;
  origensPromo: string[];
  cabinesPromo: Cabine[];
  programas: string[];
  pessoasPromo: number;
  descontoMinimoPct: number;
  avisoWhatsapp: boolean;
  dinheiroPromo: boolean;
  serpapiMensalMax: number;
  ultimaPromoEm: string | null;
  ultimoAvisoEm: string | null;
  /** false = ainda não salvo (valores padrão). */
  salvo: boolean;
}

interface ConfigRow {
  workspace_id: string;
  origens_promo: string[];
  cabines_promo: Cabine[];
  programas: string[];
  pessoas_promo: number;
  desconto_minimo_pct: number;
  aviso_whatsapp: boolean;
  dinheiro_promo: boolean;
  serpapi_mensal_max: number;
  ultima_promo_em: string | null;
  ultimo_aviso_em: string | null;
}

export const COLS_CONFIG =
  "workspace_id, origens_promo, cabines_promo, programas, pessoas_promo, desconto_minimo_pct, aviso_whatsapp, " +
  "dinheiro_promo, serpapi_mensal_max, ultima_promo_em, ultimo_aviso_em";

export function toConfig(r: ConfigRow): ConfigRadar {
  return {
    workspaceId: r.workspace_id,
    origensPromo: r.origens_promo ?? [],
    cabinesPromo: r.cabines_promo?.length ? r.cabines_promo : ["economy"],
    programas: r.programas ?? [],
    pessoasPromo: r.pessoas_promo,
    descontoMinimoPct: r.desconto_minimo_pct,
    avisoWhatsapp: r.aviso_whatsapp,
    dinheiroPromo: r.dinheiro_promo,
    serpapiMensalMax: r.serpapi_mensal_max,
    ultimaPromoEm: r.ultima_promo_em,
    ultimoAvisoEm: r.ultimo_aviso_em,
    salvo: true,
  };
}

export function configPadrao(workspaceId: string, programas: string[]): ConfigRadar {
  return {
    workspaceId,
    origensPromo: [],
    cabinesPromo: ["economy"],
    programas,
    pessoasPromo: 1,
    descontoMinimoPct: 25,
    avisoWhatsapp: true,
    dinheiroPromo: true,
    serpapiMensalMax: 240,
    ultimaPromoEm: null,
    ultimoAvisoEm: null,
    salvo: false,
  };
}

// ---------------------------------------------------------------------------
// Milheiro da família (service_role: serve à tela e à rotina)
// ---------------------------------------------------------------------------

interface LoteRowMin {
  id: string;
  programa_id: string;
  quantidade: number | string;
  quantidade_restante: number | string;
  custo_cents: number | string;
  origem: LoteMilhas["origem"];
  data: string;
  expira_em: string | null;
}

export async function milheiroDoWorkspace(
  workspaceId: string,
): Promise<{ precos: PrecoMilheiro; alcancaveis: string[]; programasPadrao: string[] }> {
  const admin = createAdminClient();
  const [{ data }, grafo] = await Promise.all([
    admin
      .from("viagem_lotes")
      .select("id, programa_id, quantidade, quantidade_restante, custo_cents, origem, data, expira_em")
      .eq("workspace_id", workspaceId)
      .gt("quantidade_restante", 0),
    getGrafo(),
  ]);
  const porPrograma = new Map<string, LoteMilhas[]>();
  for (const r of (data as LoteRowMin[] | null) ?? []) {
    const lote: LoteMilhas = {
      id: r.id,
      programaId: r.programa_id,
      quantidade: Number(r.quantidade),
      quantidadeRestante: Number(r.quantidade_restante),
      custoCents: Number(r.custo_cents),
      origem: r.origem,
      data: r.data,
      expiraEm: r.expira_em,
    };
    porPrograma.set(r.programa_id, [...(porPrograma.get(r.programa_id) ?? []), lote]);
  }
  const saldos = new Map<string, number>();
  const custoCarteira = new Map<string, number>();
  for (const [id, lotes] of porPrograma) {
    const r = resumirLotes(lotes);
    saldos.set(id, r.saldo);
    if (r.custoPorMilCents) custoCarteira.set(id, r.custoPorMilCents);
  }
  const { precos, alcancaveis } = calcularMilheiro({
    programas: grafo.programas,
    transferencias: grafo.transferencias,
    saldos,
    custoCarteira,
    hoje: hojeISO(),
  });
  return { precos, alcancaveis, programasPadrao: alcancaveis.length ? alcancaveis : PROGRAMAS_PADRAO };
}

// ---------------------------------------------------------------------------
// Telas (client do usuário, RLS)
// ---------------------------------------------------------------------------

export async function listarRotas(workspaceId: string): Promise<RotaRadar[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("viagem_radar_rotas")
    .select(COLS_ROTA)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  return ((data as unknown as RotaRow[] | null) ?? []).map(toRota);
}

export interface SnapshotRadar {
  rotaId: string;
  dataRef: string;
  tipo: "milhas" | "dinheiro";
  milhasPp: number | null;
  taxasPpCents: number | null;
  custoPpCents: number | null;
  programas: string[];
  melhor: Record<string, unknown>;
  alternativas: Record<string, unknown>[];
}

interface SnapshotRow {
  rota_id: string;
  data_ref: string;
  tipo: "milhas" | "dinheiro";
  milhas_pp: number | null;
  taxas_pp_cents: number | string | null;
  custo_pp_cents: number | string | null;
  programas: string[];
  melhor: Record<string, unknown>;
  alternativas: Record<string, unknown>[];
}

const num = (v: number | string | null) => (v == null ? null : Number(v));

/** Snapshots dos últimos `dias` de todas as rotas do workspace (para card + gráfico). */
export async function listarSnapshots(workspaceId: string, dias = 60): Promise<SnapshotRadar[]> {
  const supabase = createClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("viagem_radar_snapshots")
    .select("rota_id, data_ref, tipo, milhas_pp, taxas_pp_cents, custo_pp_cents, programas, melhor, alternativas")
    .eq("workspace_id", workspaceId)
    .gte("data_ref", desde)
    .order("data_ref", { ascending: true });
  return ((data as SnapshotRow[] | null) ?? []).map((r) => ({
    rotaId: r.rota_id,
    dataRef: r.data_ref,
    tipo: r.tipo,
    milhasPp: r.milhas_pp,
    taxasPpCents: num(r.taxas_pp_cents),
    custoPpCents: num(r.custo_pp_cents),
    programas: r.programas ?? [],
    melhor: r.melhor,
    alternativas: r.alternativas ?? [],
  }));
}

export async function lerConfig(workspaceId: string): Promise<ConfigRadar | null> {
  const supabase = createClient();
  const { data } = await supabase.from("viagem_radar_config").select(COLS_CONFIG).eq("workspace_id", workspaceId).maybeSingle();
  return data ? toConfig(data as unknown as ConfigRow) : null;
}

export interface PromocaoTela {
  id: string;
  dataRef: string;
  tipo: "milhas" | "dinheiro";
  origem: string;
  destino: string;
  destinoNome: string | null;
  regiao: string | null;
  programa: string;
  cabine: string;
  dataVoo: string | null;
  milhas: number | null;
  taxasCents: number | null;
  precoCents: number | null;
  custoCents: number | null;
  referenciaCents: number | null;
  referenciaFonte: string | null;
  descontoPct: number | null;
  assentos: number | null;
  direto: boolean | null;
  companhias: string | null;
  score: number;
  payload: Record<string, unknown>;
}

interface PromoRow {
  id: string;
  data_ref: string;
  tipo: "milhas" | "dinheiro";
  origem: string;
  destino: string;
  destino_nome: string | null;
  regiao: string | null;
  programa: string;
  cabine: string;
  data_voo: string | null;
  milhas: number | null;
  taxas_cents: number | string | null;
  preco_cents: number | string | null;
  custo_cents: number | string | null;
  referencia_cents: number | string | null;
  referencia_fonte: string | null;
  desconto_pct: number | string | null;
  assentos: number | null;
  direto: boolean | null;
  companhias: string | null;
  score: number | string;
  payload: Record<string, unknown>;
}

/** Promoções da varredura mais recente do workspace. */
export async function listarPromocoes(workspaceId: string): Promise<{ dataRef: string | null; itens: PromocaoTela[] }> {
  const supabase = createClient();
  const { data: ultima } = await supabase
    .from("viagem_promocoes")
    .select("data_ref")
    .eq("workspace_id", workspaceId)
    .order("data_ref", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dataRef = (ultima as { data_ref: string } | null)?.data_ref ?? null;
  if (!dataRef) return { dataRef: null, itens: [] };
  const { data } = await supabase
    .from("viagem_promocoes")
    .select(
      "id, data_ref, tipo, origem, destino, destino_nome, regiao, programa, cabine, data_voo, milhas, taxas_cents, preco_cents, " +
        "custo_cents, referencia_cents, referencia_fonte, desconto_pct, assentos, direto, companhias, score, payload",
    )
    .eq("workspace_id", workspaceId)
    .eq("data_ref", dataRef)
    .order("score", { ascending: false })
    .limit(200);
  const itens = ((data as unknown as PromoRow[] | null) ?? []).map((r) => ({
    id: r.id,
    dataRef: r.data_ref,
    tipo: r.tipo,
    origem: r.origem,
    destino: r.destino,
    destinoNome: r.destino_nome,
    regiao: r.regiao,
    programa: r.programa,
    cabine: r.cabine,
    dataVoo: r.data_voo,
    milhas: r.milhas,
    taxasCents: num(r.taxas_cents),
    precoCents: num(r.preco_cents),
    custoCents: num(r.custo_cents),
    referenciaCents: num(r.referencia_cents),
    referenciaFonte: r.referencia_fonte,
    descontoPct: num(r.desconto_pct),
    assentos: r.assentos,
    direto: r.direto,
    companhias: r.companhias,
    score: Number(r.score),
    payload: r.payload,
  }));
  return { dataRef, itens };
}

// ---------------------------------------------------------------------------
// Uso de cota e última execução (service_role — tabelas deny-all)
// ---------------------------------------------------------------------------

export interface UsoApis {
  seatsHoje: number;
  seatsRestante: number | null;
  serpapiMes: number;
  ultimaExecucao: { iniciadoEm: string; status: string; resumo: Record<string, unknown>; erro: string | null } | null;
}

export async function lerUso(): Promise<UsoApis> {
  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioMes = hoje.slice(0, 8) + "01";
  const [{ data: uso }, { data: exec }] = await Promise.all([
    admin.from("viagem_api_uso").select("dia, fonte, chamadas, restante_informado").gte("dia", inicioMes),
    admin
      .from("viagem_cron_execucoes")
      .select("iniciado_em, status, resumo, erro")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const linhas = (uso as { dia: string; fonte: string; chamadas: number; restante_informado: number | null }[] | null) ?? [];
  const seats = linhas.find((l) => l.dia === hoje && l.fonte === "seats_aero");
  const e = exec as { iniciado_em: string; status: string; resumo: Record<string, unknown>; erro: string | null } | null;
  return {
    seatsHoje: seats?.chamadas ?? 0,
    seatsRestante: seats?.restante_informado ?? null,
    serpapiMes: linhas.filter((l) => l.fonte === "serpapi").reduce((s, l) => s + l.chamadas, 0),
    ultimaExecucao: e ? { iniciadoEm: e.iniciado_em, status: e.status, resumo: e.resumo, erro: e.erro } : null,
  };
}
