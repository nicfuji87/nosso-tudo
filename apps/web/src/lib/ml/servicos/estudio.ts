import "server-only";
import { z } from "zod";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { lerConfig } from "../config";
import { enfileirar } from "../jobs/fila";
import { ErroPermanente } from "../jobs/erros";
import type { CtxJob } from "../jobs/executor";
import * as ml from "../integracoes/mercadolivre";
import * as apify from "../integracoes/apify";
import * as openai from "../integracoes/openai";
import * as pinterest from "../integracoes/pinterest";
import { validarLinkAfiliado } from "../afiliados/validacao";
import { baixarImagem, salvarAsset, variante } from "../media/storage";
import { comDisclosure, LIMITES_PIN } from "../conteudo/guardrails";
import { extrairIdsMl, imagemPermitida, tituloDoLink } from "../paginas/regras";
import { acharDoLink, normalizarResultados, termoDoTitulo, type ResultadoBusca } from "../estudio/busca";
import { hostsImagemExtras, produtoPorId } from "./paginas";
import { registrarObservacao } from "./produtos";
import { verificarRedirecionamento, salvarLinkAfiliado } from "./afiliados";
import { mudarStatusCriativo } from "./criativos";
import { criarPin } from "./publicacao";

type Ator = { actorId?: string | null };

/** Quantas imagens o Estúdio gera por vez. */
export const IMAGENS_POR_VEZ = 3;
const CACHE_BUSCA_HORAS = 6;

// ---------------------------------------------------------------------------
// 1. Busca
// ---------------------------------------------------------------------------

