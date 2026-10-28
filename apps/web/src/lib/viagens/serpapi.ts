import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cabine } from "@/lib/viagens/radar-calc";
import type { OfertaDinheiro } from "@/lib/viagens/promocoes-calc";

/**
 * Preços em dinheiro via SerpApi (dados do Google Flights).
 *
 * Plano gratuito: 250 buscas/mês. Cada busca não-cacheada conta 1. Por isso
 * existe um teto mensal configurável (viagem_radar_config.serpapi_mensal_max)
 * e o uso fica em `viagem_api_uso`.
 *
 * A chave vem do Vault (`viagens/serpapi/api_key`, cadastrada na tela de
 * Promoções) ou da env SERPAPI_KEY. Sem chave, tudo aqui devolve "indisponível"
 * e o resto da rotina segue só com milhas.
 *
 * Pedimos sempre 1 adulto: assim o `price` é por pessoa, sem ambiguidade de
 * total × por passageiro.
 */

const BASE = "https://serpapi.com/search.json";
const CLASSE: Record<Cabine, string> = { economy: "1", premium: "2", business: "3", first: "4" };

let chaveCache: { valor: string | null; em: number } | null = null;

export async function chaveSerpApi(): Promise<string | null> {
  if (chaveCache && Date.now() - chaveCache.em < 300_000) return chaveCache.valor;
  let valor: string | null = process.env.SERPAPI_KEY || null;
  if (!valor) {
    const admin = createAdminClient();
    const { data } = await admin.rpc("viagem_secret_get", { p_name: "viagens/serpapi/api_key" });
    valor = (data as string | null) || null;
  }
  chaveCache = { valor, em: Date.now() };
  return valor;
}

export function limparCacheChaveSerpApi() {
  chaveCache = null;
}

/** Buscas usadas no mês corrente (UTC). */
export async function usoMensalSerpApi(): Promise<number> {
  const admin = createAdminClient();
  const inicio = new Date().toISOString().slice(0, 8) + "01";
  const { data } = await admin.from("viagem_api_uso").select("chamadas").eq("fonte", "serpapi").gte("dia", inicio);
  return ((data as { chamadas: number }[] | null) ?? []).reduce((s, r) => s + r.chamadas, 0);
}

async function chamar(params: Record<string, string>): Promise<Record<string, unknown>> {
  const chave = await chaveSerpApi();
  if (!chave) throw new Error("SerpApi sem chave configurada.");
  const qs = new URLSearchParams({ ...params, api_key: chave, hl: "pt-br", gl: "br", currency: "BRL" });
  const res = await fetch(`${BASE}?${qs}`, { cache: "no-store" });
  const admin = createAdminClient();
  await admin.rpc("viagem_registrar_uso", { p_fonte: "serpapi", p_chamadas: 1, p_restante: null });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.error) throw new Error(`SerpApi: ${String(json.error ?? res.status)}`);
  return json;
}

export interface PrecoDinheiro {
  /** Ida e volta (ou só ida), por pessoa, em centavos de R$. */
  precoCents: number;
  companhias: string;
  paradas: number;
  duracaoMin: number | null;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string | null;
  /** "low" | "typical" | "high", quando o Google informa. */
  nivelPreco: string | null;
  faixaTipicaCents: [number, number] | null;
}

interface FlightLeg {
  departure_airport?: { id?: string };
  arrival_airport?: { id?: string };
  airline?: string;
}
interface Itinerario {
  flights?: FlightLeg[];
  price?: number;
  total_duration?: number;
  layovers?: unknown[];
}

/** Menor preço no Google Flights para as datas exatas. */
export async function buscarDinheiro(p: {
  origens: string[];
  destinos: string[];
  dataIda: string;
  dataVolta: string | null;
  cabine: Cabine;
  apenasDireto?: boolean;
}): Promise<PrecoDinheiro | null> {
  const json = await chamar({
    engine: "google_flights",
    departure_id: p.origens.join(","),
    arrival_id: p.destinos.join(","),
    outbound_date: p.dataIda,
    ...(p.dataVolta ? { return_date: p.dataVolta, type: "1" } : { type: "2" }),
    travel_class: CLASSE[p.cabine],
    adults: "1",
    sort_by: "2",
    ...(p.apenasDireto ? { stops: "1" } : {}),
  });
  const todos = [...((json.best_flights as Itinerario[]) ?? []), ...((json.other_flights as Itinerario[]) ?? [])].filter(
    (i) => typeof i.price === "number" && i.price > 0,
  );
  if (todos.length === 0) return null;
  const melhor = todos.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a));
  const voos = melhor.flights ?? [];
  const insights = (json.price_insights ?? {}) as { price_level?: string; typical_price_range?: number[] };
  const faixa = insights.typical_price_range;
  return {
    precoCents: Math.round((melhor.price as number) * 100),
    companhias: [...new Set(voos.map((v) => v.airline).filter(Boolean))].join(", "),
    paradas: melhor.layovers?.length ?? Math.max(0, voos.length - 1),
    duracaoMin: melhor.total_duration ?? null,
    origem: voos[0]?.departure_airport?.id ?? p.origens[0] ?? "",
    destino: voos[voos.length - 1]?.arrival_airport?.id ?? p.destinos[0] ?? "",
    dataIda: p.dataIda,
    dataVolta: p.dataVolta,
    nivelPreco: insights.price_level ?? null,
    faixaTipicaCents:
      Array.isArray(faixa) && faixa.length === 2 ? [(faixa[0] as number) * 100, (faixa[1] as number) * 100] : null,
  };
}

interface DestinoExplore {
  name?: string;
  country?: string;
  destination_airport?: { code?: string };
  start_date?: string;
  end_date?: string;
  flight_price?: number;
  number_of_stops?: number;
  airline?: string;
}

/** Destinos mais baratos saindo de uma origem (Google Travel Explore), ida e volta de ~1 semana. */
export async function explorarDestinos(origem: string): Promise<OfertaDinheiro[]> {
  const json = await chamar({ engine: "google_travel_explore", departure_id: origem, travel_duration: "2", adults: "1" });
  const lista = (json.destinations as DestinoExplore[]) ?? [];
  return lista
    .filter((d) => d.destination_airport?.code && typeof d.flight_price === "number" && d.flight_price > 0 && d.start_date)
    .map((d) => ({
      origem,
      destino: d.destination_airport!.code!,
      destinoNome: [d.name, d.country].filter(Boolean).join(", "),
      dataIda: d.start_date!.slice(0, 10),
      dataVolta: d.end_date ? d.end_date.slice(0, 10) : null,
      precoCents: Math.round(d.flight_price! * 100),
      paradas: typeof d.number_of_stops === "number" ? d.number_of_stops : null,
      companhia: d.airline ?? null,
    }));
}
