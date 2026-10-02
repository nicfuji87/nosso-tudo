/**
 * Importação de comissões em CSV (o programa de afiliados do ML não tem API
 * de relatórios — ADR-ML-015). Formato flexível: detecta separador e mapeia
 * colunas por sinônimos (pt/en). Pura, testada em csv.test.ts.
 */

export interface LinhaComissao {
  inicio: string; // YYYY-MM-DD
  fim: string;
  codigo_ml: string | null;
  referencia: string;
  cliques: number | null;
  pedidos: number | null;
  gmv: number | null;
  comissao: number;
}

const SINONIMOS: Record<string, string[]> = {
  data: ["data", "date", "dia", "periodo", "período", "data da venda", "data do pedido"],
  inicio: ["inicio", "início", "de", "start", "data inicial", "período início"],
  fim: ["fim", "ate", "até", "end", "data final", "período fim"],
  comissao: ["comissao", "comissão", "commission", "ganhos", "ganho", "valor da comissão", "comissão total"],
  cliques: ["cliques", "clicks", "click"],
  pedidos: ["pedidos", "vendas", "orders", "compras", "unidades"],
  gmv: ["gmv", "valor vendido", "faturamento", "receita", "valor da venda", "valor total", "valor"],
  produto: ["produto", "item", "codigo", "código", "mlb", "id do produto", "anúncio", "anuncio", "link", "url"],
  referencia: ["referencia", "referência", "id do pedido", "pedido", "order id", "order", "id"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function separar(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]!;
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      out.push(atual);
      atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

export function numeroBr(v: string | undefined): number | null {
  if (v == null) return null;
  let s = v.replace(/[R$\s%]/g, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, ""); // 1,234.56
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function dataIso(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function parseCsvComissoes(texto: string): { linhas: LinhaComissao[]; erros: string[] } {
  const erros: string[] = [];
  const brutas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (brutas.length < 2) return { linhas: [], erros: ["O arquivo precisa de cabeçalho e ao menos uma linha."] };
  const cab = brutas[0]!;
  const sep = [";", "\t", ","].sort((a, b) => cab.split(b).length - cab.split(a).length)[0]!;
  const colunas = separar(cab, sep).map(norm);
  const idx: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const i = colunas.findIndex((c) => nomes.map(norm).includes(c));
    if (i >= 0) idx[campo] = i;
  }
  if (idx.comissao == null) return { linhas: [], erros: ["Coluna de comissão não encontrada (ex.: \"Comissão\")."] };
  if (idx.data == null && idx.inicio == null) return { linhas: [], erros: ["Coluna de data/período não encontrada."] };

  const linhas: LinhaComissao[] = [];
  brutas.slice(1).forEach((l, n) => {
    const c = separar(l, sep);
    const get = (campo: string) => (idx[campo] != null ? c[idx[campo]!] : undefined);
    const inicio = dataIso(get("inicio") ?? get("data"));
    const fim = dataIso(get("fim") ?? get("data")) ?? inicio;
    const comissao = numeroBr(get("comissao"));
    if (!inicio || !fim || comissao == null) {
      erros.push(`Linha ${n + 2}: data ou comissão inválida.`);
      return;
    }
    const produto = get("produto") ?? "";
    const codigo = /MLBU?-?\d{6,}/i.exec(produto)?.[0]?.replace("-", "").toUpperCase() ?? null;
    const referencia = get("referencia")?.trim() || `csv:${hash(`${inicio}|${fim}|${codigo ?? produto}|${comissao}|${get("gmv") ?? ""}`)}`;
    linhas.push({
      inicio: inicio <= fim ? inicio : fim,
      fim: inicio <= fim ? fim : inicio,
      codigo_ml: codigo,
      referencia,
      cliques: numeroBr(get("cliques")),
      pedidos: numeroBr(get("pedidos")),
      gmv: numeroBr(get("gmv")),
      comissao,
    });
  });
  return { linhas, erros };
}