/** Palavra-chave ou link do ML → busca (job com o Apify). Reaproveita a mesma busca feita há pouco. */
export async function iniciarBusca(entrada: string, ator: Ator = {}): Promise<{ buscaId: string; jobId: string | null; reaproveitada: boolean }> {
  const bruto = entrada.trim();
  if (bruto.length < 2) throw new Error("Digite uma palavra-chave ou cole o link do produto.");
  let termo = bruto.slice(0, 200);
  let origemLink: string | null = null;
  let produtoRef: Record<string, unknown> | null = null;

  if (/^https?:\/\/|^(www\.)?(mercadoli(vre|bre)|meli\.la)/i.test(bruto)) {
    const v = validarLinkAfiliado(bruto);
    if (!v.url || v.erros.some((e) => e.startsWith("Domínio"))) throw new Error("Esse link não é do Mercado Livre.");
    origemLink = v.url;
    let destino = v.url;
    if (v.tipo === "curto" || v.tipo === "curto_oficial") {
      const r = await verificarRedirecionamento(v.url);
      if (r.destino) destino = r.destino;
    }
    const ids = extrairIdsMl(destino);
    // A API do ML só deixa ler produto de CATÁLOGO de terceiros (anúncio e user product dão 403):
    // o título vem do catálogo quando dá, senão do próprio link.
    let titulo: string | null = null;
    let imagem: string | null = null;
    let preco: number | null = null;
    if (ids.catalogo) {
      const p = await ml.resolverProduto(ids.catalogo, "PRODUCT").catch(() => null);
      if (p) {
        titulo = p.title;
        imagem = p.pictures[0]?.url ?? p.thumbnail;
        preco = p.price;
      }
    }
    titulo ??= tituloDoLink(destino);
    if (!titulo || (!ids.catalogo && !ids.usuario && !ids.anuncios.length)) {
      throw new Error("Não deu para identificar o produto. Cole o link da página do anúncio no Mercado Livre (links meli.la levam à sua vitrine, não ao produto).");
    }
    termo = termoDoTitulo(titulo);
    produtoRef = { ids, titulo, imagem, preco, resultado: null };
  }

  const db = mlDb();
  if (!origemLink) {
    const desde = new Date(Date.now() - CACHE_BUSCA_HORAS * 3_600_000).toISOString();
    const { data: recente } = await db
      .from("ml_estudio_buscas")
      .select("id, job_id, status")
      .ilike("termo", termo)
      .in("status", ["queued", "running", "done"])
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recente) {
      const r = recente as { id: string; job_id: string | null };
      return { buscaId: r.id, jobId: r.job_id, reaproveitada: true };
    }
  }

  const { data, error } = await db
    .from("ml_estudio_buscas")
    .insert({ termo, origem_link: origemLink, produto_ref: produtoRef as never, created_by: ator.actorId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao iniciar a busca: ${error.message}`);
  const buscaId = (data as { id: string }).id;
  const { job } = await enfileirar({ tipo: "ESTUDIO_BUSCAR", payload: { busca_id: buscaId }, idempotencyKey: `estudio-busca:${buscaId}`, criadoPor: ator.actorId ?? null });
  await db.from("ml_estudio_buscas").update({ job_id: job.id }).eq("id", buscaId);
  return { buscaId, jobId: job.id, reaproveitada: false };
}

/** Handler ESTUDIO_BUSCAR: roda o actor (retomável) e guarda os resultados normalizados. */
export async function executarBusca(buscaId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const db = mlDb();
  const { data } = await db.from("ml_estudio_buscas").select("termo, produto_ref").eq("id", buscaId).maybeSingle();
  if (!data) throw new ErroPermanente("Busca não encontrada.");
  if (!(await apify.configurada())) {
    await db.from("ml_estudio_buscas").update({ status: "error", erro: "Conecte o Apify em Integrações para buscar com vendidos e avaliações." }).eq("id", buscaId);
    throw new ErroPermanente("Apify não configurado.");
  }
  await db.from("ml_estudio_buscas").update({ status: "running" }).eq("id", buscaId);
  try {
    const itens = await apify.rodarActor({
      vars: { titulo: (data as { termo: string }).termo },
      runIdExistente: (ctx.job.progress?.apify_run_id as string | undefined) ?? null,
      salvarRunId: (runId) => ctx.progresso({ apify_run_id: runId }),
      maxItens: 60,
    });
    const resultados = normalizarResultados(itens);
    const patch: Record<string, unknown> = { status: "done", resultados, erro: null };
    const ref = (data as { produto_ref: { ids?: Parameters<typeof acharDoLink>[1] } | null }).produto_ref;
    if (ref?.ids) {
      const achado = acharDoLink(resultados, ref.ids);
      if (achado) patch.produto_ref = { ...ref, titulo: achado.titulo, imagem: achado.imagem, preco: achado.preco, resultado: achado };
    }
    await db.from("ml_estudio_buscas").update(patch as never).eq("id", buscaId);
    return { resultados: resultados.length };
  } catch (e) {
    if (e instanceof Error && e.name === "ErroAguardar") throw e;
    await db.from("ml_estudio_buscas").update({ status: "error", erro: e instanceof Error ? e.message : String(e) }).eq("id", buscaId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 2. Produto escolhido
// ---------------------------------------------------------------------------

export interface ProdutoEstudio {
  productId: string;
  titulo: string;
  fotos: string[];
  linkProduto: string | null;
  linkAfiliado: string | null;
}

/** Registra (ou acha) o produto escolhido e devolve fotos e link de afiliado salvo. */
export async function selecionarProduto(r: ResultadoBusca): Promise<ProdutoEstudio> {
  const db = mlDb();
  let productId: string | null = null;
  if (r.idCatalogo) productId = await produtoPorId({ id: r.idCatalogo, tipo: "PRODUCT" }).catch(() => null);
  if (!productId) productId = await produtoDaBusca(r);
  // Sinais da busca (o ML não expõe vendidos na API oficial).
  const patch: Record<string, unknown> = {};
  if (r.vendidos != null) patch.sold_quantity = Math.round(r.vendidos);
  if (r.avaliacao != null) patch.rating = r.avaliacao;
  if (r.numAvaliacoes != null) patch.reviews_count = Math.round(r.numAvaliacoes);
  if (Object.keys(patch).length) await db.from("ml_products").update(patch).eq("id", productId);
  return lerProdutoEstudio(productId, r.link);
}

/**
 * Produto sem catálogo (anúncio/user product de terceiro): a API do ML recusa a leitura (403),
 * então o produto é registrado com os dados da própria busca.
 */
async function produtoDaBusca(r: ResultadoBusca): Promise<string> {
  const externalId = r.idAnuncio ?? r.idUsuario ?? r.id;
  const { data: existente } = await mlDb()
    .from("ml_products")
    .select("id")
    .or([`external_id.eq.${externalId}`, r.idAnuncio ? `item_id.eq.${r.idAnuncio}` : null].filter(Boolean).join(","))
    .limit(1)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;
  const p: ml.ProdutoML = {
    externalId,
    externalType: r.idAnuncio ? "item" : "user_product",
    itemId: r.idAnuncio,
    catalogProductId: r.idCatalogo,
    title: r.titulo,
    permalink: r.link,
    categoryId: r.categoriaId,
    domainId: null,
    brand: r.marca,
    thumbnail: r.imagem,
    pictures: r.imagem ? [{ url: r.imagem }] : [],
    attributes: [],
    description: null,
    price: r.preco,
    originalPrice: r.precoAnterior,
    currency: "BRL",
    available: true,
    availabilityReason: null,
    condition: null,
    freeShipping: r.freteGratis,
    seller: null,
    soldQuantity: r.vendidos,
    fonteParcial: true,
  };
  // ml_products.category_id é FK: garante a categoria (o nome vem depois, na sincronização).
  if (r.categoriaId) await mlDb().from("ml_categories").upsert({ id: r.categoriaId, name: r.categoriaId }, { onConflict: "id", ignoreDuplicates: true });
  const reg = await registrarObservacao(p, { fonte: "manual", categoriaId: r.categoriaId });
  return reg.id;
}

export async function lerProdutoEstudio(productId: string, linkProduto?: string | null): Promise<ProdutoEstudio> {
  const db = mlDb();
  const [{ data: p }, { data: l }] = await Promise.all([
    db.from("ml_products").select("title, pictures, thumbnail, permalink").eq("id", productId).single(),
    db.from("ml_affiliate_links").select("affiliate_url").eq("product_id", productId).eq("active", true).maybeSingle(),
  ]);
  const prod = p as { title: string; pictures: unknown; thumbnail: string | null; permalink: string | null };
  const extras = hostsImagemExtras();
  const fotos = (Array.isArray(prod.pictures) ? (prod.pictures as { url?: unknown }[]) : [])
    .map((f) => (typeof f.url === "string" ? f.url.replace(/^http:\/\//, "https://") : ""))
    .filter((u) => u && imagemPermitida(u, extras));
  if (!fotos.length && prod.thumbnail) fotos.push(prod.thumbnail.replace(/^http:\/\//, "https://"));
  return {
    productId,
    titulo: prod.title,
    fotos: fotos.slice(0, 12),
    linkProduto: linkProduto ?? prod.permalink,
    linkAfiliado: (l as { affiliate_url: string } | null)?.affiliate_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// 3. Prompts salvos e geração das imagens
// ---------------------------------------------------------------------------

export function renderizarPrompt(texto: string, produto: string): string {
  return texto.replace(/\{produto\}/g, produto).trim();
}

export async function salvarPrompt(p: { id?: string | null; nome: string; texto: string }, ator: Ator = {}): Promise<string> {
  const db = mlDb();
  if (p.id) {
    const { error } = await db.from("ml_estudio_prompts").update({ nome: p.nome, texto: p.texto }).eq("id", p.id);
    if (error) throw new Error(error.message);
    return p.id;
  }
  const { data, error } = await db.from("ml_estudio_prompts").insert({ nome: p.nome, texto: p.texto, created_by: ator.actorId ?? null }).select("id").single();
  if (error) throw new Error(error.message);
  await auditar({ acao: "estudio.prompt_salvo", entidade: "prompt", entidadeId: (data as { id: string }).id, actorId: ator.actorId });
  return (data as { id: string }).id;
}

export async function excluirPrompt(id: string): Promise<void> {
  const { error } = await mlDb().from("ml_estudio_prompts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Cria o criativo e enfileira as 3 imagens em paralelo (cada uma é um job). */
export async function gerarImagens(
  p: { productId: string; imagemReferencia: string; promptTexto: string; promptId?: string | null },
  ator: Ator = {},
): Promise<{ creativeId: string; jobIds: string[] }> {
  if (!(await openai.configurada())) throw new Error("Conecte a OpenAI em Integrações para gerar imagens.");
  if (!imagemPermitida(p.imagemReferencia, hostsImagemExtras())) throw new Error("Imagem de referência de origem não permitida.");
  const db = mlDb();
  const { data: prod } = await db.from("ml_products").select("title").eq("id", p.productId).single();
  const prompt = renderizarPrompt(p.promptTexto, (prod as { title: string }).title);
  const { data, error } = await db
    .from("ml_creatives")
    .insert({
      product_id: p.productId,
      image_mode: "api",
      image_prompt: prompt,
      reference_image_url: p.imagemReferencia,
      status: "generating",
      copy_status: "none",
      image_status: "generating",
      ai_modified: true,
      created_by: ator.actorId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar o criativo: ${error.message}`);
  const creativeId = (data as { id: string }).id;
  const jobIds: string[] = [];
  for (let i = 1; i <= IMAGENS_POR_VEZ; i++) {
    const { job } = await enfileirar({
      tipo: "ESTUDIO_GERAR_IMAGEM",
      payload: { creative_id: creativeId, indice: i },
      idempotencyKey: `estudio-img:${creativeId}:${i}`,
      entidade: { tipo: "creative", id: creativeId },
      criadoPor: ator.actorId ?? null,
    });
    jobIds.push(job.id);
  }
  if (p.promptId) {
    const { data: pr } = await db.from("ml_estudio_prompts").select("usos").eq("id", p.promptId).maybeSingle();
    if (pr) await db.from("ml_estudio_prompts").update({ usos: ((pr as { usos: number }).usos ?? 0) + 1, ultimo_uso: new Date().toISOString() }).eq("id", p.promptId);
  }
  await auditar({ acao: "estudio.gerar_imagens", entidade: "creative", entidadeId: creativeId, actorId: ator.actorId, metadata: { produto: p.productId, prompt_id: p.promptId ?? null } });
  return { creativeId, jobIds };
}

