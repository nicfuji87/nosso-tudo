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
 *   noites-v2 (SQL) · treino-v1 (SQL) · base-v1 e insights-v1 (aqui)
 */

export const ALGORITMOS = { noites: "noites-v2", treino: "treino-v1", padrao: "padrao-v1", base: "base-v1", insights: "insights-v1" } as const;
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
}

export interface PontoBpm { minuto: string; bpm: number; min: number; max: number }
export interface RegistroSaude { id: string; ts: string; tipo: string; valor: string }
export interface EcgResumo { id: string; ts: string; duracaoS: number; hz: number }

export interface Noite { noite: string; minutos: number; fcRepouso: number | null; vfc: number | null; janelas: number }

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
  treinos: Treino[];
  carga7d: number;
  carga7dAnterior: number;
  eventos: EventoDiario[];
  registros: RegistroSaude[];
  malEstares: MalEstar[];
  ecgs: EcgResumo[];
  qualidade: Qualidade;
  insights: Insight[];
}

/** Data local (YYYY-MM-DD) no fuso do workspace. */
export function diaLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function horaLocal(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

const mediana = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  if (!s.length) return 0;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

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

/** base-v1: valor da última noite vs mediana das anteriores (até 28). */
function desvio(noites: Noite[], campo: "fcRepouso" | "vfc"): Desvio | null {
  const validas = noites.filter((n) => n[campo] != null);
  const ultima = validas.at(-1);
  const anteriores = validas.slice(0, -1).slice(-NOITES_BASE);
  if (!ultima || anteriores.length < NOITES_MIN_COMPARAR) return null;
  const normal = mediana(anteriores.map((n) => n[campo]!));
  const valor = ultima[campo]!;
  return { valor, normal, delta: valor - normal, deltaPct: normal ? (valor / normal - 1) * 100 : 0, noites: anteriores.length };
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

  const [disp, bpm, vfc24, regs, ecgs, noitesR, treinosR, eventosR] = await Promise.all([
    supabase
      .from("saude_dispositivos")
      .select("id, nome, modelo, criado_em, ultimo_envio_em, versao_app, bateria_pct, carregando, no_pulso, ultima_leitura_em, estado_em")
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
  ]);

  // ---- dispositivos
  const dispositivos: Dispositivo[] = (disp.data ?? []).map((d) => ({
    id: d.id, nome: d.nome, modelo: d.modelo, criadoEm: d.criado_em, ultimoEnvioEm: d.ultimo_envio_em,
    versao: d.versao_app, bateria: d.bateria_pct, carregando: d.carregando, noPulso: d.no_pulso,
    ultimaLeituraEm: d.ultima_leitura_em, estadoEm: d.estado_em,
  }));

  // ---- batimento 24 h
  const bpm24h: PontoBpm[] = bpm.map((b) => ({ minuto: b.minuto, bpm: Math.round(b.bpm_medio), min: b.bpm_min, max: b.bpm_max }));
  const deHoje = bpm24h.filter((b) => diaLocal(b.minuto, tz) === hoje);
  const ultimo = bpm24h.at(-1);
  const faixaHoje = deHoje.length ? { min: Math.min(...deHoje.map((b) => b.min)), max: Math.max(...deHoje.map((b) => b.max)) } : null;

  // ---- noites e linha de base
  type NoiteRow = { noite: string; minutos: number; fc_repouso: number | null; vfc_noturna: number | null; janelas: number };
  const noites: Noite[] = ((noitesR.data ?? []) as NoiteRow[]).map((n) => ({
    noite: n.noite, minutos: n.minutos, fcRepouso: n.fc_repouso != null ? Math.round(n.fc_repouso * 10) / 10 : null,
    vfc: n.vfc_noturna != null ? Math.round(n.vfc_noturna) : null, janelas: n.janelas,
  }));
  const noitesValidas = noites.filter((n) => n.fcRepouso != null);
  const ultimaNoite = noitesValidas.at(-1) ?? null;
  const desvioFc = desvio(noites, "fcRepouso");
  const desvioVfc = desvio(noites, "vfc");

  // ---- eventos do diário
  type EventoRow = EventoDiario & { descartado: boolean };
  const eventosTodos = (eventosR.data ?? []) as EventoRow[];
  const eventos: EventoDiario[] = eventosTodos
    .filter((e) => !e.descartado)
    .map((e) => ({ id: e.id, tipo: e.tipo, inicio: e.inicio, fim: e.fim, detalhes: e.detalhes ?? {}, nota: e.nota, origem: e.origem }));

  // ---- treinos: detectados (SQL) + confirmados/descartados (diário)
  type TreinoRow = { inicio: string; fim: string; minutos: number; fc_media: number; fc_max: number; z_leve: number; z_moderado: number; z_intenso: number; z_maximo: number; carga: number };
  const treinosEv = eventosTodos.filter((e) => e.tipo === "treino");
  const casa = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= 20 * 60_000;
  const usados = new Set<string>();
  const historicoModalidades = treinosEv
    .filter((e) => !e.descartado && typeof e.detalhes?.modalidade === "string" && e.detalhes.modalidade !== "Outro")
    .map((e) => ({ inicio: e.inicio, modalidade: e.detalhes.modalidade as string }));
  const treinos: Treino[] = [];
  for (const t of (treinosR.data ?? []) as TreinoRow[]) {
    const ev = treinosEv.find((e) => !usados.has(e.id) && casa(e.inicio, t.inicio));
    if (ev) usados.add(ev.id);
    if (ev?.descartado) continue;
    treinos.push({
      chave: t.inicio, eventoId: ev?.id ?? null, inicio: ev?.inicio ?? t.inicio, fim: ev?.fim ?? t.fim, minutos: t.minutos,
      fcMedia: Math.round(t.fc_media), fcMax: t.fc_max,
      zonas: { leve: t.z_leve, moderado: t.z_moderado, intenso: t.z_intenso, maximo: t.z_maximo }, carga: t.carga,
      status: ev ? "confirmado" : "sugerido",
      modalidade: (ev?.detalhes?.modalidade as string | undefined) ?? null,
      esforco: typeof ev?.detalhes?.esforco === "number" ? (ev.detalhes.esforco as number) : null,
      palpite: ev ? null : palpiteModalidade(t.inicio, historicoModalidades, tz),
    });
  }
  for (const ev of treinosEv) {
    if (usados.has(ev.id) || ev.descartado) continue; // treino lançado à mão, sem bloco de FC
    const fim = ev.fim ?? ev.inicio;
    treinos.push({
      chave: ev.id, eventoId: ev.id, inicio: ev.inicio, fim, minutos: Math.round((new Date(fim).getTime() - new Date(ev.inicio).getTime()) / 60_000),
      fcMedia: null, fcMax: null, zonas: null, carga: null, status: "confirmado",
      modalidade: (ev.detalhes?.modalidade as string | undefined) ?? null,
      esforco: typeof ev.detalhes?.esforco === "number" ? (ev.detalhes.esforco as number) : null,
      palpite: null,
    });
  }
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

  // ---- qualidade dos dados
  const ultimoEnvio = dispositivos.map((d) => d.ultimoEnvioEm).filter(Boolean).sort().at(-1) ?? null;
  const qualidade: Qualidade = {
    minutos24h: bpm24h.length,
    cobertura24h: Math.min(1, bpm24h.length / 1440),
    janelasVfc24h: vfc24.count ?? 0,
    atrasoMin: ultimoEnvio ? Math.round((agora - new Date(ultimoEnvio).getTime()) / 60_000) : null,
  };

  // ---- insights-v1: frases curtas, honestas, sem diagnóstico; nunca suprimem um desvio
  const insights: Insight[] = [];
  const rel = dispositivos[0];
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
  if (desvioFc && desvioFc.delta >= 3) {
    insights.push({
      id: "fc-repouso-alta", tom: "atencao",
      titulo: `FC de repouso ${desvioFc.delta.toFixed(0)} bpm acima do seu normal`,
      texto: `Noite: ${desvioFc.valor.toFixed(0)} bpm · seu normal: ${desvioFc.normal.toFixed(0)} (${desvioFc.noites} noites). ` +
        "Treino intenso, pouco sono, álcool, estresse ou o começo de uma alteração de saúde podem fazer isso. Vale observar as próximas noites.",
      influencias,
    });
  } else if (desvioFc && desvioFc.delta <= -2) {
    insights.push({ id: "fc-repouso-baixa", tom: "bom", titulo: `FC de repouso ${Math.abs(desvioFc.delta).toFixed(0)} bpm abaixo do seu normal`, texto: "Noite tranquila para o coração." });
  }
  if (desvioVfc && desvioVfc.deltaPct <= -20) {
    insights.push({
      id: "vfc-baixa", tom: "atencao",
      titulo: `VFC noturna ${Math.abs(desvioVfc.deltaPct).toFixed(0)}% abaixo do seu normal`,
      texto: `Noite: ${desvioVfc.valor} ms · seu normal: ${desvioVfc.normal.toFixed(0)} ms. Corpo mais exigido que o habitual; um dia mais leve ajuda a recuperar.`,
      influencias,
    });
  } else if (desvioVfc && desvioVfc.deltaPct >= 15) {
    insights.push({ id: "vfc-alta", tom: "bom", titulo: `VFC noturna ${desvioVfc.deltaPct.toFixed(0)}% acima do seu normal`, texto: "Sinal de boa recuperação." });
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
    noites, ultimaNoite, noitesBase: noitesValidas.length, desvioFc, desvioVfc,
    treinos, carga7d, carga7dAnterior, eventos, registros, malEstares,
    ecgs: (ecgs.data ?? []).map((e) => ({ id: e.id, ts: e.ts, duracaoS: e.duracao_s, hz: e.hz })),
    qualidade, insights,
  };
}
