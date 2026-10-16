import "server-only";
import { randomBytes } from "node:crypto";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { validarLinkAfiliado } from "../afiliados/validacao";
import * as ml from "../integracoes/mercadolivre";
import {
  LIMITES_PAGINA,
  destaquesDosAtributos,
  ehUrlPagina,
  extrairIdMl,
  gerarSlug,
  imagemPermitida,
  limparTitulo,
  urlPagina,
} from "../paginas/regras";
import { registrarObservacao } from "./produtos";
import { salvarLinkAfiliado, verificarRedirecionamento } from "./afiliados";
import type { Database } from "../database.types";

type PaginaRow = Database["public"]["Tables"]["ml_paginas"]["Row"];
type Ator = { actorId?: string | null };

export type StatusPagina = "draft" | "published" | "paused";

/**
 * Base pública das páginas. `ML_PAGINAS_BASE_URL` permite servir as páginas num domínio
 * separado (ex.: o da marca Casa Prática) — isola o domínio do app de qualquer bloqueio.
 */
export function basePaginas(): string {
  const env = process.env.ML_PAGINAS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return env.replace(/\/+$/, "");
}

/** Hosts de imagem aceitos além do CDN do ML: o Storage deste projeto. */
export function hostsImagemExtras(): string[] {
  try {
    return [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname].filter(Boolean);
  } catch {
    return [];
  }
}

export interface ImagemPagina {
  url: string;
  alt: string;
}

function imagensDoProduto(p: { pictures: unknown; thumbnail: string | null; title: string }): ImagemPagina[] {
  const fotos = Array.isArray(p.pictures) ? (p.pictures as { url?: unknown }[]) : [];
  const urls = fotos.map((f) => (typeof f.url === "string" ? f.url : "")).filter(Boolean);
  if (!urls.length && p.thumbnail) urls.push(p.thumbnail);
  const extras = hostsImagemExtras();
  return urls
    .map((u) => u.replace(/^http:\/\//, "https://"))
    .filter((u) => imagemPermitida(u, extras))
    .slice(0, LIMITES_PAGINA.imagens)
    .map((url, i) => ({ url, alt: i === 0 ? p.title : `${p.title} — foto ${i + 1}` }));
}

function atributosDoProduto(a: unknown): { name: string; value: string }[] {
  if (!Array.isArray(a)) return [];
  return (a as { name?: unknown; value?: unknown; value_name?: unknown }[]).map((x) => ({
    name: typeof x.name === "string" ? x.name : "",
    value: typeof x.value === "string" ? x.value : typeof x.value_name === "string" ? x.value_name : "",
  }));
}

async function inserirComSlug(dados: Omit<Database["public"]["Tables"]["ml_paginas"]["Insert"], "slug">): Promise<PaginaRow> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = gerarSlug(dados.titulo, randomBytes(3).toString("hex").slice(0, 5));
    const { data, error } = await mlDb().from("ml_paginas").insert({ ...dados, slug }).select("*").single();
    if (!error) return data as PaginaRow;
    if (error.code !== "23505") throw new Error(`Falha ao criar a página: ${error.message}`);
  }
  throw new Error("Não consegui gerar um endereço único para a página. Tente de novo.");
}

/** Produto do ML pelo ID: usa o que já existe no banco ou busca na API e registra. */
export async function produtoPorId(idMl: { id: string; tipo: "PRODUCT" | "USER_PRODUCT" | "ITEM" }): Promise<string> {
  const db = mlDb();
  const { data: existente } = await db.from("ml_products").select("id").or(`external_id.eq.${idMl.id},item_id.eq.${idMl.id}`).limit(1).maybeSingle();
  if (existente) return (existente as { id: string }).id;
  const detalhe = await ml.resolverProduto(idMl.id, idMl.tipo);
  if (!detalhe) throw new Error(`Não consegui ler o produto ${idMl.id} na API do Mercado Livre. Confira o link do produto.`);
  const tipo = idMl.tipo === "PRODUCT" ? "product" : idMl.tipo === "USER_PRODUCT" ? "user_product" : "item";
  const r = await registrarObservacao({ ...detalhe, externalId: idMl.id, externalType: tipo }, { fonte: "manual", categoriaId: detalhe.categoryId });
  return r.id;
}

