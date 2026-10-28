import "server-only";

/**
 * Cotação USD→BRL para converter as taxas do seats.aero (que vêm em dólar).
 * Fonte: AwesomeAPI (pública, sem chave). Se falhar, usa um valor conservador
 * — taxas são uma fração pequena do custo, então um erro de câmbio aqui não
 * vira a decisão; mas a UI mostra qual cotação foi usada.
 */
export const CAMBIO_PADRAO = 5.6;

let cache: { valor: number; fonte: "awesomeapi" | "padrao"; em: number } | null = null;

export async function cotacaoUsdBrl(): Promise<{ valor: number; fonte: "awesomeapi" | "padrao" }> {
  if (cache && Date.now() - cache.em < 3_600_000) return cache;
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await res.json()) as { USDBRL?: { ask?: string } };
    const v = Number(json.USDBRL?.ask);
    if (Number.isFinite(v) && v > 3 && v < 15) {
      cache = { valor: v, fonte: "awesomeapi", em: Date.now() };
      return cache;
    }
  } catch {
    // cai no padrão
  }
  cache = { valor: CAMBIO_PADRAO, fonte: "padrao", em: Date.now() };
  return cache;
}
