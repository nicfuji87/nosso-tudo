import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cabine, OfertaMilhas } from "@/lib/viagens/radar-calc";

/**
 * Cliente do seats.aero (Partner API, conta Pro — uso pessoal, não comercial).
 *
 * Só Cached Search: o dado é cache e pode divergir na hora de emitir; a UI diz
 * isso. Cota: 1.000 chamadas por dia (zera à meia-noite UTC). Toda chamada é
 * registrada em `viagem_api_uso` junto com o `X-RateLimit-Remaining` que a API
 * devolve, e o cliente se recusa a gastar a reserva final.
 *
 * Formato conferido com chamada real em 28/10/2026: custo em milhas vem como
 * string (`YMileageCost`), taxas em centavos (`YTotalTaxes`) com `TaxesCurrency`.
 */

const BASE = "https://seats.aero/partnerapi";
/** Não gasta as últimas N chamadas do dia — sobra para uso manual. */
export const RESERVA_SEATS = 60;

const LETRA: Record<Cabine, "Y" | "W" | "J" | "F"> = { economy: "Y", premium: "W", business: "J", first: "F" };

interface AvailabilityRaw {
  ID: string;
  Date: string;
  Source: string;
  UpdatedAt: string;
  Route: { OriginAirport: string; DestinationAirport: string; Source?: string };
  TaxesCurrency?: string;
  [k: string]: unknown;
}

interface SearchResponse {
  data: AvailabilityRaw[];
  count: number;
  hasMore: boolean;
  cursor: number;
}

export class CotaEsgotadaError extends Error {
  constructor(fonte: string) {
    super(`Cota diária do ${fonte} no limite da reserva — busca adiada para amanhã.`);
  }
}

function token(): string {
  const t = process.env.SEATS_AERO_TOKEN;
  if (!t) throw new Error("SEATS_AERO_TOKEN não configurado.");
  return t;
}

let restanteConhecido: number | null = null;

async function registrarUso(restante: number | null) {
  restanteConhecido = restante ?? restanteConhecido;
  const admin = createAdminClient();
  await admin.rpc("viagem_registrar_uso", { p_fonte: "seats_aero", p_chamadas: 1, p_restante: restante });
}

/** Restante do dia segundo a última resposta da API (ou do banco, se ainda não chamou neste processo). */
export async function restanteSeatsAero(): Promise<number | null> {
  if (restanteConhecido !== null) return restanteConhecido;
  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("viagem_api_uso")
    .select("restante_informado, chamadas")
    .eq("dia", hoje)
    .eq("fonte", "seats_aero")
    .maybeSingle();
  const row = data as { restante_informado: number | null; chamadas: number } | null;
  if (!row) return null;
  return row.restante_informado ?? Math.max(0, 1000 - row.chamadas);
}

/** Converte um objeto do seats.aero em ofertas (uma por cabine pedida que tenha disponibilidade). */
export function normalizar(raw: AvailabilityRaw, cabines: Cabine[]): OfertaMilhas[] {
  const out: OfertaMilhas[] = [];
  for (const cabine of cabines) {
    const L = LETRA[cabine];
    if (raw[`${L}Available`] !== true) continue;
    const milhas = Number(raw[`${L}MileageCost`] ?? 0);
    if (!Number.isFinite(milhas) || milhas <= 0) continue;
    const assentosRaw = Number(raw[`${L}RemainingSeats`] ?? 0);
    out.push({
      id: `${raw.ID}:${cabine}`,
      origem: raw.Route.OriginAirport,
      destino: raw.Route.DestinationAirport,
      data: raw.Date.slice(0, 10),
      programa: raw.Source || raw.Route.Source || "",
      cabine,
      milhas,
      taxasCents: Number(raw[`${L}TotalTaxes`] ?? 0) || 0,
      moedaTaxas: (raw.TaxesCurrency as string) || "USD",
      assentos: Number.isFinite(assentosRaw) && assentosRaw > 0 ? assentosRaw : null,
      direto: raw[`${L}Direct`] === true,
      companhias: String(raw[`${L}Airlines`] ?? ""),
      atualizadoEm: raw.UpdatedAt,
    });
  }
  return out;
}

export interface BuscaMilhas {
  origens: string[];
  destinos: string[];
  de: string;
  ate: string;
  cabines: Cabine[];
  /** Fontes do seats.aero. Vazio = todas. */
  programas?: string[];
  apenasDireto?: boolean;
  /** Ordena pelo menor custo em milhas (útil quando só interessa o topo). */
  maisBaratoPrimeiro?: boolean;
  /** Máximo de páginas de 1.000 (cada página = 1 chamada da cota). */
  maxPaginas?: number;
}

/** Cached Search com paginação e dedupe por ID. */
export async function buscarMilhas(b: BuscaMilhas): Promise<{ ofertas: OfertaMilhas[]; chamadas: number }> {
  const restante = await restanteSeatsAero();
  if (restante !== null && restante <= RESERVA_SEATS) throw new CotaEsgotadaError("seats.aero");

  const params = new URLSearchParams({
    origin_airport: b.origens.join(","),
    destination_airport: b.destinos.join(","),
    start_date: b.de,
    end_date: b.ate,
    cabins: b.cabines.join(","),
    take: "1000",
  });
  if (b.programas?.length) params.set("sources", b.programas.join(","));
  if (b.apenasDireto) params.set("only_direct_flights", "true");
  if (b.maisBaratoPrimeiro) params.set("order_by", "lowest_mileage");

  const vistos = new Set<string>();
  const ofertas: OfertaMilhas[] = [];
  let cursor: number | null = null;
  let skip = 0;
  let chamadas = 0;
  const maxPaginas = b.maxPaginas ?? 2;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    if (cursor !== null) {
      params.set("cursor", String(cursor));
      params.set("skip", String(skip));
    }
    const res = await fetch(`${BASE}/search?${params}`, {
      headers: { "Partner-Authorization": token(), accept: "application/json" },
      cache: "no-store",
    });
    chamadas++;
    const rest = res.headers.get("x-ratelimit-remaining");
    await registrarUso(rest !== null ? Number(rest) : null);
    if (res.status === 429) throw new CotaEsgotadaError("seats.aero");
    if (!res.ok) throw new Error(`seats.aero respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = (await res.json()) as SearchResponse;
    for (const raw of json.data ?? []) {
      if (vistos.has(raw.ID)) continue;
      vistos.add(raw.ID);
      ofertas.push(...normalizar(raw, b.cabines));
    }
    skip += json.data?.length ?? 0;
    if (cursor === null) cursor = json.cursor;
    if (!json.hasMore) break;
    if (restanteConhecido !== null && restanteConhecido <= RESERVA_SEATS) break;
  }
  return { ofertas, chamadas };
}
