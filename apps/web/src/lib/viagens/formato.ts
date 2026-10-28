/**
 * Formatação curta para as telas e mensagens do módulo de viagens. PURO —
 * importável em client components.
 */
import { NOME_AEROPORTO } from "./aeroportos";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** 67000 → "67 mil"; 28500 → "28,5 mil". */
export function milhasCurto(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 1000) return String(m);
  const mil = Math.round(m / 100) / 10;
  return `${mil.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
}

/** "2027-04-06" → "06/04/27". */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

/** "2027-04-06" → "ter, 06/abr". */
export function dataComDia(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${dia}, ${iso.slice(8, 10)}/${MES[Number(iso.slice(5, 7)) - 1]}`;
}

export function reais(cents: number | null | undefined, opts?: { semCentavos?: boolean }): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: opts?.semCentavos === false ? 2 : 0,
  });
}

export function aeroporto(iata: string): string {
  const nome = NOME_AEROPORTO[iata];
  return nome ? `${nome} (${iata})` : iata;
}

/** Programas cujas taxas o seats.aero não informa — o custo fica sem as taxas. */
export const SEM_TAXAS = new Set(["qatar", "turkish", "singapore"]);
