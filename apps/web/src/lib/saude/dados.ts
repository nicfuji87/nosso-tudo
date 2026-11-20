import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Painel de Saúde (dados do relógio via Edge Function `saude-relogio` + diário do site).
 *
 * Tudo é lido com o client do USUÁRIO: as tabelas saude_* têm RLS por workspace, então o banco
 * garante o isolamento. Agregados pesados (noites, treinos) são funções SQL SECURITY INVOKER.
 * O PostgREST corta em 1000 linhas — por isso `paginar`.
 *
 * Algoritmos versionados (a interpretação de dados antigos não muda em silêncio):
 *   noites-v6 · treino-v1 · samsung-v1 · radar-v2 · prontidao-v1 · recuperacao-v1 (SQL) · padrao-v1 e insights-v3 (aqui)
 */

export const ALGORITMOS = {
  noites: "noites-v6", treino: "treino-v1", samsung: "samsung-v1", padrao: "padrao-v1", radar: "radar-v2", insights: "insights-v3",
  prontidao: "prontidao-v1", recuperacao: "recuperacao-v1",
} as const;
export const NOITES_BASE = 28; // linha de base pessoal completa
export const NOITES_MIN_COMPARAR = 7; // antes disso não há "seu normal" para comparar

export interface Dispositivo {
  id: string;
  nome: string;
  modelo: string | null;
  criadoEm: string;
  ultimoEnvioEm: string | null;
  versao: string | null;
  bateria: number | null;
  carregando: boolean | null;
  noPulso: boolean | null;
  ultimaLeituraEm: string | null;
  estadoEm: string | null;
  /** app do celular: última sincronização boa, último erro, se a One UI pode pausar o app */
  diagnostico: { versao: string | null; erro: string | null; ultimaSync: string | null; otimizacaoBateria: boolean | null; recebidoEm: string | null } | null;
}

export interface PontoBpm { minuto: string; bpm: number; min: number; max: number }
export interface RegistroSaude { id: string; ts: string; tipo: string; valor: string }
export interface EcgResumo { id: string; ts: string; duracaoS: number; hz: number }

export interface Noite {
  noite: string; minutos: number; fcRepouso: number | null; vfc: number | null; janelas: number; temp: number | null; janelasTemp: number;
  /** sono do Samsung Health quando houver; senão, estimado pelo batimento (noites-v5) */
  sonoInicio: string | null; sonoFim: string | null; fonteSono: "samsung" | "batimento" | null;
  /** SpO₂ da noite (Samsung Health) */
  spo2: number | null; spo2Min: number | null;
}

/** Trecho da linha do tempo do relógio (explica as lacunas do batimento). */
export interface TrechoRelogio {
  tipo: "carregando" | "fora_do_pulso" | "sem_leitura";
  inicio: string;
  fim: string;
  bateriaInicio: number | null;
  bateriaFim: number | null;
  emAndamento: boolean;
}
/** Dados do Samsung Health (app do celular, Data SDK). */
export interface SonoSamsung {
  inicio: string; fim: string; duracaoMin: number | null; nota: number | null;
  estagiosMin: { acordado: number; leve: number; profundo: number; rem: number };
  estagios: [number, number, "acordado" | "leve" | "profundo" | "rem"][];
}
export interface ExercicioSamsung {
  inicio: string; fim: string; tipo: string; modalidade: string | null; auto: boolean | null;
  fcMedia: number | null; fcMax: number | null; calorias: number | null;
}
export interface ComposicaoCorporal {
  ts: string; peso: number | null; gorduraPct: number | null; musculoKg: number | null; aguaKg: number | null; imc: number | null; tmb: number | null;
}
export interface Samsung {
  sono: SonoSamsung | null; // última noite
  passos: { hoje: number | null; media7: number | null; dias: { dia: string; total: number }[] } | null;
  corpo: (ComposicaoCorporal & { anterior: ComposicaoCorporal | null }) | null;
  /** avisos de ritmo cardíaco irregular (Samsung Health Monitor) no último ano */
  ritmoIrregular: { total: number; ultimo: string | null };
  /** resultado de apneia do sono (Samsung Health Monitor) */
  apneia: { sinal: "DETECTED" | "NOT_DETECTED" | "UNDEFINED" | string; ts: string } | null;
  vo2max: { valor: number; ts: string } | null;
  spo2: { media: number | null; min: number | null } | null; // durante a última noite
  pele: number | null;
  energia: { dia: string; score: number } | null;
  exercicios: ExercicioSamsung[];
  conectado: boolean;
}

export interface Bateria {
  atual: number | null;
  carregando: boolean | null;
  consumoHora: number | null; // % por hora, no pulso e sem carregar (mediana)
  autonomiaHoras: number | null;
  ultimaCarga: TrechoRelogio | null;
  minutosCargaPorDia: number | null; // quanto carregar por dia para cobrir o gasto
  pontos: { ts: string; bateria: number }[];
}

export type NivelRadar = "calibrando" | "normal" | "observar" | "estresse";
/** Uma noite do Radar de Saúde (radar-v1, função SQL saude_radar). */
export interface RadarNoite {
  noite: string;
  fc: number | null; fcNormal: number | null; fcFora: boolean;
  vfc: number | null; vfcNormal: number | null; vfcFora: boolean;
  temp: number | null; tempNormal: number | null; tempFora: boolean;
  spo2: number | null; spo2Normal: number | null; spo2Fora: boolean;
  sinais: number; base: number; doente: boolean; nivel: NivelRadar;
}

/** Nota do dia (prontidao-v1, função SQL saude_prontidao). Não é diagnóstico. */
export interface Prontidao {
  score: number | null;
  nivel: "alto" | "moderado" | "baixo" | null;
  calibrando: boolean;
  fatores: { sinal: string; texto: string; efeito: number }[];
  carga: { aguda: number; cronicaSemana: number | null; razao: number | null };
  sono: { horas: number | null; fonte: string | null; acordar: string | null; deitar: string | null; regularidadeMin: number | null; noites: number };
}
/** Placar do radar contra os dias em que você marcou "fiquei doente". */
export interface PlacarRadar { episodios: number; avisadosAntes: number; avisos: number; avisosSemNada: number }

