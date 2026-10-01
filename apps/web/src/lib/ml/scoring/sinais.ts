/** Sinais auxiliares do scoring (puros). */

const PARADAS = new Set(["de", "da", "do", "das", "dos", "e", "para", "com", "sem", "em", "a", "o", "as", "os", "kit", "un"]);

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length >= 2 && !PARADAS.has(t));
}

/**
 * O título "casa" com uma busca em alta quando contém todos os termos
 * relevantes da busca (ex.: "organizador geladeira" ⊂ "Kit 6 Organizadores de Geladeira…").
 * Termos de 1 palavra exigem ≥ 5 letras para evitar falso positivo.
 */
export function tendenciasQueCasam(titulo: string, buscas: string[]): string[] {
  const t = new Set(tokens(titulo));
  const raizes = new Set([...t].map((x) => x.replace(/(es|s)$/, "")));
  const casa = (termo: string) => t.has(termo) || raizes.has(termo.replace(/(es|s)$/, ""));
  const out: string[] = [];
  for (const busca of buscas) {
    const tb = tokens(busca);
    if (tb.length === 0) continue;
    if (tb.length === 1 && tb[0]!.length < 5) continue;
    if (tb.every(casa)) out.push(busca);
  }
  return out;
}

export function descontoPct(preco: number | null, original: number | null): number | null {
  if (preco == null || original == null || original <= 0 || original <= preco) return preco != null ? 0 : null;
  return Math.round(((original - preco) / original) * 1000) / 10;
}

export function maiorLado(imagens: { width?: number | null; height?: number | null }[]): number | null {
  let max: number | null = null;
  for (const i of imagens) {
    const m = Math.max(i.width ?? 0, i.height ?? 0);
    if (m > 0 && (max == null || m > max)) max = m;
  }
  return max;
}

export function diasEntre(a: Date | string, b: Date | string = new Date()): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
