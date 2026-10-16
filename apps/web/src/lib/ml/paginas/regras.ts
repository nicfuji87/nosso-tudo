/**
 * Páginas de produto (destino do Pin) — regras puras, sem banco.
 *
 * A página é conteúdo de verdade (foto, texto, aviso de afiliado) com um botão que a pessoa
 * clica para ir ao Mercado Livre. Nada aqui gera redirecionamento automático: o Pinterest
 * proíbe usar redirect para chegar a um site que ele não aceita.
 */

/** Caminho público das páginas (fora de /ml: não passa pelo login). */
export const PREFIXO_PAGINAS = "/achados";

export const LIMITES_PAGINA = { titulo: 120, resumo: 600, destaque: 90, destaques: 6, imagens: 6, cta: 40 } as const;

/** Hosts aceitos para imagem da página: CDN do Mercado Livre e o Storage do próprio app. */
export const HOSTS_IMAGEM_ML = ["mlstatic.com"];

const RE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugValido(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 90 && RE_SLUG.test(slug);
}

/** Slug legível a partir do título + sufixo aleatório curto (evita colisão e adivinhação). */
export function gerarSlug(titulo: string, sufixo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let corte = base.slice(0, 60);
  if (base.length > 60 && corte.includes("-")) corte = corte.slice(0, corte.lastIndexOf("-"));
  const limpo = corte.replace(/-+$/g, "") || "achado";
  const suf = sufixo.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x";
  return `${limpo}-${suf}`;
}

export interface IdMl {
  id: string;
  /** Mesmo vocabulário de `resolverProduto` (highlights do ML). */
  tipo: "PRODUCT" | "USER_PRODUCT" | "ITEM";
}

/**
 * Extrai o ID do Mercado Livre de uma URL de anúncio/catálogo. Links curtos (meli.la,
 * /sec/…) não carregam o ID — e o destino deles é a vitrine de afiliado, não o produto.
 */
export function extrairIdMl(url: string | null | undefined): IdMl | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const caminho = decodeURIComponent(u.pathname);
  const catalogo = /\/p\/(MLB\d{4,})/i.exec(caminho);
  if (catalogo) return { id: catalogo[1]!.toUpperCase(), tipo: "PRODUCT" };
  const up = /\/up\/(MLBU\d{4,})/i.exec(caminho);
  if (up) return { id: up[1]!.toUpperCase(), tipo: "USER_PRODUCT" };
  for (const chave of ["item_id", "wid"]) {
    const v = u.searchParams.get(chave);
    if (v && /^MLB\d{4,}$/i.test(v)) return { id: v.toUpperCase(), tipo: "ITEM" };
  }
  const item = /(?:^|\/)MLB-?(\d{4,})(?:[-_/]|$)/i.exec(caminho);
  if (item) return { id: `MLB${item[1]}`, tipo: "ITEM" };
  return null;
}

/**
 * Todos os IDs que um link do ML carrega (catálogo, user product, anúncio — inclusive em
 * `pdp_filters=item_id:…` e no `#…&wid=…`). A API só deixa ler catálogo de terceiros; os
 * outros servem para achar o produto nos resultados da busca.
 */
export function extrairIdsMl(url: string | null | undefined): { catalogo: string | null; usuario: string | null; anuncios: string[] } {
  const vazio = { catalogo: null, usuario: null, anuncios: [] as string[] };
  if (!url) return vazio;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return vazio;
  }
  const caminho = decodeURIComponent(u.pathname);
  const catalogo = /\/p\/(MLB\d{4,})/i.exec(caminho)?.[1]?.toUpperCase() ?? null;
  const usuario = /\/up\/(MLBU\d{4,})/i.exec(caminho)?.[1]?.toUpperCase() ?? null;
  const anuncios = new Set<string>();
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  for (const v of [u.searchParams.get("item_id"), u.searchParams.get("wid"), hash.get("wid"), hash.get("item_id")]) {
    if (v && /^MLB\d{4,}$/i.test(v)) anuncios.add(v.toUpperCase());
  }
  const pdp = /item_id:(MLB\d{4,})/i.exec(u.searchParams.get("pdp_filters") ?? "");
  if (pdp) anuncios.add(pdp[1]!.toUpperCase());
  const doCaminho = /(?:^|\/)MLB-?(\d{4,})(?:[-_/]|$)/i.exec(caminho);
  if (doCaminho) anuncios.add(`MLB${doCaminho[1]}`);
  return { catalogo, usuario, anuncios: [...anuncios] };
}