export interface Zonas { leve: number; moderado: number; intenso: number; maximo: number }
export interface Treino {
  chave: string; // inicio ISO do bloco detectado (ou id do evento manual)
  eventoId: string | null;
  inicio: string;
  fim: string;
  minutos: number;
  fcMedia: number | null;
  fcMax: number | null;
  zonas: Zonas | null;
  carga: number | null;
  status: "sugerido" | "confirmado";
  modalidade: string | null;
  esforco: number | null;
  /** padrao-v1: modalidade provável pelo seu histórico (mesmo dia da semana e horário parecido). */
  palpite: string | null;
  /** de onde veio: Samsung Health (samsung-v1), detectado e confirmado, ou lançado à mão */
  origem: string | null;
  /** recuperacao-v1: queda do batimento ~1 e ~2 min depois do fim (aprox., médias por minuto) */
  recuperacao: { fcFim: number; queda1: number; queda2: number | null } | null;
  calorias: number | null;
}

export interface EventoDiario {
  id: string;
  tipo: string;
  inicio: string;
  fim: string | null;
  detalhes: Record<string, unknown>;
  nota: string | null;
  origem: string;
}

export interface MalEstar {
  id: string;
  ts: string;
  situacao: string | null;
  sintomas: string[];
  nota: string | null;
  fonte: "relogio" | "site";
  serie: PontoBpm[]; // 10 min antes a 10 min depois
}

export interface Desvio { valor: number; normal: number; delta: number; deltaPct: number; noites: number }

export interface Insight {
  id: string;
  tom: "neutro" | "atencao" | "bom" | "acao";
  titulo: string;
  texto: string;
  influencias?: string[];
}

export interface Qualidade {
  minutos24h: number;
  /** minutos sem batimento nas últimas 24 h, por causa */
  semMedir: { carregando: number; foraDoPulso: number; semExplicacao: number };
  cobertura24h: number; // 0–1
  janelasVfc24h: number;
  atrasoMin: number | null;
}

export interface PainelSaude {
  dispositivos: Dispositivo[];
  bpm24h: PontoBpm[];
  ultimoBpm: { bpm: number; minuto: string } | null;
  faixaHoje: { min: number; max: number } | null;
  noites: Noite[];
  ultimaNoite: Noite | null;
  noitesBase: number;
  desvioFc: Desvio | null;
  desvioVfc: Desvio | null;
  desvioTemp: Desvio | null;
  radar: RadarNoite[]; // mais recente primeiro
  placar: PlacarRadar;
  treinos: Treino[];
  carga7d: number;
  carga7dAnterior: number;
  eventos: EventoDiario[];
  registros: RegistroSaude[];
  malEstares: MalEstar[];
  ecgs: EcgResumo[];
  qualidade: Qualidade;
  insights: Insight[];
  linhaDoTempo: TrechoRelogio[]; // últimas 24 h
  bateria: Bateria;
  samsung: Samsung;
  prontidao: Prontidao | null;
  /** tendência da recuperação pós-treino (queda em ~1 min), mais antigo primeiro */
  recuperacoes: { ts: string; modalidade: string | null; queda1: number }[];
}

/** Data local (YYYY-MM-DD) no fuso do workspace. */
export function diaLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Instante em ms de um ISO; e se dois intervalos se sobrepõem. (No topo: usados em várias seções.) */
const ms = (x: string) => new Date(x).getTime();
const sobrepoe = (a1: string, a2: string, b1: string, b2: string) => ms(a1) < ms(b2) && ms(b1) < ms(a2);

export function horaLocal(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

async function paginar<T>(buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maximo = 6000): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; de < maximo; de += 1000) {
    const { data, error } = await buscar(de, de + 999);
    if (error) throw error;
    tudo.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return tudo;
}

/** Dia da semana (0–6) e minuto do dia no fuso local. */
function momentoLocal(iso: string, tz: string): { dia: number; min: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "0";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { dia, min: Number(v("hour")) * 60 + Number(v("minute")) };
}

/**
 * padrao-v1: palpite de modalidade a partir dos treinos já confirmados.
 * 1º mesmo dia da semana e início a ±90 min (1 ocorrência basta); 2º qualquer dia, ±90 min, ≥ 2 ocorrências.
 * Empate: o mais recente. É só o valor inicial do botão — você sempre confirma.
 */
function palpiteModalidade(inicio: string, historico: { inicio: string; modalidade: string }[], tz: string): string | null {
  const alvo = momentoLocal(inicio, tz);
  const perto = historico.filter((h) => Math.abs(momentoLocal(h.inicio, tz).min - alvo.min) <= 90);
  const escolher = (lista: typeof historico, minimo: number) => {
    const cont = new Map<string, { n: number; ultimo: string }>();
    for (const h of lista) {
      const c = cont.get(h.modalidade) ?? { n: 0, ultimo: "" };
      cont.set(h.modalidade, { n: c.n + 1, ultimo: h.inicio > c.ultimo ? h.inicio : c.ultimo });
    }
    const melhor = [...cont.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ultimo.localeCompare(a[1].ultimo))[0];
    return melhor && melhor[1].n >= minimo ? melhor[0] : null;
  };
  return escolher(perto.filter((h) => momentoLocal(h.inicio, tz).dia === alvo.dia), 1) ?? escolher(perto, 2);
}

/** Desvio de um sinal na noite do radar (só quando já existe "seu normal"). */
function desvioDe(r: RadarNoite | undefined, valor: "fc" | "vfc" | "temp", normal: "fcNormal" | "vfcNormal" | "tempNormal"): Desvio | null {
  if (!r || r.nivel === "calibrando") return null;
  const v = r[valor];
  const n = r[normal];
  if (v == null || n == null) return null;
  return { valor: v, normal: n, delta: v - n, deltaPct: n ? (v / n - 1) * 100 : 0, noites: r.base };
}

const ROTULO_EVENTO: Record<string, string> = {
  treino: "treino", sintoma: "sintoma", malestar: "mal-estar", medicamento: "medicamento", alcool: "álcool",
  cafeina: "cafeína", doenca: "doença", estresse: "estresse", sono: "sono ruim", nota: "nota",
};

