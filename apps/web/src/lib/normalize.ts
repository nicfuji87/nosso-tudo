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

/**
 * Agrupa unidades de medida sinônimas para comparar preço entre compras
 * (R$/un só faz sentido contra R$/un; R$/kg contra R$/kg). Retorna null quando
 * não há unidade; tokens desconhecidos voltam normalizados (minúsculo, sem acento).
 */
export function normalizarUnidade(unidade: string | null | undefined): string | null {
  const u = (unidade ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!u) return null;
  if (["un", "und", "uni", "unid", "unidade", "unidades", "pc", "pcs", "peca", "pecas"].includes(u)) return "un";
  if (["kg", "kgs", "quilo", "quilos", "kilo", "kilos"].includes(u)) return "kg";
  if (["g", "gr", "grs", "grama", "gramas"].includes(u)) return "g";
  if (["l", "lt", "lts", "litro", "litros"].includes(u)) return "l";
  if (["ml", "mililitro", "mililitros"].includes(u)) return "ml";
  return u;
}