export interface NovaPagina {
  linkAfiliado: string;
  linkProduto?: string | null;
  publicar: boolean;
}

/**
 * "Criador de páginas": a partir do link de afiliado (+ link do produto quando o link é curto),
 * identifica o produto, monta a página com dados reais do anúncio e devolve a URL para o Pin.
 */
export async function criarPagina(n: NovaPagina, ator: Ator = {}): Promise<{ id: string; slug: string; url: string; status: StatusPagina }> {
  const v = validarLinkAfiliado(n.linkAfiliado);
  if (!v.ok || !v.url) throw new Error(v.erros.join(" ") || "Link de afiliado inválido.");
  if (v.tipo === "simples") throw new Error("Esse link não tem rastreio de afiliado (não gera comissão). Gere o link no painel de afiliados do Mercado Livre.");
  const linkAfiliado = v.url;

  let linkProduto: string | null = null;
  if (n.linkProduto?.trim()) {
    const vp = validarLinkAfiliado(n.linkProduto);
    if (!vp.url || vp.erros.some((e) => e.startsWith("Domínio"))) throw new Error("O link do produto precisa ser do Mercado Livre.");
    linkProduto = vp.url;
  }

  const db = mlDb();
  // 1) Link já cadastrado num produto?
  const { data: linkExistente } = await db.from("ml_affiliate_links").select("id, product_id").eq("affiliate_url", linkAfiliado).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let productId = (linkExistente as { product_id: string } | null)?.product_id ?? null;

  // 2) Senão, pelo ID no link do produto ou no próprio link de afiliado (link longo com rastreio).
  if (!productId) {
    let idMl = extrairIdMl(linkProduto) ?? extrairIdMl(linkAfiliado);
    if (!idMl && (v.tipo === "curto" || v.tipo === "curto_oficial")) {
      const r = await verificarRedirecionamento(linkAfiliado);
      if (!r.ok) throw new Error(`O link de afiliado não leva ao Mercado Livre: ${r.detalhe}`);
      idMl = extrairIdMl(r.destino);
    }
    if (!idMl) {
      throw new Error(
        "Não deu para saber qual é o produto: links curtos (meli.la) levam à sua vitrine de afiliado, não ao anúncio. Cole também o link do produto (a página do anúncio no Mercado Livre).",
      );
    }
    productId = await produtoPorId(idMl);
  }

  const { data: prod } = await db.from("ml_products").select("id, title, pictures, thumbnail, attributes, permalink, external_id").eq("id", productId).single();
  const p = prod as { id: string; title: string; pictures: unknown; thumbnail: string | null; attributes: unknown; permalink: string | null; external_id: string };

  // O produto passa a ter este link de afiliado se ainda não tiver um (criativos e Pins usam o mesmo).
  const { data: ativo } = await db.from("ml_affiliate_links").select("id").eq("product_id", p.id).eq("active", true).maybeSingle();
  let affiliateLinkId = (linkExistente as { id: string } | null)?.id ?? (ativo as { id: string } | null)?.id ?? null;
  if (!ativo) {
    const r = await salvarLinkAfiliado({ productId: p.id, url: linkAfiliado, userId: ator.actorId ?? null, conferirOnline: false });
    if (r.ok) {
      const { data: novo } = await db.from("ml_affiliate_links").select("id").eq("product_id", p.id).eq("active", true).maybeSingle();
      affiliateLinkId = (novo as { id: string } | null)?.id ?? affiliateLinkId;
    }
  }

  const titulo = limparTitulo(p.title);
  const pagina = await inserirComSlug({
    product_id: p.id,
    affiliate_link_id: affiliateLinkId,
    affiliate_url: linkAfiliado,
    product_url: linkProduto ?? p.permalink,
    external_id: p.external_id,
    titulo,
    resumo: null,
    destaques: destaquesDosAtributos(atributosDoProduto(p.attributes)),
    imagens: imagensDoProduto({ ...p, title: titulo }) as unknown as Database["public"]["Tables"]["ml_paginas"]["Insert"]["imagens"],
    status: n.publicar ? "published" : "draft",
    published_at: n.publicar ? new Date().toISOString() : null,
    created_by: ator.actorId ?? null,
  });
  await auditar({ acao: "pagina.criar", entidade: "pagina", entidadeId: pagina.id, actorId: ator.actorId, metadata: { slug: pagina.slug, produto: p.id, publicada: n.publicar } });
  return { id: pagina.id, slug: pagina.slug, url: urlPagina(basePaginas(), pagina.slug), status: pagina.status as StatusPagina };
}

