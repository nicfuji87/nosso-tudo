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

/**
 * Medida embutida no nome do produto: "Picanha 0,544kg", "Tapioca 700g", "(2un)".
 * A unidade precisa vir colada/adjacente ao número — senão "Ype 3 em 1" viraria medida.
 * Espelha medida_regex() do schema; mudou aqui, mude lá.
 */
const MEDIDA_NO_NOME =
  /(\d+(?:[.,]\d+)?)\s*(kgs?|quilos?|kilos?|gramas?|grs?|g|mg|litros?|lts?|l|ml|unidades?|unid|und|un|pcs?|pecas?|cx|caixas?|pct|pacotes?)(?![a-z0-9])/i;

/** Extrai a medida do nome do produto. Null quando o nome não traz medida. */
export function extrairMedida(nome: string): { valor: number; unidade: string } | null {
  const semAcento = nome.normalize("NFD").replace(COMBINING_MARKS, "");
  const m = MEDIDA_NO_NOME.exec(semAcento);
  if (!m) return null;
  const valor = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const unidade = normalizarUnidade(m[2]);
  return unidade ? { valor, unidade } : null;
}

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "dos", "das", "com", "e", "em", "a", "o", "os", "as",
  "tipo", "sem", "para", "pra", "no", "na", "nos", "nas", "un", "kg", "g", "ml", "l",
]);

/**
 * Chave de identidade do produto: sem a medida, sem palavras vazias e com os
 * tokens ORDENADOS. É o que faz "Picanha Angus 0,544kg" e "...0,590kg" serem o
 * mesmo produto, e "Suco Integral Uva Aurora" casar com "Suco de Uva Integral
 * Aurora". Espelha nome_base_produto() do schema; mudou aqui, mude lá.
 */
export function nomeBaseProduto(nome: string): string {
  return normalizarTexto(
    nome.normalize("NFD").replace(COMBINING_MARKS, "").replace(new RegExp(MEDIDA_NO_NOME, "gi"), " "),
  )
    .split(" ")
    .filter((t) => t && !PALAVRAS_VAZIAS.has(t) && !/^\d+$/.test(t))
    .sort()
    .join(" ");
}
