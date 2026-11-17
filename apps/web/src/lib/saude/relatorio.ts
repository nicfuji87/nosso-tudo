import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PontoBpm } from "@/lib/saude/dados";

/**
 * Relatório para o médico (últimos N dias): noites, mal-estares com batimento ±10 min,
 * testes ortostáticos, ECGs com traçado, treinos e diário. Leitura com o client do usuário (RLS).
 */

export interface NoiteRel { noite: string; sonoInicio: string | null; sonoFim: string | null; fcRepouso: number | null; vfc: number | null; temp: number | null }
export interface MalEstarRel { id: string; ts: string; fonte: "relógio" | "site"; situacao: string | null; sintomas: string[]; nota: string | null; serie: PontoBpm[] }
export interface OrtoRel { ts: string; deitado: number | null; pico: number | null; m1: number | null; m3: number | null; sintomas: boolean }
export interface EcgRel { id: string; ts: string; duracaoS: number; hz: number; amostras: number[] }
export interface TreinoRel { inicio: string; fim: string; modalidade: string; esforco: number | null; fcMedia: number | null; fcMax: number | null }
export interface DiarioRel { ts: string; tipo: string; descricao: string }

export interface RelatorioSaude {
  dias: number;
  geradoEm: string;
  noites: NoiteRel[];
  malEstares: MalEstarRel[];
  ortostaticos: OrtoRel[];
  ecgs: EcgRel[];
  treinos: TreinoRel[];
  diario: DiarioRel[];
  relogio: { nome: string; versao: string | null } | null;
}

const ROTULO: Record<string, string> = {
  sintoma: "Sintoma", medicamento: "Medicamento", alcool: "Álcool", cafeina: "Cafeína", doenca: "Doença",
  estresse: "Estresse", sono: "Sono ruim", nota: "Nota", malestar: "Mal-estar",
};

