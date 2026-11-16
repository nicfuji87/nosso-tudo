import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Painel de Saúde (dados vindos do relógio via Edge Function `saude-relogio`).
 *
 * Tudo é lido com o client do USUÁRIO: as tabelas saude_* têm RLS por workspace
 * (policy p_ws_select), então o banco garante o isolamento, não este arquivo.
 * O PostgREST corta em 1000 linhas — por isso `paginar`.
 */

export const DIAS_BASE = 21;

export interface Dispositivo {
  id: string;
  nome: string;
  modelo: string | null;
  criadoEm: string;
  ultimoEnvioEm: string | null;
}

export interface PontoBpm { minuto: string; bpm: number; min: number; max: number }
export interface PontoVfcDia { dia: string; rmssd: number; janelas: number }
export interface RegistroSaude { id: string; ts: string; tipo: string; valor: string }
export interface EcgResumo { id: string; ts: string; duracaoS: number; hz: number }

export interface PainelSaude {
  dispositivos: Dispositivo[];
  bpm24h: PontoBpm[];
  ultimoBpm: { bpm: number; minuto: string } | null;
  faixaHoje: { min: number; max: number } | null;
  vfcHoje: number | null;
  janelasHoje: number;
  vfcDias: PontoVfcDia[];
  variacaoVs7d: number | null;
  diasBase: number;
  registros: RegistroSaude[];
  registrosHoje: number;
  ecgs: EcgResumo[];
}

/** Data local (YYYY-MM-DD) no fuso do workspace. */
export function diaLocal(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
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

export async function getPainelSaude(workspaceId: string, tz = "America/Sao_Paulo"): Promise<PainelSaude> {
  const supabase = createClient();
  const agora = Date.now();
  const hoje = diaLocal(new Date(agora).toISOString(), tz);
  const desde24h = new Date(agora - 24 * 3600_000).toISOString();
  const desde60d = new Date(agora - 60 * 86_400_000).toISOString();

  const [disp, bpm, vfc, regs, ecgs] = await Promise.all([
    supabase
      .from("saude_dispositivos")
      .select("id, nome, modelo, criado_em, ultimo_envio_em")
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
    paginar<{ inicio: string; rmssd_ms: number; cobertura: number }>((de, ate) =>
      supabase
        .from("saude_vfc_janelas")
        .select("inicio, rmssd_ms, cobertura")
        .eq("workspace_id", workspaceId)
        .gte("inicio", desde60d)
        .order("inicio", { ascending: true })
        .range(de, ate),
      20000,
    ),
    supabase
      .from("saude_registros")
      .select("id, ts, tipo, valor")
      .eq("workspace_id", workspaceId)
      .order("ts", { ascending: false })
      .limit(40),
    supabase
      .from("saude_ecgs")
      .select("id, ts, duracao_s, hz")
      .eq("workspace_id", workspaceId)
      .order("ts", { ascending: false })
      .limit(10),
  ]);

  // ---- batimento
  const bpm24h: PontoBpm[] = bpm.map((b) => ({ minuto: b.minuto, bpm: Math.round(b.bpm_medio), min: b.bpm_min, max: b.bpm_max }));
  const deHoje = bpm24h.filter((b) => diaLocal(b.minuto, tz) === hoje);
  const ultimo = bpm24h.at(-1);
  const faixaHoje = deHoje.length
    ? { min: Math.min(...deHoje.map((b) => b.min)), max: Math.max(...deHoje.map((b) => b.max)) }
    : null;

  // ---- VFC: mediana das janelas de cada dia
  const porDia = new Map<string, number[]>();
  for (const j of vfc) {
    const d = diaLocal(j.inicio, tz);
    (porDia.get(d) ?? porDia.set(d, []).get(d)!).push(j.rmssd_ms);
  }
  const vfcDias: PontoVfcDia[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, rmssd: Math.round(mediana(v)), janelas: v.length }));
  const vfcHojePt = vfcDias.find((d) => d.dia === hoje);
  const anteriores = vfcDias.filter((d) => d.dia < hoje);
  const ult7 = anteriores.slice(-7);
  const variacaoVs7d =
    vfcHojePt && ult7.length >= 3
      ? (vfcHojePt.rmssd / (ult7.reduce((s, d) => s + d.rmssd, 0) / ult7.length) - 1) * 100
      : null;

  const registros: RegistroSaude[] = (regs.data ?? []).map((r) => ({ id: r.id, ts: r.ts, tipo: r.tipo, valor: r.valor }));

  return {
    dispositivos: (disp.data ?? []).map((d) => ({
      id: d.id, nome: d.nome, modelo: d.modelo, criadoEm: d.criado_em, ultimoEnvioEm: d.ultimo_envio_em,
    })),
    bpm24h,
    ultimoBpm: ultimo ? { bpm: ultimo.bpm, minuto: ultimo.minuto } : null,
    faixaHoje,
    vfcHoje: vfcHojePt?.rmssd ?? null,
    janelasHoje: vfcHojePt?.janelas ?? 0,
    vfcDias: vfcDias.slice(-14),
    variacaoVs7d,
    diasBase: anteriores.length,
    registros,
    registrosHoje: registros.filter((r) => diaLocal(r.ts, tz) === hoje).length,
    ecgs: (ecgs.data ?? []).map((e) => ({ id: e.id, ts: e.ts, duracaoS: e.duracao_s, hz: e.hz })),
  };
}