/** Título legível a partir do "slug" do link (…/kit-5-suporte-banheiro-inox/up/MLBU…). */
export function tituloDoLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const partes = decodeURIComponent(new URL(url.trim()).pathname).split("/").filter(Boolean);
    const slug = partes.find((p) => /[a-z]-[a-z]/i.test(p) && !/^MLB/i.test(p)) ?? partes.find((p) => /^MLB-\d+-/i.test(p))?.replace(/^MLB-\d+-/i, "");
    if (!slug) return null;
    const t = slug.replace(/-_JM$/i, "").replace(/[-_]+/g, " ").trim();
    return t.length >= 3 ? t : null;
  } catch {
    return null;
  }
}

/** Atributos que viram destaques (na ordem de preferência). */
const ATRIBUTOS_DESTAQUE = [
  "material",
  "cor",
  "quantidade",
  "capacidade",
  "volume",
  "dimens",
  "largura",
  "altura",
  "comprimento",
  "tamanho",
  "voltagem",
  "potência",
  "peso",
  "modelo",
];
const VALOR_VAZIO = /^(n[ãa]o (se )?aplica|n\/a|-|outro|outros|sim|n[ãa]o)$/i;

export function destaquesDosAtributos(atributos: { name?: string | null; value?: string | null }[], max = 5): string[] {
  const candidatos = atributos
    .map((a) => ({ nome: (a.name ?? "").trim(), valor: (a.value ?? "").trim() }))
    .filter((a) => a.nome && a.valor && !VALOR_VAZIO.test(a.valor) && a.nome.length + a.valor.length <= LIMITES_PAGINA.destaque - 2);
  const out: string[] = [];
  const vistos = new Set<string>();
  // Um destaque por tipo (ex.: "Cor" e "Cor principal" viram um só).
  for (const chave of ATRIBUTOS_DESTAQUE) {
    const a = candidatos.find((c) => c.nome.toLowerCase().includes(chave) && !vistos.has(c.nome.toLowerCase()));
    if (!a) continue;
    vistos.add(a.nome.toLowerCase());
    out.push(`${a.nome}: ${a.valor}`);
    if (out.length >= max) return out;
  }
  return out;
}

export function limparTitulo(t: string): string {
  return t.replace(/\s+/g, " ").trim().slice(0, LIMITES_PAGINA.titulo);
}

/** Só imagens https de hosts conhecidos (CDN do ML ou o Storage informado). */
export function imagemPermitida(url: string, hostsExtras: string[] = []): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return [...HOSTS_IMAGEM_ML, ...hostsExtras].some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function urlPagina(base: string, slug: string): string {
  return `${base.replace(/\/+$/, "")}${PREFIXO_PAGINAS}/${slug}`;
}

/** A URL é uma página nossa (mesmo host da base, caminho /achados/<slug>)? */
export function ehUrlPagina(url: string, base: string): boolean {
  try {
    const u = new URL(url);
    const b = new URL(base);
    if (u.protocol !== "https:" || u.hostname !== b.hostname) return false;
    const m = new RegExp(`^${PREFIXO_PAGINAS}/([^/]+)/?$`).exec(u.pathname);
    return !!m && slugValido(m[1]!);
  } catch {
    return false;
  }
}