/** Handler ESTUDIO_GERAR_IMAGEM: uma imagem a partir da foto de referência + prompt. */
export async function gerarUmaImagem(creativeId: string, indice: number, ctx: CtxJob): Promise<Record<string, unknown>> {
  const db = mlDb();
  const { data } = await db.from("ml_creatives").select("image_prompt, reference_image_url, status").eq("id", creativeId).maybeSingle();
  const c = data as { image_prompt: string | null; reference_image_url: string | null; status: string } | null;
  if (!c?.image_prompt || !c.reference_image_url) throw new ErroPermanente("Criativo sem prompt ou referência.");
  const ia = await lerConfig("ia");
  // mlstatic serve a mesma foto em JPG (mais compatível como referência que o WEBP).
  const ref = await baixarImagem(variante(c.reference_image_url)).catch(() => baixarImagem(c.reference_image_url!));
  await ctx.log("info", `Gerando imagem ${indice}/${IMAGENS_POR_VEZ}`, { evento: "imagem_gerada" });
  const g = await openai.gerarImagem({ modelo: ia.modelo_imagem, prompt: c.image_prompt, qualidade: ia.qualidade_imagem, referencias: [ref] });
  const a = await salvarAsset({ creativeId, bytes: g.bytes, modo: "api", prompt: c.image_prompt, modelo: g.modelo, kind: "final" });
  const { count } = await db.from("ml_creative_assets").select("id", { count: "exact", head: true }).eq("creative_id", creativeId).eq("kind", "final");
  if ((count ?? 0) >= IMAGENS_POR_VEZ && c.status === "generating") {
    await db.from("ml_creatives").update({ status: "review", image_status: "ready" }).eq("id", creativeId).eq("status", "generating");
  }
  return { asset: a.id, indice };
}