/** Atalho do produto: usa o link de afiliado ativo; reaproveita a página que já existir. */
export async function criarPaginaDoProduto(productId: string, ator: Ator = {}): Promise<{ id: string; slug: string; url: string; status: StatusPagina; existente: boolean }> {
  const db = mlDb();
  const { data: atual } = await db.from("ml_paginas").select("id, slug, status").eq("product_id", productId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (atual) {
    const a = atual as { id: string; slug: string; status: StatusPagina };
    return { ...a, url: urlPagina(basePaginas(), a.slug), existente: true };
  }
  const { data: link } = await db.from("ml_affiliate_links").select("affiliate_url").eq("product_id", productId).eq("active", true).maybeSingle();
  if (!link) throw new Error("Cadastre o link de afiliado do produto antes de criar a página.");
  const { data: prod } = await db.from("ml_products").select("permalink").eq("id", productId).single();
  const r = await criarPagina({ linkAfiliado: (link as { affiliate_url: string }).affiliate_url, linkProduto: (prod as { permalink: string | null }).permalink, publicar: true }, ator);
  return { ...r, existente: false };
}

export interface EdicaoPagina {
  titulo: string;
  resumo: string | null;
  destaques: string[];
  imagens: ImagemPagina[];
  cta: string;
}

export async function editarPagina(id: string, e: EdicaoPagina, ator: Ator = {}): Promise<string> {
  const extras = hostsImagemExtras();
  const ruins = e.imagens.filter((i) => !imagemPermitida(i.url, extras));
  if (ruins.length) throw new Error("Só são aceitas imagens do Mercado Livre ou do Storage do app.");
  const { data, error } = await mlDb()
    .from("ml_paginas")
    .update({
      titulo: limparTitulo(e.titulo),
      resumo: e.resumo?.trim() || null,
      destaques: e.destaques.map((d) => d.trim()).filter(Boolean).slice(0, LIMITES_PAGINA.destaques),
      imagens: e.imagens.slice(0, LIMITES_PAGINA.imagens) as unknown as Database["public"]["Tables"]["ml_paginas"]["Update"]["imagens"],
      cta: e.cta.trim() || "Ver no Mercado Livre",
    })
    .eq("id", id)
    .select("slug")
    .single();
  if (error) throw new Error(`Falha ao salvar a página: ${error.message}`);
  await auditar({ acao: "pagina.editar", entidade: "pagina", entidadeId: id, actorId: ator.actorId });
  return (data as { slug: string }).slug;
}

export async function mudarStatusPagina(id: string, status: StatusPagina, ator: Ator = {}): Promise<string> {
  const patch: Database["public"]["Tables"]["ml_paginas"]["Update"] = { status };
  if (status === "published") patch.published_at = new Date().toISOString();
  const { data, error } = await mlDb().from("ml_paginas").update(patch).eq("id", id).select("slug").single();
  if (error) throw new Error(`Falha ao mudar o status: ${error.message}`);
  await auditar({ acao: `pagina.${status}`, entidade: "pagina", entidadeId: id, actorId: ator.actorId });
  return (data as { slug: string }).slug;
}

/** URL da página publicada do produto (destino preferido do Pin), ou null. */
export async function urlPaginaDoProduto(productId: string): Promise<string | null> {
  const { data } = await mlDb().from("ml_paginas").select("slug").eq("product_id", productId).eq("status", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
  return data ? urlPagina(basePaginas(), (data as { slug: string }).slug) : null;
}

export function ehNossaPagina(url: string): boolean {
  return ehUrlPagina(url, basePaginas());
}

/** Contador de visitas/cliques (só páginas publicadas; sem dado pessoal). */
export async function contarEventoPagina(slug: string, tipo: "visita" | "clique"): Promise<void> {
  await mlDb().rpc("ml_pagina_contar", { p_slug: slug, p_tipo: tipo });
}