export async function getPainelSaude(workspaceId: string, tz = "America/Sao_Paulo"): Promise<PainelSaude> {
  const supabase = createClient();
  const agora = Date.now();
  const hoje = diaLocal(new Date(agora).toISOString(), tz);
  const desde24h = new Date(agora - 24 * 3600_000).toISOString();
  const desde60d = new Date(agora - 60 * 86_400_000).toISOString();

  const [disp, bpm, vfc24, regs, ecgs, noitesR, treinosR, eventosR, radarR, estadosR, samsungR, raroR, prontR] = await Promise.all([
    supabase
      .from("saude_dispositivos")
      .select("id, nome, modelo, criado_em, ultimo_envio_em, versao_app, bateria_pct, carregando, no_pulso, ultima_leitura_em, estado_em, diagnostico")
      .eq("workspace_id", workspaceId)
      .is("revogado_em", null)
      .order("criado_em", { ascending: true }),
    paginar<{ minuto: string; bpm_medio: number; bpm_min: number; bpm_max: number }>((de, ate) =>
      supabase
        .from("saude_bpm_minuto")
        .select("minuto, bpm_medio, bpm_min, bpm_max")
        .eq("workspace_id", workspaceId)
        .gte("minuto", desde24h)
        .order("minuto", { ascending: true })
        .range(de, ate),
    ),
    supabase.from("saude_vfc_janelas").select("inicio", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("inicio", desde24h),
    supabase.from("saude_registros").select("id, ts, tipo, valor").eq("workspace_id", workspaceId).order("ts", { ascending: false }).limit(60),
    supabase.from("saude_ecgs").select("id, ts, duracao_s, hz").eq("workspace_id", workspaceId).order("ts", { ascending: false }).limit(10),
    supabase.rpc("saude_noites", { p_workspace_id: workspaceId, p_dias: 35, p_tz: tz }),
    supabase.rpc("saude_treinos_detectados", { p_workspace_id: workspaceId, p_dias: 14, p_limiar: 100 }),
    supabase
      .from("saude_eventos")
      .select("id, tipo, inicio, fim, detalhes, nota, origem, descartado")
      .eq("workspace_id", workspaceId)
      .gte("inicio", desde60d)
      .order("inicio", { ascending: false })
      .limit(300),
    supabase.rpc("saude_radar", { p_workspace_id: workspaceId, p_tz: tz }),
    supabase
      .from("saude_estado_eventos")
      .select("ts, tipo, bateria")
      .eq("workspace_id", workspaceId)
      .gte("ts", new Date(agora - 72 * 3600_000).toISOString())
      .order("ts", { ascending: true })
      .limit(2000),
    supabase
      .from("saude_samsung")
      .select("tipo, inicio, fim, dados")
      .eq("workspace_id", workspaceId)
      .gte("inicio", new Date(agora - 15 * 86_400_000).toISOString())
      .order("inicio", { ascending: false })
      .limit(500),
    // medições raras: composição corporal, ritmo irregular, apneia (último ano)
    supabase
      .from("saude_samsung")
      .select("tipo, inicio, fim, dados")
      .eq("workspace_id", workspaceId)
      .in("tipo", ["corpo", "ritmo_irregular", "apneia"])
      .gte("inicio", new Date(agora - 365 * 86_400_000).toISOString())
      .order("inicio", { ascending: false })
      .limit(200),
    supabase.rpc("saude_prontidao", { p_workspace_id: workspaceId, p_tz: tz }),
  ]);

  // ---- dispositivos
  const dispositivos: Dispositivo[] = (disp.data ?? []).map((d) => ({
    id: d.id, nome: d.nome, modelo: d.modelo, criadoEm: d.criado_em, ultimoEnvioEm: d.ultimo_envio_em,
    versao: d.versao_app, bateria: d.bateria_pct, carregando: d.carregando, noPulso: d.no_pulso,
    ultimaLeituraEm: d.ultima_leitura_em, estadoEm: d.estado_em,
    diagnostico: d.diagnostico && typeof d.diagnostico === "object" ? (() => {
      const g = d.diagnostico as Record<string, unknown>;
      const t = (k: string) => (typeof g[k] === "string" ? (g[k] as string) : null);
      return {
        versao: t("versao"), erro: t("erro"), ultimaSync: t("ultima_sync"), recebidoEm: t("recebido_em"),
        otimizacaoBateria: typeof g.otimizacao_bateria === "boolean" ? g.otimizacao_bateria : null,
      };
    })() : null,
  }));

  // ---- batimento 24 h
  const bpm24h: PontoBpm[] = bpm.map((b) => ({ minuto: b.minuto, bpm: Math.round(b.bpm_medio), min: b.bpm_min, max: b.bpm_max }));
  const deHoje = bpm24h.filter((b) => diaLocal(b.minuto, tz) === hoje);
  const ultimo = bpm24h.at(-1);
  const faixaHoje = deHoje.length ? { min: Math.min(...deHoje.map((b) => b.min)), max: Math.max(...deHoje.map((b) => b.max)) } : null;

  // ---- noites e linha de base
  type NoiteRow = {
    noite: string; minutos: number; fc_repouso: number | null; vfc_noturna: number | null; janelas: number; temp_pele: number | null; janelas_temp: number;
    sono_inicio: string | null; sono_fim: string | null; fonte_sono: "samsung" | "batimento" | null;
    spo2_media: number | null; spo2_min: number | null;
  };
  const noites: Noite[] = ((noitesR.data ?? []) as NoiteRow[]).map((n) => ({
    noite: n.noite, minutos: n.minutos, fcRepouso: n.fc_repouso != null ? Math.round(n.fc_repouso * 10) / 10 : null,
    vfc: n.vfc_noturna != null ? Math.round(n.vfc_noturna) : null, janelas: n.janelas,
    temp: n.temp_pele != null ? Math.round(n.temp_pele * 100) / 100 : null, janelasTemp: n.janelas_temp,
    sonoInicio: n.sono_inicio, sonoFim: n.sono_fim, fonteSono: n.fonte_sono,
    spo2: n.spo2_media, spo2Min: n.spo2_min,
  }));
  const noitesValidas = noites.filter((n) => n.fcRepouso != null);
  const ultimaNoite = noitesValidas.at(-1) ?? null;
  // ---- Radar de Saúde (radar-v1)
  type RadarRow = {
    noite: string; fc: number | null; fc_normal: number | null; fc_fora: boolean; vfc: number | null; vfc_normal: number | null; vfc_fora: boolean;
    temp: number | null; temp_normal: number | null; temp_fora: boolean; sinais: number; base: number; doente: boolean; nivel: NivelRadar;
    spo2: number | null; spo2_normal: number | null; spo2_fora: boolean | null;
  };
  const radar: RadarNoite[] = ((radarR.data ?? []) as RadarRow[]).map((r) => ({
    noite: r.noite, fc: r.fc, fcNormal: r.fc_normal, fcFora: r.fc_fora, vfc: r.vfc, vfcNormal: r.vfc_normal, vfcFora: r.vfc_fora,
    temp: r.temp, tempNormal: r.temp_normal, tempFora: r.temp_fora, sinais: r.sinais, base: r.base, doente: r.doente, nivel: r.nivel,
    spo2: r.spo2 ?? null, spo2Normal: r.spo2_normal ?? null, spo2Fora: !!r.spo2_fora,
  }));
  const radarHoje = radar[0]?.noite === hoje ? radar[0] : undefined;
  const desvioFc = desvioDe(radar[0], "fc", "fcNormal");
  const desvioVfc = desvioDe(radar[0], "vfc", "vfcNormal");
  const desvioTemp = desvioDe(radar[0], "temp", "tempNormal");

  // ---- eventos do diário
  type EventoRow = EventoDiario & { descartado: boolean };
  const eventosTodos = (eventosR.data ?? []) as EventoRow[];
  const eventos: EventoDiario[] = eventosTodos
    .filter((e) => !e.descartado)
    .map((e) => ({ id: e.id, tipo: e.tipo, inicio: e.inicio, fim: e.fim, detalhes: e.detalhes ?? {}, nota: e.nota, origem: e.origem }));

  // ---- placar do radar: avisou antes dos dias "fiquei doente"? quantos avisos não deram em nada?
  const diasDoente = eventos.filter((e) => e.tipo === "doenca").map((e) => diaLocal(e.inicio, tz));
  const somaDias = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const estresse = radar.filter((r) => r.nivel === "estresse").map((r) => r.noite);
  const placar: PlacarRadar = {
    episodios: diasDoente.length,
    avisadosAntes: diasDoente.filter((d) => estresse.some((n) => n >= somaDias(d, -3) && n <= d)).length,
    avisos: estresse.length,
    avisosSemNada: estresse.filter((n) => n <= somaDias(hoje, -5) && !diasDoente.some((d) => d >= n && d <= somaDias(n, 5))).length,
  };

  // ---- Samsung Health (app do celular)
  type SamsungRow = { tipo: string; inicio: string; fim: string | null; dados: Record<string, unknown> };
  const sRows = (samsungR.data ?? []) as SamsungRow[];
  const raros = (raroR.data ?? []) as SamsungRow[];
  const nRow = (o: Record<string, unknown>, k: string) => (typeof o[k] === "number" ? (o[k] as number) : null);
  const sonoRow = sRows.find((r) => r.tipo === "sono" && r.fim);
  const sonoSamsung: SonoSamsung | null = sonoRow ? (() => {
    const em = (sonoRow.dados.estagios_min ?? {}) as Record<string, number>;
    return {
      inicio: sonoRow.inicio, fim: sonoRow.fim!, duracaoMin: nRow(sonoRow.dados, "duracao_min"), nota: nRow(sonoRow.dados, "nota"),
      estagiosMin: { acordado: em.acordado ?? 0, leve: em.leve ?? 0, profundo: em.profundo ?? 0, rem: em.rem ?? 0 },
      estagios: (Array.isArray(sonoRow.dados.estagios) ? sonoRow.dados.estagios : []) as SonoSamsung["estagios"],
    };
  })() : null;
  const spoNoite = sonoSamsung
    ? sRows.filter((r) => r.tipo === "spo2" && ms(r.inicio) >= ms(sonoSamsung.inicio) - 3600_000 && ms(r.inicio) <= ms(sonoSamsung.fim))
    : [];
  const peleNoite = sonoSamsung
    ? sRows.filter((r) => r.tipo === "temp_pele" && ms(r.inicio) >= ms(sonoSamsung.inicio) - 3600_000 && ms(r.inicio) <= ms(sonoSamsung.fim))
    : [];
  const energiaRow = sRows.find((r) => r.tipo === "energia" && nRow(r.dados, "score") != null);
  const modalidadeSamsung = (tipo: string): string | null => {
    if (/SWIMMING/.test(tipo)) return "Natação";
    if (/WEIGHT|BENCH|SQUAT|DEADLIFT|LUNGE|LEG_|LAT_|SHOULDER|ARM_|RAISES|CIRCUIT|PULL_UPS|PUSH_UPS|CRUNCH|PLANK/.test(tipo)) return "Musculação";
    return null; // artes marciais: judô ou jiu-jitsu, quem decide é você
  };
  const exerciciosSamsung: ExercicioSamsung[] = sRows.filter((r) => r.tipo === "exercicio" && r.fim).map((r) => ({
    inicio: r.inicio, fim: r.fim!, tipo: String(r.dados.tipo_samsung ?? "OTHER"), modalidade: modalidadeSamsung(String(r.dados.tipo_samsung ?? "")),
    auto: typeof r.dados.auto === "boolean" ? r.dados.auto : null, fcMedia: nRow(r.dados, "fc_media"), fcMax: nRow(r.dados, "fc_max"),
    calorias: nRow(r.dados, "calorias"),
  }));
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const samsung: Samsung = {
    sono: sonoSamsung,
    spo2: spoNoite.length ? {
      media: media(spoNoite.map((r) => nRow(r.dados, "media")).filter((x): x is number => x != null)),
      min: Math.min(...spoNoite.map((r) => nRow(r.dados, "min") ?? 100)),
    } : null,
    pele: media(peleNoite.map((r) => nRow(r.dados, "media")).filter((x): x is number => x != null)),
    // o Energy Score é de um DIA (vem como meia-noite UTC): converter para o fuso jogava a data para a véspera
    energia: energiaRow ? { dia: energiaRow.inicio.slice(0, 10), score: nRow(energiaRow.dados, "score")! } : null,
    passos: (() => {
      const dias = sRows.filter((r) => r.tipo === "passos" && nRow(r.dados, "total") != null)
        .map((r) => ({ dia: typeof r.dados.dia === "string" ? r.dados.dia : diaLocal(r.inicio, tz), total: nRow(r.dados, "total")! }))
        .sort((a, b) => a.dia.localeCompare(b.dia));
      if (!dias.length) return null;
      const anteriores = dias.filter((d) => d.dia < hoje).slice(-7);
      return {
        hoje: dias.find((d) => d.dia === hoje)?.total ?? null,
        media7: anteriores.length ? Math.round(anteriores.reduce((s, d) => s + d.total, 0) / anteriores.length) : null,
        dias: dias.slice(-14),
      };
    })(),
    corpo: (() => {
      const lista = raros.filter((r) => r.tipo === "corpo").map((r) => ({
        ts: r.inicio, peso: nRow(r.dados, "peso"), gorduraPct: nRow(r.dados, "gordura_pct"), musculoKg: nRow(r.dados, "musculo_esq_kg"),
        aguaKg: nRow(r.dados, "agua_kg"), imc: nRow(r.dados, "imc"), tmb: nRow(r.dados, "tmb"),
      }));
      return lista[0] ? { ...lista[0], anterior: lista[1] ?? null } : null;
    })(),
    ritmoIrregular: (() => {
      const l = raros.filter((r) => r.tipo === "ritmo_irregular" && r.dados.status === "DETECTED");
      return { total: l.length, ultimo: l[0]?.inicio ?? null };
    })(),
    apneia: (() => {
      const a = raros.find((r) => r.tipo === "apneia");
      return a ? { sinal: String(a.dados.sinal ?? "UNDEFINED"), ts: a.inicio } : null;
    })(),
    vo2max: (() => {
      const x = sRows.find((r) => r.tipo === "exercicio" && nRow(r.dados, "vo2max") != null);
      return x ? { valor: nRow(x.dados, "vo2max")!, ts: x.inicio } : null;
    })(),
    exercicios: exerciciosSamsung.slice(0, 8),
    conectado: dispositivos.length > 1 || sRows.length > 0,
  };

  // ---- treinos: detectados (SQL) + confirmados/descartados (diário)
  // Um bloco detectado some da lista de sugestões quando QUALQUER treino do diário (confirmado ou
  // descartado) se sobrepõe a ele — assim um bloco pode virar dois treinos (ex.: musculação + natação).
  // Cada treino confirmado mostra os números do SEU intervalo (saude_resumo_intervalos).
  type TreinoRow = { inicio: string; fim: string; minutos: number; fc_media: number; fc_max: number; z_leve: number; z_moderado: number; z_intenso: number; z_maximo: number; carga: number };
  const treinosEv = eventosTodos.filter((e) => e.tipo === "treino");
  const historicoModalidades = treinosEv
    .filter((e) => !e.descartado && typeof e.detalhes?.modalidade === "string" && e.detalhes.modalidade !== "Outro")
    .map((e) => ({ inicio: e.inicio, modalidade: e.detalhes.modalidade as string }));
  const treinos: Treino[] = [];
  for (const t of (treinosR.data ?? []) as TreinoRow[]) {
    if (treinosEv.some((e) => sobrepoe(e.inicio, e.fim ?? e.inicio, t.inicio, t.fim))) continue;
    treinos.push({
      chave: t.inicio, eventoId: null, inicio: t.inicio, fim: t.fim, minutos: t.minutos,
      fcMedia: Math.round(t.fc_media), fcMax: t.fc_max,
      zonas: { leve: t.z_leve, moderado: t.z_moderado, intenso: t.z_intenso, maximo: t.z_maximo }, carga: t.carga,
      status: "sugerido", modalidade: null, esforco: null,
      palpite: exerciciosSamsung.find((x) => x.modalidade && sobrepoe(x.inicio, x.fim, t.inicio, t.fim))?.modalidade
        ?? palpiteModalidade(t.inicio, historicoModalidades, tz),
      origem: null, recuperacao: null, calorias: null,
    });
  }
  const confirmados = treinosEv.filter((e) => !e.descartado && agora - ms(e.inicio) < 15 * 86_400_000);
  type ResumoRow = { idx: number; minutos: number; fc_media: number | null; fc_max: number | null; z_leve: number; z_moderado: number; z_intenso: number; z_maximo: number; carga: number };
  const resumos = confirmados.length
    ? (((await supabase.rpc("saude_resumo_intervalos", {
        p_workspace_id: workspaceId,
        p_inicios: confirmados.map((e) => e.inicio),
        p_fins: confirmados.map((e) => e.fim ?? e.inicio),
      })).data ?? []) as ResumoRow[])
    : [];
  // recuperacao-v1: queda do batimento depois do fim. Só vale quando nada começa logo depois
  // (outro treino em < 10 min) e fora d'água (na natação o sensor erra muito).
  type RecRow = { idx: number; fc_fim: number | null; fc_1: number | null; fc_2: number | null };
  const recs = confirmados.length
    ? (((await supabase.rpc("saude_recuperacao", { p_workspace_id: workspaceId, p_fins: confirmados.map((e) => e.fim ?? e.inicio) })).data ?? []) as RecRow[])
    : [];
  confirmados.forEach((ev, i) => {
    const r = resumos.find((x) => x.idx === i + 1);
    const fim = ev.fim ?? ev.inicio;
    const medido = r && r.minutos >= 3;
    const rc = recs.find((x) => x.idx === i + 1);
    const emSeguida = treinosEv.some((o) => o.id !== ev.id && !o.descartado && ms(o.inicio) >= ms(fim) - 60_000 && ms(o.inicio) - ms(fim) < 10 * 60_000);
    const recuperacao = rc && rc.fc_fim != null && rc.fc_fim >= 100 && rc.fc_1 != null && rc.fc_1 <= rc.fc_fim && !emSeguida
      && ev.detalhes?.modalidade !== "Natação"
      ? { fcFim: Math.round(rc.fc_fim), queda1: Math.round(rc.fc_fim - rc.fc_1), queda2: rc.fc_2 != null ? Math.round(rc.fc_fim - rc.fc_2) : null }
      : null;
    treinos.push({
      chave: ev.id, eventoId: ev.id, inicio: ev.inicio, fim,
      minutos: Math.round((ms(fim) - ms(ev.inicio)) / 60_000),
      fcMedia: medido && r.fc_media != null ? Math.round(r.fc_media) : null, fcMax: medido ? r.fc_max : null,
      zonas: medido ? { leve: r.z_leve, moderado: r.z_moderado, intenso: r.z_intenso, maximo: r.z_maximo } : null,
      carga: medido ? r.carga : null, status: "confirmado",
      modalidade: (ev.detalhes?.modalidade as string | undefined) ?? null,
      esforco: typeof ev.detalhes?.esforco === "number" ? (ev.detalhes.esforco as number) : null,
      palpite: null,
      origem: ev.origem, recuperacao,
      calorias: typeof ev.detalhes?.calorias === "number" ? Math.round(ev.detalhes.calorias as number) : null,
    });
  });
  treinos.sort((a, b) => b.inicio.localeCompare(a.inicio));
  const somaCarga = (de: number, ate: number) =>
    treinos.filter((t) => { const x = new Date(t.inicio).getTime(); return x >= de && x < ate; }).reduce((s, t) => s + (t.carga ?? 0), 0);
  const carga7d = somaCarga(agora - 7 * 86_400_000, agora + 1);
  const carga7dAnterior = somaCarga(agora - 14 * 86_400_000, agora - 7 * 86_400_000);

  // ---- registros e mal-estar (relógio + site), com batimento de 10 min antes a 10 min depois
  const registros: RegistroSaude[] = (regs.data ?? []).map((r) => ({ id: r.id, ts: r.ts, tipo: r.tipo, valor: r.valor }));
  const desde30d = agora - 30 * 86_400_000;
  const brutos: Omit<MalEstar, "serie">[] = [
    ...registros.filter((r) => r.tipo === "malestar" && new Date(r.ts).getTime() >= desde30d)
      .map((r) => ({ id: r.id, ts: r.ts, situacao: r.valor || null, sintomas: [], nota: null, fonte: "relogio" as const })),
    ...eventos.filter((e) => e.tipo === "malestar" && new Date(e.inicio).getTime() >= desde30d)
      .map((e) => ({
        id: e.id, ts: e.inicio, situacao: (e.detalhes?.situacao as string | undefined) ?? null,
        sintomas: Array.isArray(e.detalhes?.sintomas) ? (e.detalhes.sintomas as string[]) : [], nota: e.nota, fonte: "site" as const,
      })),
  ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 6);
  const malEstares: MalEstar[] = await Promise.all(
    brutos.map(async (m) => {
      const t = new Date(m.ts).getTime();
      const { data } = await supabase
        .from("saude_bpm_minuto")
        .select("minuto, bpm_medio, bpm_min, bpm_max")
        .eq("workspace_id", workspaceId)
        .gte("minuto", new Date(t - 10 * 60_000).toISOString())
        .lte("minuto", new Date(t + 10 * 60_000).toISOString())
        .order("minuto", { ascending: true });
      return { ...m, serie: (data ?? []).map((b) => ({ minuto: b.minuto, bpm: Math.round(b.bpm_medio), min: b.bpm_min, max: b.bpm_max })) };
    }),
  );

  // ---- linha do tempo do relógio (relogio-v1): carregando / fora do pulso / sem leitura
  type EstadoRow = { ts: string; tipo: string; bateria: number | null };
  const estados = (estadosR.data ?? []) as EstadoRow[];
  const agoraIso = new Date(agora).toISOString();
  const trechos: TrechoRelogio[] = [];
  const abrir = (tipo: "carregando" | "fora_do_pulso", fecha: string) => {
    let aberto: EstadoRow | null = null;
    for (const e of estados) {
      if (e.tipo === tipo && !aberto) aberto = e;
      else if (e.tipo === fecha && aberto) {
        trechos.push({ tipo, inicio: aberto.ts, fim: e.ts, bateriaInicio: aberto.bateria, bateriaFim: e.bateria, emAndamento: false });
        aberto = null;
      }
    }
    if (aberto) {
      const ainda = tipo === "carregando" ? dispositivos[0]?.carregando !== false : dispositivos[0]?.noPulso === false;
      if (ainda) trechos.push({ tipo, inicio: aberto.ts, fim: agoraIso, bateriaInicio: aberto.bateria, bateriaFim: dispositivos[0]?.bateria ?? null, emAndamento: true });
    }
  };
  abrir("carregando", "desconectado");
  abrir("fora_do_pulso", "no_pulso");
  // lacunas do batimento (> 10 min) que nenhum estado explica = "sem leitura" (relógio frouxo, app parado…)
  const explicado = (a: number, b: number) => trechos.some((t) => ms(t.inicio) - 5 * 60_000 <= a && ms(t.fim) + 5 * 60_000 >= b);
  for (let i = 1; i < bpm24h.length; i++) {
    const a = ms(bpm24h[i - 1]!.minuto) + 60_000;
    const b = ms(bpm24h[i]!.minuto);
    if (b - a >= 10 * 60_000 && !explicado(a, b)) {
      trechos.push({ tipo: "sem_leitura", inicio: new Date(a).toISOString(), fim: new Date(b).toISOString(), bateriaInicio: null, bateriaFim: null, emAndamento: false });
    }
  }
  const desde24 = agora - 24 * 3600_000;
  const linhaDoTempo = trechos.filter((t) => ms(t.fim) > desde24).sort((x, y) => x.inicio.localeCompare(y.inicio));
  const minutosEm = (tipo: TrechoRelogio["tipo"]) => Math.round(linhaDoTempo.filter((t) => t.tipo === tipo)
    .reduce((acc, t) => acc + (Math.min(ms(t.fim), agora) - Math.max(ms(t.inicio), desde24)), 0) / 60_000);

  // ---- bateria (bateria-v1): gasto por hora no pulso, autonomia e quanto carregar por dia
  const pontosBat = estados.filter((e) => e.bateria != null).map((e) => ({ ts: e.ts, bateria: e.bateria! }));
  const carregandoEm = (t: number) => trechos.some((x) => x.tipo === "carregando" && ms(x.inicio) <= t && ms(x.fim) >= t);
  const taxas: number[] = [];
  for (let i = 1; i < pontosBat.length; i++) {
    const p0 = pontosBat[i - 1]!, p1 = pontosBat[i]!;
    const h = (ms(p1.ts) - ms(p0.ts)) / 3600_000;
    if (h < 0.3 || h > 6 || carregandoEm(ms(p0.ts)) || carregandoEm(ms(p1.ts)) || p1.bateria > p0.bateria) continue;
    taxas.push((p0.bateria - p1.bateria) / h);
  }
  const consumoHora = taxas.length >= 3 ? [...taxas].sort((x, y) => x - y)[Math.floor(taxas.length / 2)]! : null;
  const cargas = trechos.filter((t) => t.tipo === "carregando" && !t.emAndamento && t.bateriaInicio != null && t.bateriaFim != null)
    .sort((x, y) => x.inicio.localeCompare(y.inicio));
  const ultimaCarga = trechos.filter((t) => t.tipo === "carregando").sort((x, y) => x.inicio.localeCompare(y.inicio)).at(-1) ?? null;
  const velocidades = cargas.map((t) => (t.bateriaFim! - t.bateriaInicio!) / Math.max(1, (ms(t.fim) - ms(t.inicio)) / 60_000)).filter((v) => v > 0);
  const pctPorMin = velocidades.length ? velocidades.reduce((x, y) => x + y, 0) / velocidades.length : null;
  const bateria: Bateria = {
    atual: dispositivos[0]?.bateria ?? null,
    carregando: dispositivos[0]?.carregando ?? null,
    consumoHora: consumoHora != null ? Math.round(consumoHora * 10) / 10 : null,
    autonomiaHoras: consumoHora ? Math.round(100 / consumoHora) : null,
    ultimaCarga,
    minutosCargaPorDia: consumoHora && pctPorMin ? Math.round((consumoHora * 24) / pctPorMin) : null,
    pontos: pontosBat.filter((p) => ms(p.ts) > desde24),
  };

  // ---- qualidade dos dados
  const ultimoEnvio = dispositivos.map((d) => d.ultimoEnvioEm).filter(Boolean).sort().at(-1) ?? null;
  const qualidade: Qualidade = {
    minutos24h: bpm24h.length,
    semMedir: { carregando: minutosEm("carregando"), foraDoPulso: minutosEm("fora_do_pulso"), semExplicacao: minutosEm("sem_leitura") },
    cobertura24h: Math.min(1, bpm24h.length / 1440),
    janelasVfc24h: vfc24.count ?? 0,
    atrasoMin: ultimoEnvio ? Math.round((agora - new Date(ultimoEnvio).getTime()) / 60_000) : null,
  };

  // ---- insights-v1: frases curtas, honestas, sem diagnóstico; nunca suprimem um desvio
  const insights: Insight[] = [];
  const rel = dispositivos[0];
  // celular parado: sem ele, sono, SpO₂ e treinos do Samsung Health não chegam
  const celular = dispositivos.find((d) => d.diagnostico || /celular/i.test(d.nome));
  if (celular) {
    const horasSem = celular.ultimoEnvioEm ? (agora - ms(celular.ultimoEnvioEm)) / 3600_000 : null;
    const g = celular.diagnostico;
    if (horasSem == null || horasSem > 6 || g?.erro) {
      insights.push({
        id: "celular", tom: "atencao",
        titulo: horasSem != null && horasSem > 6 ? `Celular sem sincronizar há ${Math.round(horasSem)} h` : "Celular com problema na sincronização",
        texto: [
          g?.erro ? `Último erro: ${g.erro}.` : null,
          g?.otimizacaoBateria ? "A One UI está pausando o app — no Saúde NT, Ajustes › Rodar sozinho › Liberar." : "Abra o app Saúde NT no celular: ele sincroniza ao abrir.",
        ].filter(Boolean).join(" "),
      });
    }
  }
  // no pulso, fora do carregador, mas sem batimento há > 15 min: o sensor da Samsung parou de entregar dados
  if (rel && rel.noPulso === true && !rel.carregando && rel.ultimaLeituraEm && agora - ms(rel.ultimaLeituraEm) > 15 * 60_000) {
    insights.push({
      id: "sem-medir", tom: "atencao",
      titulo: `Relógio no pulso, mas sem medir desde ${horaLocal(rel.ultimaLeituraEm, tz)}`,
      texto: (rel.versao && rel.versao >= "0.9.1"
        ? "O app tenta religar o sensor sozinho a cada 10 min. "
        : "Abra o Saúde NT no relógio para religar o sensor (a versão 0.9.1 faz isso sozinha). ") +
        "Se a economia de energia do relógio estiver ligada, ela pode bloquear a medição contínua.",
    });
  }
  if (rel && rel.noPulso === false) {
    const desde = rel.ultimaLeituraEm ?? ultimo?.minuto ?? null;
    insights.push({
      id: "fora-do-pulso", tom: "neutro",
      titulo: rel.carregando ? "Relógio no carregador" : "Relógio fora do pulso",
      texto: (desde ? `Sem leitura desde ${horaLocal(desde, tz)}. ` : "") +
        "Para medir sua noite, durma com ele — carregar no banho ou no café da manhã costuma bastar para o dia todo.",
    });
  }
  for (const t of treinos.filter((x) => x.status === "sugerido").slice(0, 2)) {
    insights.push({
      id: `treino-${t.chave}`, tom: "acao",
      titulo: `Treino detectado ${diaLocal(t.inicio, tz) === hoje ? "hoje" : diaLocal(t.inicio, tz).split("-").reverse().slice(0, 2).join("/")}, ${horaLocal(t.inicio, tz)}–${horaLocal(t.fim, tz)}`,
      texto: `${t.minutos} min · média ${t.fcMedia} · pico ${t.fcMax} bpm. ` +
        (t.palpite ? `Pelo seu padrão, parece ${t.palpite.toLowerCase()} — confirme logo abaixo.` : "Confirme a modalidade e o esforço logo abaixo."),
    });
  }
  const influencias = (() => {
    if (!ultimaNoite) return [];
    const fimNoite = new Date(`${ultimaNoite.noite}T08:00:00-03:00`).getTime();
    const ini = fimNoite - 34 * 3600_000; // da manhã do dia anterior até o fim da noite
    const lista = new Set<string>();
    for (const t of treinos) {
      const x = new Date(t.inicio).getTime();
      if (x >= ini && x < fimNoite) lista.add(`treino${t.modalidade ? ` de ${t.modalidade.toLowerCase()}` : ""} (${horaLocal(t.inicio, tz)})`);
    }
    for (const e of eventos) {
      const x = new Date(e.inicio).getTime();
      if (e.tipo !== "treino" && x >= ini && x < fimNoite) lista.add(ROTULO_EVENTO[e.tipo] ?? e.tipo);
    }
    return [...lista];
  })();
  // insights-v2: o Radar decide o nível; o texto mostra o que saiu do normal e as causas possíveis (nunca as descarta)
  if (radarHoje && radarHoje.nivel !== "calibrando") {
    const fora = [
      radarHoje.fcFora && desvioFc ? `repouso +${desvioFc.delta.toFixed(0)} bpm` : null,
      radarHoje.vfcFora && desvioVfc ? `VFC ${desvioVfc.deltaPct.toFixed(0)}%` : null,
      radarHoje.tempFora && desvioTemp ? `pele +${desvioTemp.delta.toFixed(1).replace(".", ",")} °C` : null,
      radarHoje.spo2Fora && radarHoje.spo2 != null && radarHoje.spo2Normal != null ? `SpO₂ ${Math.round(radarHoje.spo2 - radarHoje.spo2Normal)} pts` : null,
    ].filter(Boolean).join(", ");
    if (radarHoje.nivel === "estresse") {
      insights.push({
        id: "radar-estresse", tom: "atencao", titulo: "Radar: corpo sob estresse",
        texto: `Fora do seu normal: ${fora}. Treino forte, pouco sono, álcool, estresse ou o começo de uma infecção podem fazer isso. Um dia mais leve e atenção a sintomas nas próximas 48 h.`,
        influencias,
      });
    } else if (radarHoje.nivel === "observar") {
      insights.push({
        id: "radar-observar", tom: "neutro", titulo: `Radar: ${radarHoje.sinais === 1 ? "1 sinal" : `${radarHoje.sinais} sinais`} fora do normal esta noite`,
        texto: `Fora do normal: ${fora}. Uma noite só costuma dizer pouco — o radar fica atento à próxima.`,
        influencias,
      });
    } else {
      insights.push({ id: "radar-normal", tom: "bom", titulo: "Radar: noite dentro do seu normal", texto: "Repouso, VFC, temperatura da pele e SpO₂ dentro da sua faixa." });
    }
  }
  const noiteHoje = noites.at(-1);
  if (noiteHoje?.noite === hoje && noiteHoje.sonoInicio && noiteHoje.sonoFim) {
    const h = (ms(noiteHoje.sonoFim) - ms(noiteHoje.sonoInicio)) / 3600_000;
    if (h < 6) {
      insights.push({
        id: "sono-curto", tom: "neutro", titulo: `Noite curta: ~${Math.floor(h)} h ${Math.round((h % 1) * 60)} min de sono${noiteHoje.fonteSono === "samsung" ? "" : " estimado"}`,
        texto: `${noiteHoje.fonteSono === "samsung" ? "Pelo Samsung Health" : "Pelo batimento"}, você adormeceu por volta de ${horaLocal(noiteHoje.sonoInicio, tz)} e levantou ${horaLocal(noiteHoje.sonoFim, tz)}. Noites curtas mexem no repouso e na VFC do dia seguinte.`,
      });
    }
  }
  if (noitesValidas.length < NOITES_BASE) {
    insights.push({
      id: "calibrando", tom: "neutro",
      titulo: `Conhecendo o seu normal: ${noitesValidas.length}/${NOITES_BASE} noites`,
      texto: noitesValidas.length < NOITES_MIN_COMPARAR
        ? `As comparações com o seu normal começam com ${NOITES_MIN_COMPARAR} noites medidas (≥ 3 h com o relógio). Até lá, os números aparecem sem julgamento.`
        : "Já dá para comparar, mas a linha de base ainda está se firmando — trate os desvios como observação.",
    });
  }
  if (malEstares[0] && agora - new Date(malEstares[0].ts).getTime() < 7 * 86_400_000) {
    insights.push({
      id: "malestar", tom: "atencao", titulo: `Mal-estar registrado ${diaLocal(malEstares[0].ts, tz) === hoje ? "hoje" : "nesta semana"} às ${horaLocal(malEstares[0].ts, tz)}`,
      texto: "O batimento de 10 min antes a 10 min depois está no diário, pronto para mostrar ao médico.",
    });
  }

  return {
    dispositivos, bpm24h, ultimoBpm: ultimo ? { bpm: ultimo.bpm, minuto: ultimo.minuto } : null, faixaHoje,
    noites, ultimaNoite, noitesBase: noitesValidas.length, desvioFc, desvioVfc, desvioTemp, radar, placar,
    treinos, carga7d, carga7dAnterior, eventos, registros, malEstares,
    ecgs: (ecgs.data ?? []).map((e) => ({ id: e.id, ts: e.ts, duracaoS: e.duracao_s, hz: e.hz })),
    qualidade, insights, linhaDoTempo, bateria, samsung,
    prontidao: (() => {
      const x = prontR.data as Record<string, unknown> | null;
      if (!x || typeof x !== "object") return null;
      const c = (x.carga ?? {}) as Record<string, number | null>;
      const s = (x.sono ?? {}) as Record<string, string | number | null>;
      return {
        score: typeof x.score === "number" ? x.score : null,
        nivel: (x.nivel as Prontidao["nivel"]) ?? null,
        calibrando: !!x.calibrando,
        fatores: Array.isArray(x.fatores) ? (x.fatores as Prontidao["fatores"]) : [],
        carga: { aguda: Number(c.aguda ?? 0), cronicaSemana: c.cronica_semana ?? null, razao: c.razao ?? null },
        sono: {
          horas: typeof s.horas === "number" ? s.horas : null, fonte: (s.fonte as string) ?? null,
          acordar: (s.acordar as string) ?? null, deitar: (s.deitar as string) ?? null,
          regularidadeMin: typeof s.regularidade_min === "number" ? s.regularidade_min : null, noites: Number(s.noites ?? 0),
        },
      };
    })(),
    recuperacoes: treinos.filter((t) => t.recuperacao).map((t) => ({ ts: t.inicio, modalidade: t.modalidade, queda1: t.recuperacao!.queda1 }))
      .sort((a, b) => a.ts.localeCompare(b.ts)),
  };
}