export async function imagensDoCriativo(creativeId: string): Promise<{ id: string; url: string }[]> {
  const { data } = await mlDb().from("ml_creative_assets").select("id, public_url").eq("creative_id", creativeId).eq("kind", "final").order("created_at");
  return ((data ?? []) as { id: string; public_url: string }[]).map((a) => ({ id: a.id, url: a.public_url }));
}

// ---------------------------------------------------------------------------
// 4. Textos do Pin
// ---------------------------------------------------------------------------

const textosSchema = z.object({
  titulo: z.string().min(5).max(LIMITES_PIN.titulo),
  descricao: z.string().min(20).max(480),
  alt_text: z.string().min(10).max(LIMITES_PIN.altText),
  board: z.string().nullable(),
});
const textosJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "descricao", "alt_text", "board"],
  properties: {
    titulo: { type: "string", description: "Título do Pin, até 90 caracteres, com a palavra-chave principal." },
    descricao: { type: "string", description: "2 a 3 frases sobre o uso no dia a dia, até 450 caracteres, sem preço." },
    alt_text: { type: "string", description: "Descrição objetiva do que aparece na imagem, para acessibilidade." },
    board: { type: ["string", "null"], description: "Nome exato do board mais adequado da lista, ou null." },
  },
} as const;

export interface TextosPin {
  titulo: string;
  descricao: string;
  altText: string;
  boardId: string | null;
}

