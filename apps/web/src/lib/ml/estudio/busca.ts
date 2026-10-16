/**
 * Estúdio — busca de produtos (regras puras). O resultado vem do actor do Apify que lê a
 * página de busca do Mercado Livre (a API oficial não expõe unidades vendidas). O schema do
 * actor é de terceiros: tudo aqui é defensivo.
 */

export interface ResultadoBusca {
  /** Chave estável: ID de catálogo quando houver, senão o do anúncio. */
  id: string;
  idCatalogo: string | null;
  idAnuncio: string | null;
  /** "User product" (MLBU…) — o mesmo produto vendido em vários anúncios do mesmo vendedor. */
  idUsuario?: string | null;
  titulo: string;
  imagem: string | null;
  link: string | null;
  preco: number | null;
  precoAnterior: number | null;
  descontoPct: number | null;
  vendidos: number | null;
  avaliacao: number | null;
  numAvaliacoes: number | null;
  freteGratis: boolean;
  lojaOficial: boolean;
  internacional: boolean;
  patrocinado: boolean;
  marca: string | null;
  vendedor: string | null;
  categoriaId: string | null;
  posicao: number | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** "92,05" → 92.05 · "1.299,90" → 1299.9 · 103.86 → 103.86 */
export function numeroBr(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpo = v.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  const n = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function idMl(v: unknown): string | null {
  const s = texto(v);
  return s && /^MLB\d{4,}$/i.test(s) ? s.toUpperCase() : null;
}

function idUsuarioMl(v: unknown): string | null {
  const s = texto(v);
  return s && /^MLBU\d{4,}$/i.test(s) ? s.toUpperCase() : null;
}

export function normalizarItem(it: Record<string, unknown>): ResultadoBusca | null {
  const titulo = texto(it.eTituloProduto) ?? texto(it.titulo) ?? texto(it.title);
  if (!titulo) return null;
  const idCatalogo = idMl(it.idProdutoCatalogo);
  const idAnuncio = idMl(it.idPublicacao);
  const id = idCatalogo ?? idAnuncio;
  if (!id) return null;
  const preco = numeroBr(it.novoPreco ?? it.preco ?? it.price);
  const precoAnterior = numeroBr(it.precoAnterior);
  const desc = numeroBr(it.precoDiscount);
  const imagem = texto(it.imagemLink);
  const link = texto(it.zProdutoLink);
  return {
    id,
    idCatalogo,
    idAnuncio,
    idUsuario: idUsuarioMl(it.idProdutoUsuario),
    titulo,
    imagem: imagem && /^https:\/\/[^/]*mlstatic\.com\//.test(imagem) ? imagem : null,
    link: link && /^https:\/\/([a-z0-9-]+\.)*mercadoli(vre|bre)\.com(\.br)?\//i.test(link) ? link : null,
    preco,
    precoAnterior: precoAnterior && preco && precoAnterior > preco ? precoAnterior : null,
    descontoPct: desc != null && desc > 0 && desc < 100 ? Math.round(desc) : null,
    vendidos: numeroBr(it.quantidadeVendida),
    avaliacao: (() => {
      const r = numeroBr(it.produtoReviews);
      return r != null && r > 0 && r <= 5 ? r : null;
    })(),
    numAvaliacoes: numeroBr(it.numeroAvaliacoes),
    freteGratis: it.freteGratis === true,
    lojaOficial: it.lojaOficial === true,
    internacional: it.eCompraInternacional === true,
    patrocinado: it.patrocinado === true || /^(AD|ADS|PATROCINADO)$/i.test(String(it.tipoResultado ?? "").trim()),
    marca: texto(it.produtoMarca),
    vendedor: texto(it.Vendedor),
    categoriaId: texto(it.produtoCategoryID),
    posicao: numeroBr(it.posicaoItem),
  };
}

/** Normaliza e junta duplicados (o mesmo produto de catálogo vendido por várias lojas). */
export function normalizarResultados(itens: Record<string, unknown>[]): ResultadoBusca[] {
  const porId = new Map<string, ResultadoBusca>();
  for (const it of itens) {
    const r = normalizarItem(it);
    if (!r) continue;
    const atual = porId.get(r.id);
    if (!atual || (r.vendidos ?? 0) > (atual.vendidos ?? 0)) porId.set(r.id, r);
  }
  return [...porId.values()];
}

export interface FiltrosBusca {
  precoMin?: number | null;
  precoMax?: number | null;
  vendidosMin?: number | null;
  avaliacaoMin?: number | null;
  freteGratis?: boolean;
  lojaOficial?: boolean;
  semInternacional?: boolean;
  semPatrocinado?: boolean;
  /** Palavras que o título precisa ter (todas), ex.: "vidro", "10". */
  incluir?: string[];
  /** Palavras que excluem o resultado, ex.: "plástico". */
  excluir?: string[];
  ordem?: "vendidos" | "avaliacao" | "desconto" | "menor_preco" | "relevancia";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarResultados(lista: ResultadoBusca[], f: FiltrosBusca): ResultadoBusca[] {
  const inc = (f.incluir ?? []).map(semAcento).filter(Boolean);
  const exc = (f.excluir ?? []).map(semAcento).filter(Boolean);
  const out = lista.filter((r) => {
    if (f.precoMin != null && (r.preco == null || r.preco < f.precoMin)) return false;
    if (f.precoMax != null && (r.preco == null || r.preco > f.precoMax)) return false;
    if (f.vendidosMin != null && (r.vendidos ?? 0) < f.vendidosMin) return false;
    if (f.avaliacaoMin != null && (r.avaliacao ?? 0) < f.avaliacaoMin) return false;
    if (f.freteGratis && !r.freteGratis) return false;
    if (f.lojaOficial && !r.lojaOficial) return false;
    if (f.semInternacional && r.internacional) return false;
    if (f.semPatrocinado && r.patrocinado) return false;
    const t = semAcento(r.titulo);
    if (inc.some((p) => !t.includes(p))) return false;
    if (exc.some((p) => t.includes(p))) return false;
    return true;
  });
  const ordem = f.ordem ?? "vendidos";
  const cmp: Record<NonNullable<FiltrosBusca["ordem"]>, (a: ResultadoBusca, b: ResultadoBusca) => number> = {
    vendidos: (a, b) => (b.vendidos ?? -1) - (a.vendidos ?? -1) || (b.avaliacao ?? 0) - (a.avaliacao ?? 0),
    avaliacao: (a, b) => (b.avaliacao ?? 0) - (a.avaliacao ?? 0) || (b.numAvaliacoes ?? 0) - (a.numAvaliacoes ?? 0),
    desconto: (a, b) => (b.descontoPct ?? 0) - (a.descontoPct ?? 0),
    menor_preco: (a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity),
    relevancia: (a, b) => (a.posicao ?? 999) - (b.posicao ?? 999),
  };
  return out.sort(cmp[ordem]);
}

/** Palavras-chave de busca a partir do título de um produto (link colado). */
export function termoDoTitulo(titulo: string): string {
  const ruido = new Set(["de", "da", "do", "das", "dos", "com", "para", "e", "em", "a", "o", "ao", "no", "na", "vai", "kit", "c/", "p/", "-", "|"]);
  const palavras = titulo
    .replace(/[()[\],/|+]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !ruido.has(p.toLowerCase()) && !/^\d+(ml|l|cm|mm|m|g|kg|w|v)?$/i.test(p));
  return palavras.slice(0, 5).join(" ") || titulo.slice(0, 60);
}

export function formatarVendidos(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1000) return `+${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil vendidos`;
  return `+${n} vendidos`;
}

/** Acha, nos resultados, o produto de um link colado (por catálogo, user product ou anúncio). */
export function acharDoLink(lista: ResultadoBusca[], ids: { catalogo: string | null; usuario: string | null; anuncios: string[] }): ResultadoBusca | null {
  return (
    lista.find(
      (r) =>
        (ids.catalogo && r.idCatalogo === ids.catalogo) ||
        (ids.usuario && r.idUsuario === ids.usuario) ||
        (r.idAnuncio && ids.anuncios.includes(r.idAnuncio)),
    ) ?? null
  );
}
