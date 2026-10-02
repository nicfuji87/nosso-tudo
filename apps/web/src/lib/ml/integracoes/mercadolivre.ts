import "server-only";
import { chamarApi, ErroApiExterna } from "../http";
import { gravarSegredo, lerSegredo, mascarar } from "../segredos";
import { ErroPermanente } from "../jobs/erros";
import { abrirPendencia, resolverPendenciasPorChave } from "../servicos/pendencias";
import { atualizarIntegracao, lerIntegracao, mesclarHints } from "./estado";
import { obterTokenValido } from "./tokens";

/**
 * Adapter Mercado Livre (site MLB). Ver docs/ml/REFERENCIAS-APIS.md.
 * - OAuth com PKCE S256; refresh token de uso único (rotaciona) — serializado.
 * - Leitura de itens de terceiros pode dar 403: tratado como "indisponível", não erro.
 * - IDs sempre string.
 */
const API = "https://api.mercadolibre.com";
const AUTH = "https://auth.mercadolivre.com.br/authorization";
export const SITE = "MLB";
const PROVIDER = "mercadolivre";

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
export async function urlAutorizacao(p: { state: string; challenge: string; redirectUri: string }): Promise<string> {
  const integ = await lerIntegracao(PROVIDER);
  const clientId = integ.config.client_id as string | undefined;
  if (!clientId) throw new ErroPermanente("Informe o App ID (client_id) do Mercado Livre antes de conectar.");
  const u = new URL(AUTH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

interface RespostaToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  user_id?: number | string;
}

async function credenciais(): Promise<{ clientId: string; clientSecret: string }> {
  const integ = await lerIntegracao(PROVIDER);
  const clientId = integ.config.client_id as string | undefined;
  const clientSecret = await lerSegredo(PROVIDER, "client_secret");
  if (!clientId || !clientSecret) {
    throw new ErroPermanente("App ID e Secret Key do Mercado Livre não configurados (Integrações).");
  }
  return { clientId, clientSecret };
}

async function salvarTokens(t: RespostaToken): Promise<void> {
  await gravarSegredo(PROVIDER, "access_token", t.access_token);
  if (t.refresh_token) await gravarSegredo(PROVIDER, "refresh_token", t.refresh_token);
  await atualizarIntegracao(PROVIDER, {
    access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    // refresh do ML vale 6 meses a partir da emissão
    refresh_expires_at: t.refresh_token ? new Date(Date.now() + 180 * 86_400_000).toISOString() : undefined,
    last_refresh_at: new Date().toISOString(),
    scopes: t.scope ? t.scope.split(/\s+/) : undefined,
    status: "connected",
    last_error: null,
  });
}

export async function trocarCodigo(code: string, verifier: string | null, redirectUri: string): Promise<void> {
  const { clientId, clientSecret } = await credenciais();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  if (verifier) body.set("code_verifier", verifier);
  const { data } = await chamarApi<RespostaToken>({
    provider: PROVIDER,
    operation: "oauth.token",
    method: "POST",
    url: `${API}/oauth/token`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  await salvarTokens(data);
  const me = await usuarioAtual();
  await atualizarIntegracao(PROVIDER, {
    account_id: String(me.id),
    account_name: me.nickname ?? null,
    connected_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  });
  await resolverPendenciasPorChave("integration_auth:mercadolivre");
}

export async function renovarToken(): Promise<void> {
  const { clientId, clientSecret } = await credenciais();
  const refresh = await lerSegredo(PROVIDER, "refresh_token");
  if (!refresh) throw new ErroPermanente("Sem refresh token do Mercado Livre — reconecte.");
  try {
    const { data } = await chamarApi<RespostaToken>({
      provider: PROVIDER,
      operation: "oauth.refresh",
      method: "POST",
      url: `${API}/oauth/token`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
      }),
    });
    await salvarTokens(data);
  } catch (e) {
    if (e instanceof ErroApiExterna && (e.status === 400 || e.status === 401)) {
      await atualizarIntegracao(PROVIDER, { status: "error", last_error: "Sessão expirada ou revogada. Reconecte o Mercado Livre." });
      await abrirPendencia({
        tipo: "integration_auth",
        titulo: "Reconectar Mercado Livre",
        detalhe: "A autorização expirou ou foi revogada. Clique em Reconectar em Integrações.",
        dedupeKey: "integration_auth:mercadolivre",
        prioridade: 5,
      });
      throw new ErroPermanente("Autorização do Mercado Livre expirou — reconecte em Integrações.");
    }
    throw e;
  }
}

export async function desconectar(): Promise<void> {
  await gravarSegredo(PROVIDER, "access_token", null);
  await gravarSegredo(PROVIDER, "refresh_token", null);
  await atualizarIntegracao(PROVIDER, {
    status: "disconnected",
    account_id: null,
    account_name: null,
    access_expires_at: null,
    refresh_expires_at: null,
    connected_at: null,
    last_error: null,
  });
}

export async function salvarCredenciaisApp(clientId: string, clientSecret?: string): Promise<void> {
  const integ = await lerIntegracao(PROVIDER);
  await atualizarIntegracao(PROVIDER, { config: { ...integ.config, client_id: clientId.trim() } });
  if (clientSecret) {
    await gravarSegredo(PROVIDER, "client_secret", clientSecret.trim());
    await mesclarHints(PROVIDER, { client_secret: mascarar(clientSecret.trim()) });
  }
}

// ---------------------------------------------------------------------------
// Chamadas autenticadas
// ---------------------------------------------------------------------------
async function api<T>(operation: string, caminho: string, opcoes: { semLog?: boolean; timeoutMs?: number } = {}): Promise<T> {
  let token = await obterTokenValido(PROVIDER, renovarToken);
  try {
    const { data } = await chamarApi<T>({
      provider: PROVIDER,
      operation,
      url: `${API}${caminho}`,
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: opcoes.timeoutMs ?? 20_000,
      semLog: opcoes.semLog,
    });
    return data;
  } catch (e) {
    // 401 com token "válido" = revogado/rotacionado fora daqui: força 1 refresh.
    if (e instanceof ErroApiExterna && e.status === 401) {
      await atualizarIntegracao(PROVIDER, { access_expires_at: new Date(0).toISOString() });
      token = await obterTokenValido(PROVIDER, renovarToken);
      const { data } = await chamarApi<T>({
        provider: PROVIDER,
        operation,
        url: `${API}${caminho}`,
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: opcoes.timeoutMs ?? 20_000,
      });
      return data;
    }
    throw e;
  }
}

/** 403/404 viram null (dado indisponível para este token), demais erros sobem. */
async function apiOuNulo<T>(operation: string, caminho: string): Promise<T | null> {
  try {
    return await api<T>(operation, caminho);
  } catch (e) {
    if (e instanceof ErroApiExterna && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

export interface UsuarioML {
  id: number | string;
  nickname?: string;
  site_id?: string;
}
export const usuarioAtual = () => api<UsuarioML>("users.me", "/users/me");

export interface CategoriaML {
  id: string;
  name: string;
  path_from_root?: { id: string; name: string }[];
  children_categories?: { id: string; name: string; total_items_in_this_category?: number }[];
  total_items_in_this_category?: number;
}
export const categoriasRaiz = () => api<{ id: string; name: string }[]>("categories.root", `/sites/${SITE}/categories`);
export const categoria = (id: string) => api<CategoriaML>("categories.get", `/categories/${encodeURIComponent(id)}`);

export interface HighlightML {
  id: string;
  position: number;
  type: "ITEM" | "PRODUCT" | "USER_PRODUCT" | string;
}
/** Mais vendidos da categoria (até 20). null = categoria sem ranking (ex.: não-folha). */
export async function maisVendidos(categoriaId: string): Promise<HighlightML[] | null> {
  const r = await apiOuNulo<{ content?: HighlightML[] }>("highlights.category", `/highlights/${SITE}/category/${encodeURIComponent(categoriaId)}`);
  return r ? (r.content ?? []) : null;
}

export interface TendenciaML {
  keyword: string;
  url?: string;
}
export async function tendencias(categoriaId?: string | null): Promise<TendenciaML[]> {
  const caminho = categoriaId ? `/trends/${SITE}/${encodeURIComponent(categoriaId)}` : `/trends/${SITE}`;
  return (await apiOuNulo<TendenciaML[]>("trends", caminho)) ?? [];
}

/** Tipo da tendência pela posição (doc oficial: 1–10, 11–30, 31–50). */
export function tipoTendencia(posicao: number): "fastest_growing" | "most_wanted" | "popular" {
  if (posicao <= 10) return "fastest_growing";
  if (posicao <= 30) return "most_wanted";
  return "popular";
}

// ---------------------------------------------------------------------------
// Produto normalizado
// ---------------------------------------------------------------------------
export interface ImagemML {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface ProdutoML {
  externalId: string;
  externalType: "item" | "product" | "user_product";
  itemId: string | null;
  catalogProductId: string | null;
  title: string;
  permalink: string | null;
  categoryId: string | null;
  domainId: string | null;
  brand: string | null;
  thumbnail: string | null;
  pictures: ImagemML[];
  attributes: { id: string; name: string; value: string }[];
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string;
  available: boolean | null;
  availabilityReason: string | null;
  condition: string | null;
  freeShipping: boolean | null;
  seller: { id: string } | null;
  soldQuantity: number | null;
  fonteParcial: boolean; // algum dado não pôde ser lido (403)
}

const https = (u: string | null | undefined) => (u ? u.replace(/^http:\/\//, "https://") : null);

function dimensao(s: string | undefined | null): { w: number | null; h: number | null } {
  const m = /^(\d+)x(\d+)$/.exec(s ?? "");
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: null, h: null };
}

interface AtributoBruto {
  id: string;
  name: string;
  value_name?: string | null;
  values?: { name?: string | null }[];
}
function atributos(attrs: AtributoBruto[] | undefined): ProdutoML["attributes"] {
  return (attrs ?? [])
    .map((a) => ({ id: a.id, name: a.name, value: a.value_name ?? a.values?.[0]?.name ?? "" }))
    .filter((a) => a.value)
    .slice(0, 40);
}

interface ItemBruto {
  id: string;
  title: string;
  permalink?: string;
  category_id?: string;
  domain_id?: string;
  catalog_product_id?: string | null;
  thumbnail?: string;
  pictures?: { url?: string; secure_url?: string; max_size?: string; size?: string }[];
  attributes?: AtributoBruto[];
  price?: number;
  original_price?: number | null;
  currency_id?: string;
  status?: string;
  available_quantity?: number;
  sold_quantity?: number;
  condition?: string;
  shipping?: { free_shipping?: boolean };
  seller_id?: number | string;
}

export function normalizarItem(i: ItemBruto): ProdutoML {
  const ativo = i.status ? i.status === "active" : null;
  return {
    externalId: i.id,
    externalType: "item",
    itemId: i.id,
    catalogProductId: i.catalog_product_id ?? null,
    title: i.title,
    permalink: https(i.permalink) ?? `https://produto.mercadolivre.com.br/${i.id.replace(/^MLB/, "MLB-")}`,
    categoryId: i.category_id ?? null,
    domainId: i.domain_id ?? null,
    brand: atributos(i.attributes).find((a) => a.id === "BRAND")?.value ?? null,
    thumbnail: https(i.thumbnail),
    pictures: (i.pictures ?? [])
      .map((p) => {
        const d = dimensao(p.max_size ?? p.size);
        return { url: https(p.secure_url ?? p.url) ?? "", width: d.w, height: d.h };
      })
      .filter((p) => p.url),
    attributes: atributos(i.attributes),
    description: null,
    price: i.price ?? null,
    originalPrice: i.original_price ?? null,
    currency: i.currency_id ?? "BRL",
    available: ativo == null ? null : ativo && (i.available_quantity ?? 1) > 0,
    availabilityReason: ativo === false ? `status ${i.status}` : null,
    condition: i.condition ?? null,
    freeShipping: i.shipping?.free_shipping ?? null,
    seller: i.seller_id != null ? { id: String(i.seller_id) } : null,
    soldQuantity: i.sold_quantity ?? null,
    fonteParcial: false,
  };
}

interface ProdutoBruto {
  id: string;
  name: string;
  status?: string;
  domain_id?: string;
  permalink?: string;
  pictures?: { url?: string; max_width?: number; max_height?: number }[] | null;
  attributes?: AtributoBruto[];
  short_description?: { content?: string } | null;
  buy_box_winner?: {
    item_id?: string;
    category_id?: string;
    seller_id?: number | string;
    price?: number;
    original_price?: number | null;
    currency_id?: string;
    condition?: string;
    shipping?: { free_shipping?: boolean };
  } | null;
}

export function normalizarProdutoCatalogo(p: ProdutoBruto): ProdutoML {
  const bb = p.buy_box_winner ?? null;
  const ativo = p.status ? p.status === "active" : null;
  const pictures = (p.pictures ?? [])
    .map((x) => ({ url: https(x.url) ?? "", width: x.max_width ?? null, height: x.max_height ?? null }))
    .filter((x) => x.url);
  return {
    externalId: p.id,
    externalType: "product",
    itemId: bb?.item_id ?? null,
    catalogProductId: p.id,
    title: p.name,
    permalink: https(p.permalink) ?? `https://www.mercadolivre.com.br/p/${p.id}`,
    categoryId: bb?.category_id ?? null,
    domainId: p.domain_id ?? null,
    brand: atributos(p.attributes).find((a) => a.id === "BRAND")?.value ?? null,
    thumbnail: pictures[0]?.url ?? null,
    pictures,
    attributes: atributos(p.attributes),
    description: p.short_description?.content ?? null,
    price: bb?.price ?? null,
    originalPrice: bb?.original_price ?? null,
    currency: bb?.currency_id ?? "BRL",
    available: ativo === false ? false : bb ? true : null,
    availabilityReason: ativo === false ? "produto inativo no catálogo" : !bb ? "sem vendedor ganhando a compra" : null,
    condition: bb?.condition ?? null,
    freeShipping: bb?.shipping?.free_shipping ?? null,
    seller: bb?.seller_id != null ? { id: String(bb.seller_id) } : null,
    soldQuantity: null,
    fonteParcial: !bb,
  };
}

interface UserProductBruto {
  id: string;
  name: string;
  domain_id?: string;
  catalog_product_id?: string | null;
  pictures?: { secure_url?: string; url?: string }[];
  thumbnail?: { secure_url?: string } | null;
  attributes?: AtributoBruto[];
  user_id?: number | string;
}

export function normalizarUserProduct(u: UserProductBruto): ProdutoML {
  const pictures = (u.pictures ?? []).map((x) => ({ url: https(x.secure_url ?? x.url) ?? "" })).filter((x) => x.url);
  return {
    externalId: u.id,
    externalType: "user_product",
    itemId: null,
    catalogProductId: u.catalog_product_id ?? null,
    title: u.name,
    permalink: u.catalog_product_id ? `https://www.mercadolivre.com.br/p/${u.catalog_product_id}` : null,
    categoryId: null,
    domainId: u.domain_id ?? null,
    brand: atributos(u.attributes).find((a) => a.id === "BRAND")?.value ?? null,
    thumbnail: https(u.thumbnail?.secure_url) ?? pictures[0]?.url ?? null,
    pictures,
    attributes: atributos(u.attributes),
    description: null,
    price: null,
    originalPrice: null,
    currency: "BRL",
    available: null,
    availabilityReason: null,
    condition: null,
    freeShipping: null,
    seller: u.user_id != null ? { id: String(u.user_id) } : null,
    soldQuantity: null,
    fonteParcial: true,
  };
}

export async function item(id: string): Promise<ProdutoML | null> {
  const i = await apiOuNulo<ItemBruto>("items.get", `/items/${encodeURIComponent(id)}`);
  return i ? normalizarItem(i) : null;
}

/** Vários itens: `/items/bulk` (novo) com fallback para `/items?ids=` (deprecado em 25/10/2026). */
export async function itens(ids: string[]): Promise<Map<string, ProdutoML>> {
  const out = new Map<string, ProdutoML>();
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20).map(encodeURIComponent).join(",");
    let resp = await apiOuNulo<{ status_code?: number; code?: number; id?: string; body?: ItemBruto }[]>("items.bulk", `/items/bulk?ids=${lote}`);
    if (!resp) resp = await apiOuNulo("items.multiget", `/items?ids=${lote}`);
    for (const r of resp ?? []) {
      const status = r.status_code ?? r.code;
      if (status === 200 && r.body) out.set(r.body.id, normalizarItem(r.body));
    }
  }
  return out;
}

export async function produtoCatalogo(id: string): Promise<ProdutoML | null> {
  const p = await apiOuNulo<ProdutoBruto>("products.get", `/products/${encodeURIComponent(id)}`);
  return p ? normalizarProdutoCatalogo(p) : null;
}

export async function userProduct(id: string): Promise<ProdutoML | null> {
  const u = await apiOuNulo<UserProductBruto>("user_products.get", `/user-products/${encodeURIComponent(id)}`);
  return u ? normalizarUserProduct(u) : null;
}

export interface AvaliacoesML {
  rating: number | null;
  total: number | null;
}
export async function avaliacoes(itemId: string, catalogProductId?: string | null): Promise<AvaliacoesML | null> {
  const qs = new URLSearchParams({ limit: "1", offset: "0" });
  if (catalogProductId) qs.set("catalog_product_id", catalogProductId);
  const r = await apiOuNulo<{ rating_average?: number; paging?: { total?: number } }>(
    "reviews.item",
    `/reviews/item/${encodeURIComponent(itemId)}?${qs}`,
  );
  if (!r) return null;
  return { rating: r.rating_average ?? null, total: r.paging?.total ?? null };
}

/** Resolve qualquer tipo do highlights para um produto normalizado. */
export async function resolverProduto(id: string, tipo: string): Promise<ProdutoML | null> {
  if (tipo === "PRODUCT") return produtoCatalogo(id);
  if (tipo === "USER_PRODUCT") {
    const up = await userProduct(id);
    if (up?.catalogProductId) {
      const cat = await produtoCatalogo(up.catalogProductId);
      if (cat) return { ...cat, externalId: up.externalId, externalType: "user_product" };
    }
    return up;
  }
  const it = await item(id);
  if (it?.catalogProductId && it.pictures.length === 0) {
    const cat = await produtoCatalogo(it.catalogProductId);
    if (cat) return { ...it, pictures: cat.pictures, attributes: cat.attributes, description: cat.description };
  }
  return it;
}

/** Teste de conexão barato (usado no diagnóstico e no botão "Testar"). */
export async function testarConexao(): Promise<{ ok: true; conta: string } | { ok: false; erro: string }> {
  try {
    const me = await usuarioAtual();
    await atualizarIntegracao(PROVIDER, {
      last_checked_at: new Date().toISOString(),
      account_id: String(me.id),
      account_name: me.nickname ?? null,
      status: "connected",
      last_error: null,
    });
    return { ok: true, conta: me.nickname ?? String(me.id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await atualizarIntegracao(PROVIDER, { last_checked_at: new Date().toISOString(), last_error: msg });
    return { ok: false, erro: msg };
  }
}

/** Busca no catálogo (endpoint oficial de produtos) — usada para transformar tendências em produtos. */
export async function buscarCatalogo(q: string, limite = 5): Promise<string[]> {
  const qs = new URLSearchParams({ status: "active", site_id: SITE, q, limit: String(Math.min(limite, 20)) });
  const r = await apiOuNulo<{ results?: { id?: string }[] }>("products.search", `/products/search?${qs}`);
  return (r?.results ?? []).map((x) => x.id).filter((x): x is string => Boolean(x));
}