/** Escolhe a imagem e gera título, descrição, alt text e board sugerido (IA vê a imagem escolhida). */
export async function escolherImagemEGerarTextos(creativeId: string, assetId: string, ator: Ator = {}): Promise<TextosPin> {
  const db = mlDb();
  const { data: a } = await db.from("ml_creative_assets").select("id, public_url").eq("id", assetId).eq("creative_id", creativeId).maybeSingle();
  if (!a) throw new Error("Imagem não pertence a este criativo.");
  const { data: cr } = await db.from("ml_creatives").select("product_id, status").eq("id", creativeId).single();
  const c = cr as { product_id: string; status: string };
  await db.from("ml_creatives").update({ current_asset_id: assetId, image_status: "ready" }).eq("id", creativeId);
  if (c.status === "generating") await db.from("ml_creatives").update({ status: "review" }).eq("id", creativeId).eq("status", "generating");

  const [{ data: prod }, { data: boards }, geral, copy, ia] = await Promise.all([
    db.from("ml_products").select("title, brand, attributes").eq("id", c.product_id).single(),
    db.from("ml_pinterest_boards").select("id, name, is_default").eq("active", true).is("removed_at", null).order("name"),
    lerConfig("geral"),
    lerConfig("pinterest_copy"),
    lerConfig("ia"),
  ]);
  const p = prod as { title: string; brand: string | null; attributes: unknown };
  const listaBoards = (boards ?? []) as { id: string; name: string; is_default: boolean }[];
  const atributos = Array.isArray(p.attributes)
    ? (p.attributes as { name?: string; value?: string }[]).filter((x) => x.name && x.value).slice(0, 12).map((x) => `${x.name}: ${x.value}`).join("; ")
    : "";

  let t: z.infer<typeof textosSchema>;
  if (await openai.configurada()) {
    const r = await openai.gerarJson({
      modelo: ia.modelo_visao,
      nomeSchema: "estudio_textos_pin",
      jsonSchema: textosJsonSchema as unknown as Record<string, unknown>,
      validador: textosSchema,
      instrucoes:
        `Você escreve Pins do Pinterest em português do Brasil para a marca Casa Prática (achados para a casa). ` +
        `Tom: ${copy.tom}. Título: ${copy.regras_titulo} Descrição: ${copy.regras_descricao} Alt text: ${copy.regra_alt} ` +
        `Nunca invente características que não estão nos dados, não cite preço, frete ou prazo, e não use hashtags em excesso (no máximo 3, no fim).`,
      entrada: [
        { type: "input_text", text: `Produto: ${p.title}${p.brand ? ` (marca ${p.brand})` : ""}\nCaracterísticas: ${atributos || "—"}\nBoards disponíveis: ${listaBoards.map((b) => b.name).join(" | ") || "nenhum"}` },
        { type: "input_image", image_url: (a as { public_url: string }).public_url, detail: "low" },
      ],
      esforco: "low",
    });
    t = r.dados;
  } else {
    t = { titulo: p.title.slice(0, 90), descricao: `${p.title}. Um achado prático para organizar a casa no dia a dia.`, alt_text: `Foto de ${p.title} em um ambiente de casa.`, board: null };
  }
  const board = listaBoards.find((b) => b.name.toLowerCase() === (t.board ?? "").toLowerCase()) ?? listaBoards.find((b) => b.is_default) ?? listaBoards[0] ?? null;
  const textos: TextosPin = {
    titulo: t.titulo.slice(0, LIMITES_PIN.titulo),
    descricao: comDisclosure(t.descricao, geral.disclosure),
    altText: t.alt_text.slice(0, LIMITES_PIN.altText),
    boardId: board?.id ?? null,
  };
  await db.from("ml_creatives").update({ title: textos.titulo, description: textos.descricao, alt_text: textos.altText, board_id: textos.boardId, copy_status: "ready" }).eq("id", creativeId);
  await auditar({ acao: "estudio.textos", entidade: "creative", entidadeId: creativeId, actorId: ator.actorId, metadata: { asset: assetId } });
  return textos;
}

