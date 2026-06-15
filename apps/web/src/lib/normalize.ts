/**
 * Replica normalizar_texto() do schema.sql no lado do app:
 * minúsculas, sem acento, só alfanumérico + espaço.
 * Mantém nome_normalizado consistente para o matching por pg_trgm.
 */
// Marcas diacríticas combinantes U+0300–U+036F (construída via string para
// evitar caracteres combinantes literais no fonte).
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