export async function getRelatorioSaude(workspaceId: string, dias = 30, tz = "America/Sao_Paulo"): Promise<RelatorioSaude> {
  const supabase = createClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [disp, noitesR, eventosR, regsR, ecgsR] = await Promise.all([
    supabase.from("saude_dispositivos").select("nome, versao_app").eq("workspace_id", workspaceId).is("revogado_em", null).limit(1),
    supabase.rpc("saude_noites", { p_workspace_id: workspaceId, p_dias: dias, p_tz: tz }),
    supabase.from("saude_eventos").select("id, tipo, inicio, fim, detalhes, nota, descartado").eq("workspace_id", workspaceId)
      .gte("inicio", desde).order("inicio", { ascending: false }).limit(500),
    supabase.from("saude_registros").select("id, ts, tipo, valor").eq("workspace_id", workspaceId)
      .gte("ts", desde).in("tipo", ["malestar", "ortostatico"]).order("ts", { ascending: false }).limit(200),
    supabase.from("saude_ecgs").select("id, ts, duracao_s, hz, amostras_mv").eq("workspace_id", workspaceId)
      .gte("ts", desde).order("ts", { ascending: false }).limit(3),
  ]);

  type NoiteRow = { noite: string; fc_repouso: number | null; vfc_noturna: number | null; temp_pele: number | null; sono_inicio: string | null; sono_fim: string | null };
  const noites: NoiteRel[] = ((noitesR.data ?? []) as NoiteRow[])
    .filter((n) => n.fc_repouso != null || n.vfc_noturna != null)
    .map((n) => ({
      noite: n.noite, sonoInicio: n.sono_inicio, sonoFim: n.sono_fim,
      fcRepouso: n.fc_repouso != null ? Math.round(n.fc_repouso) : null,
      vfc: n.vfc_noturna != null ? Math.round(n.vfc_noturna) : null,
      temp: n.temp_pele != null ? Math.round(n.temp_pele * 10) / 10 : null,
    }))
    .reverse();

  type EvRow = { id: string; tipo: string; inicio: string; fim: string | null; detalhes: Record<string, unknown> | null; nota: string | null; descartado: boolean };
  const eventos = ((eventosR.data ?? []) as EvRow[]).filter((e) => !e.descartado);
  type RegRow = { id: string; ts: string; tipo: string; valor: string };
  const regs = (regsR.data ?? []) as RegRow[];

  // ---- mal-estar (relógio + site) com batimento ±10 min
  const brutos = [
    ...regs.filter((r) => r.tipo === "malestar").map((r) => ({ id: r.id, ts: r.ts, fonte: "relógio" as const, situacao: r.valor || null, sintomas: [] as string[], nota: null as string | null })),
    ...eventos.filter((e) => e.tipo === "malestar").map((e) => ({
      id: e.id, ts: e.inicio, fonte: "site" as const, situacao: (e.detalhes?.situacao as string | undefined) ?? null,
      sintomas: Array.isArray(e.detalhes?.sintomas) ? (e.detalhes!.sintomas as string[]) : [], nota: e.nota,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 12);
  const malEstares: MalEstarRel[] = await Promise.all(brutos.map(async (m) => {
    const t = new Date(m.ts).getTime();
    const { data } = await supabase.from("saude_bpm_minuto").select("minuto, bpm_medio, bpm_min, bpm_max").eq("workspace_id", workspaceId)
      .gte("minuto", new Date(t - 10 * 60_000).toISOString()).lte("minuto", new Date(t + 10 * 60_000).toISOString()).order("minuto");
    return { ...m, serie: (data ?? []).map((b) => ({ minuto: b.minuto, bpm: Math.round(b.bpm_medio), min: b.bpm_min, max: b.bpm_max })) };
  }));

  // ---- testes ortostáticos
  const ortostaticos: OrtoRel[] = regs.filter((r) => r.tipo === "ortostatico").map((r) => {
    let o: Record<string, unknown> = {};
    try { o = JSON.parse(r.valor) as Record<string, unknown>; } catch { /* valor antigo/inválido */ }
    const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : null);
    return { ts: r.ts, deitado: n("d"), pico: n("p"), m1: n("m1"), m3: n("m3"), sintomas: o.s === true };
  });

  // ---- ECGs (traçado completo)
  type EcgRow = { id: string; ts: string; duracao_s: number; hz: number; amostras_mv: number[] };
  const ecgs: EcgRel[] = ((ecgsR.data ?? []) as EcgRow[]).map((e) => ({ id: e.id, ts: e.ts, duracaoS: e.duracao_s, hz: e.hz, amostras: e.amostras_mv ?? [] }));

  // ---- treinos (números pelo intervalo de cada um)
  const tr = eventos.filter((e) => e.tipo === "treino" && e.fim);
  type ResumoRow = { idx: number; minutos: number; fc_media: number | null; fc_max: number | null };
  const resumos = tr.length
    ? (((await supabase.rpc("saude_resumo_intervalos", { p_workspace_id: workspaceId, p_inicios: tr.map((e) => e.inicio), p_fins: tr.map((e) => e.fim!) })).data ?? []) as ResumoRow[])
    : [];
  const treinos: TreinoRel[] = tr.map((e, i) => {
    const r = resumos.find((x) => x.idx === i + 1);
    const ok = r && r.minutos >= 3;
    return {
      inicio: e.inicio, fim: e.fim!, modalidade: (e.detalhes?.modalidade as string | undefined) ?? "Treino",
      esforco: typeof e.detalhes?.esforco === "number" ? (e.detalhes.esforco as number) : null,
      fcMedia: ok && r.fc_media != null ? Math.round(r.fc_media) : null, fcMax: ok ? r.fc_max : null,
    };
  });

  // ---- diário (o que o relógio não sabe)
  const diario: DiarioRel[] = eventos.filter((e) => e.tipo !== "treino" && e.tipo !== "malestar").map((e) => ({
    ts: e.inicio, tipo: ROTULO[e.tipo] ?? e.tipo,
    descricao: [
      typeof e.detalhes?.intensidade === "number" ? `intensidade ${e.detalhes.intensidade}/5` : null,
      e.nota,
    ].filter(Boolean).join(" · "),
  }));

  const d = disp.data?.[0];
  return {
    dias, geradoEm: new Date().toISOString(), noites, malEstares, ortostaticos, ecgs, treinos, diario,
    relogio: d ? { nome: d.nome, versao: d.versao_app } : null,
  };
}