// ---------------------------------------------------------------------------
// 5. Publicar
// ---------------------------------------------------------------------------

export async function publicarAgora(
  p: { creativeId: string; titulo: string; descricao: string; altText: string; boardId: string; linkAfiliado: string },
  ator: Ator = {},
): Promise<{ pinId: string }> {
  const db = mlDb();
  const { data: cr } = await db.from("ml_creatives").select("product_id, status, current_asset_id").eq("id", p.creativeId).single();
  const c = cr as { product_id: string; status: string; current_asset_id: string | null };
  if (!c.current_asset_id) throw new Error("Escolha uma das imagens antes de publicar.");
  const geral = await lerConfig("geral");

  // Link de afiliado do produto (o Pin orgânico usa o link direto).
  const link = await salvarLinkAfiliado({ productId: c.product_id, url: p.linkAfiliado, userId: ator.actorId ?? null, conferirOnline: true });
  if (!link.ok) throw new Error(link.erros.join(" "));

  await db
    .from("ml_creatives")
    .update({
      title: p.titulo.slice(0, LIMITES_PIN.titulo),
      description: comDisclosure(p.descricao, geral.disclosure),
      alt_text: p.altText.slice(0, LIMITES_PIN.altText),
      board_id: p.boardId,
    })
    .eq("id", p.creativeId);
  if (c.status !== "approved") await mudarStatusCriativo(p.creativeId, "approved", { motivo: "Aprovado no Estúdio", actorId: ator.actorId, actorType: "user", patch: { approved_at: new Date().toISOString() } });
  const pin = await criarPin(p.creativeId, { boardId: p.boardId, quando: "agora", ignorarRepeticao: true, actorId: ator.actorId, actorType: "user" });
  await auditar({ acao: "estudio.publicar", entidade: "pin", entidadeId: pin.id, actorId: ator.actorId, metadata: { creative: p.creativeId } });
  return { pinId: pin.id };
}

export async function statusDoPin(pinId: string): Promise<{ status: string; erro: string | null; url: string | null }> {
  const { data } = await mlDb().from("ml_pins").select("status, last_error, external_pin_id").eq("id", pinId).maybeSingle();
  const p = data as { status: string; last_error: string | null; external_pin_id: string | null } | null;
  if (!p) return { status: "desconhecido", erro: "Pin não encontrado.", url: null };
  return { status: p.status, erro: p.last_error, url: p.external_pin_id ? `https://www.pinterest.com/pin/${p.external_pin_id}/` : null };
}

// ---------------------------------------------------------------------------
// 6. Desempenho: importar Pins da conta e sugerir próximos
// ---------------------------------------------------------------------------

/** Handler SYNC_ACCOUNT_PINS: traz os Pins feitos direto no Pinterest (sem duplicar os do app). */
export async function importarPinsDaConta(ctx: CtxJob): Promise<Record<string, unknown>> {
  const db = mlDb();
  const amb = await pinterest.ambiente();
  const { data: boards } = await db.from("ml_pinterest_boards").select("id, external_id, name").eq("active", true).is("removed_at", null);
  let novos = 0;
  let atualizados = 0;
  for (const b of (boards ?? []) as { id: string; external_id: string; name: string }[]) {
    if (ctx.restanteMs() < 20_000) break;
    const pins = await pinterest.listarPinsDoBoard(b.external_id);
    if (!pins.length) continue;
    const { data: existentes } = await db.from("ml_pins").select("id, external_pin_id, origem").in("external_pin_id", pins.map((p) => p.id));
    const mapa = new Map(((existentes ?? []) as { id: string; external_pin_id: string; origem: string }[]).map((e) => [e.external_pin_id, e]));
    for (const p of pins) {
      const imagem = pinterest.imagemDoPin(p);
      const atual = mapa.get(p.id);
      if (atual) {
        if (atual.origem === "importado") {
          await db.from("ml_pins").update({ title: p.title ?? null, description: p.description ?? null, link_url: p.link ?? null, media_url: imagem, board_id: b.id }).eq("id", atual.id);
          atualizados++;
        }
        continue;
      }
      const { error } = await db.from("ml_pins").insert({
        origem: "importado",
        external_pin_id: p.id,
        board_id: b.id,
        title: p.title ?? null,
        description: p.description ?? null,
        link_url: p.link ?? null,
        media_url: imagem,
        status: "published",
        published_at: p.created_at ?? new Date().toISOString(),
        environment: amb,
        idempotency_key: `import:${p.id}`,
      });
      if (!error) novos++;
      else if (error.code !== "23505") await ctx.log("warn", `Falha ao importar Pin ${p.id}: ${error.message}`);
    }
  }
  if (novos) await enfileirar({ tipo: "FETCH_PIN_ANALYTICS", payload: { lookback_days: 30 }, idempotencyKey: "fetch-analytics:import", parentId: ctx.job.id });
  return { novos, atualizados };
}

const sugestoesSchema = z.object({
  sugestoes: z.array(z.object({ tema: z.string(), palavra_chave: z.string(), board: z.string().nullable(), motivo: z.string() })).max(5),
});

export interface PinResumo {
  titulo: string | null;
  board: string | null;
  impressoes: number;
  saves: number;
  saidas: number;
}

/** "Próximos Pins": a IA lê o que funcionou e sugere temas + palavra-chave para buscar no Estúdio. */
export async function sugerirProximosPins(pins: PinResumo[], boards: string[]): Promise<z.infer<typeof sugestoesSchema>["sugestoes"]> {
  if (!(await openai.configurada())) throw new Error("Conecte a OpenAI em Integrações para receber sugestões.");
  const ia = await lerConfig("ia");
  const linhas = pins
    .slice(0, 40)
    .map((p) => `- "${(p.titulo ?? "sem título").slice(0, 80)}" | board: ${p.board ?? "—"} | impressões ${p.impressoes} | saves ${p.saves} | cliques no link ${p.saidas}`)
    .join("\n");
  const r = await openai.gerarJson({
    modelo: ia.modelo_texto,
    nomeSchema: "estudio_sugestoes",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sugestoes"],
      properties: {
        sugestoes: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["tema", "palavra_chave", "board", "motivo"],
            properties: {
              tema: { type: "string" },
              palavra_chave: { type: "string", description: "Busca curta para o Mercado Livre (2 a 4 palavras)." },
              board: { type: ["string", "null"], description: "Nome exato de um board existente, ou null." },
              motivo: { type: "string", description: "Por que, citando os números observados. 1 frase." },
            },
          },
        },
      },
    },
    validador: sugestoesSchema,
    instrucoes:
      "Você é estrategista de Pinterest orgânico para uma conta de achados para a casa que ganha comissão do Mercado Livre. " +
      "Com base no desempenho dos Pins (impressões, saves e cliques no link), sugira até 5 próximos Pins: tema, a palavra-chave para buscar o produto e o board. " +
      "Priorize o que gera clique no link; use saves como sinal de interesse. Se houver poucos dados, diga isso no motivo e sugira testes variados. Em português do Brasil.",
    entrada: [{ type: "input_text", text: `Boards: ${boards.join(" | ")}\nPins (ordenados por cliques no link):\n${linhas || "(sem dados ainda)"}` }],
    esforco: "low",
  });
  return r.dados.sugestoes;
}
