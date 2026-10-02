import "server-only";
import { mlDb } from "../db";
import { auditar, registrarTransicao } from "../auditoria";
import { lerConfig } from "../config";
import { assertTransicao, type PinStatus } from "../estados";
import { enfileirar } from "../jobs/fila";
import { ErroPermanente } from "../jobs/erros";
import { ErroApiExterna } from "../http";
import { validarLinkAfiliado } from "../afiliados/validacao";
import { problemasDeTexto } from "../conteudo/guardrails";
import { proximoHorarioLivre, type RegrasPublicacao } from "../publicacao/janelas";
import { avaliarRepeticao, escolherVariante, inicioAposCooldown, type PinExistente, type RegrasRepeticao } from "../publicacao/repeticao";
import { diaNoFuso } from "../tempo";
import * as ml from "../integracoes/mercadolivre";
import * as pinterest from "../integracoes/pinterest";
import { lerIntegracao } from "../integracoes/estado";
import { abrirPendencia, resolverPendenciasDaEntidade } from "./pendencias";
import { gravarSnapshot, lerProduto, recalcularStatus } from "./produtos";
import { lerCriativo, mudarStatusCriativo } from "./criativos";
import { descontoPct } from "../scoring/sinais";
import type { BoardRow, PinRow, ProdutoRow } from "../tipos";
import type { CtxJob } from "../jobs/executor";

type Ator = { actorId?: string | null; actorType?: "user" | "system" | "automation" };
const NAO_PUBLICADOS: PinStatus[] = ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"];

export async function lerPin(id: string): Promise<PinRow> {
  const { data } = await mlDb().from("ml_pins").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ErroPermanente("Pin não encontrado.");
  return data as PinRow;
}

export async function mudarStatusPin(id: string, para: PinStatus, opts: Ator & { motivo?: string | null; patch?: Partial<PinRow>; de?: PinStatus } = {}): Promise<void> {
  const pin = await lerPin(id);
  const de = pin.status as PinStatus;
  if (opts.de && opts.de !== de) throw new Error(`O Pin mudou de status (${de}). Atualize a tela.`);
  assertTransicao("pin", de, para);
  const { data, error } = await mlDb().from("ml_pins").update({ ...(opts.patch ?? {}), status: para }).eq("id", id).eq("status", de).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("O Pin foi alterado por outra operação. Atualize a tela.");
  await registrarTransicao({ entidade: "pin", id, de, para, motivo: opts.motivo, actorId: opts.actorId, actorType: opts.actorType });
}

async function regras(): Promise<RegrasPublicacao> {
  const [pub, geral] = await Promise.all([lerConfig("publicacao"), lerConfig("geral")]);
  return { timezone: geral.timezone, limiteDiario: pub.limite_diario, intervaloMinimoMin: pub.intervalo_minimo_min, janelas: pub.janelas };
}

async function horariosOcupados(): Promise<Date[]> {
  const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await mlDb()
    .from("ml_pins")
    .select("scheduled_at, published_at, status")
    .in("status", ["scheduled", "publishing", "published", "pending_approval"])
    .or(`scheduled_at.gte.${desde},published_at.gte.${desde}`);
  return ((data ?? []) as { scheduled_at: string | null; published_at: string | null }[])
    .map((r) => r.published_at ?? r.scheduled_at)
    .filter((x): x is string => Boolean(x))
    .map((x) => new Date(x));
}

export async function proximoHorario(desde = new Date()): Promise<Date | null> {
  return proximoHorarioLivre(await regras(), await horariosOcupados(), desde);
}

/** Board: escolhido → do criativo → mapeado pela categoria (inclui ancestrais) → padrão. */
async function escolherBoard(produto: ProdutoRow, boardId?: string | null): Promise<BoardRow | null> {
  const db = mlDb();
  if (boardId) {
    const { data } = await db.from("ml_pinterest_boards").select("*").eq("id", boardId).maybeSingle();
    return data as BoardRow | null;
  }
  const { data: boards } = await db.from("ml_pinterest_boards").select("*").eq("active", true).is("removed_at", null);
  const lista = (boards ?? []) as BoardRow[];
  if (!lista.length) return null;
  const caminho: string[] = [];
  if (produto.category_id) {
    const { data: cat } = await db.from("ml_categories").select("id, path").eq("id", produto.category_id).maybeSingle();
    const c = cat as { id: string; path: { id: string }[] | null } | null;
    caminho.push(...((c?.path ?? []).map((x) => x.id).reverse()), produto.category_id);
  }
  for (const catId of caminho) {
    const b = lista.find((x) => x.category_ids.includes(catId));
    if (b) return b;
  }
  return lista.find((b) => b.is_default) ?? null;
}

/** Regras anti-repetição (spec §11/§22 + V2 §16). */
async function regrasRepeticao(): Promise<RegrasRepeticao> {
  const [pub, cfg, geral] = await Promise.all([lerConfig("publicacao"), lerConfig("criativos_v2"), lerConfig("geral")]);
  return {
    maxPinsProdutoSemana: pub.max_pins_produto_semana,
    cooldownHoras: cfg.cooldown_variantes_horas,
    janelaDuplicacaoDias: pub.janela_duplicacao_dias,
    limiteBoardDia: cfg.limite_board_dia,
    similaridadeVisualMax: cfg.similaridade_visual_max,
    similaridadeHeadlineMax: cfg.similaridade_headline_max,
    diaNoFuso: (d: Date) => diaNoFuso(d, geral.timezone),
  };
}

/** Pins relevantes (mesmo produto ou mesmo board) num raio em torno de `quando`. */
async function pinsParaRepeticao(productId: string, boardId: string | null, quando: Date, raioDias: number, ignorarPinId?: string): Promise<PinExistente[]> {
  const de = new Date(quando.getTime() - raioDias * 86_400_000).toISOString();
  const ate = new Date(quando.getTime() + raioDias * 86_400_000).toISOString();
  let q = mlDb()
    .from("ml_pins")
    .select("id, product_id, board_id, creative_id, published_at, scheduled_at")
    .in("status", ["scheduled", "publishing", "published", "pending_approval"])
    .or(boardId ? `product_id.eq.${productId},board_id.eq.${boardId}` : `product_id.eq.${productId}`)
    .limit(1000);
  if (ignorarPinId) q = q.neq("id", ignorarPinId);
  const { data } = await q;
  const rows = ((data ?? []) as { id: string; product_id: string; board_id: string | null; creative_id: string; published_at: string | null; scheduled_at: string | null }[]).filter((r) => {
    const t = r.published_at ?? r.scheduled_at;
    return Boolean(t) && t! >= de && t! <= ate;
  });
  const ids = Array.from(new Set(rows.map((r) => r.creative_id)));
  const { data: cr } = ids.length ? await mlDb().from("ml_creatives").select("id, image_hash, headline").in("id", ids) : { data: [] };
  const porId = new Map(((cr ?? []) as { id: string; image_hash: string | null; headline: string | null }[]).map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    boardId: r.board_id,
    quando: new Date((r.published_at ?? r.scheduled_at)!),
    imageHash: porId.get(r.creative_id)?.image_hash ?? null,
    headline: porId.get(r.creative_id)?.headline ?? null,
    creativeId: r.creative_id,
  }));
}

async function conflitosRepeticao(
  cand: { productId: string; boardId: string | null; creativeId: string; quando: Date },
  ignorarPinId?: string,
): Promise<{ codigo: string; mensagem: string }[]> {
  const regras = await regrasRepeticao();
  const c = await lerCriativo(cand.creativeId);
  const pins = await pinsParaRepeticao(cand.productId, cand.boardId, cand.quando, Math.max(regras.janelaDuplicacaoDias, 7), ignorarPinId);
  return avaliarRepeticao({ ...cand, imageHash: c.image_hash, headline: c.headline }, pins, regras);
}

export interface OpcoesCriarPin extends Ator {
  boardId?: string | null;
  quando?: "auto" | "agora" | Date | null;
  ignorarRepeticao?: boolean;
}

/** Cria a publicação de um criativo aprovado (rascunho, aguardando aprovação ou agendado). */
export async function criarPin(creativeId: string, o: OpcoesCriarPin = {}): Promise<PinRow> {
  const db = mlDb();
  const c = await lerCriativo(creativeId);
  if (c.status !== "approved" && c.status !== "published") throw new Error("Só criativos aprovados podem virar Pin.");
  const produto = await lerProduto(c.product_id);
  if (["rejected", "paused"].includes(produto.status)) throw new Error("Produto descartado/pausado não pode ser publicado.");
  const geral = await lerConfig("geral");
  const pub = await lerConfig("publicacao");
  const { data: link } = await db.from("ml_affiliate_links").select("id, affiliate_url").eq("product_id", produto.id).eq("active", true).maybeSingle();
  if (!link && geral.exigir_link_afiliado) throw new Error("Falta o link de afiliado deste produto.");
  const { data: asset } = c.current_asset_id ? await db.from("ml_creative_assets").select("public_url").eq("id", c.current_asset_id).maybeSingle() : { data: null };
  if (!asset) throw new Error("O criativo não tem imagem.");
  const board = await escolherBoard(produto, o.boardId ?? c.board_id);
  if (!board) throw new Error("Nenhum board disponível. Sincronize os boards e defina um padrão ou o mapeamento por categoria.");
  if (c.family_id) {
    // V2 §9: só publica variante com pacote Pinterest completo e válido
    const { revalidarPacote } = await import("./variantes");
    const pacote = await revalidarPacote(c.id);
    if (pacote.status !== "ready") throw new Error(`Pacote Pinterest ${pacote.status === "invalid" ? "inválido" : "incompleto"}: ${pacote.erros.map((e) => e.mensagem).join(" ")}`);
  }

  const aprovacaoDispensada = !pub.exigir_aprovacao || (produto.score != null && Number(produto.score) >= pub.autopublicar_score_min && o.actorType === "automation");
  let scheduledAt: Date | null = null;
  if (o.quando === "agora") scheduledAt = new Date();
  else if (o.quando instanceof Date) scheduledAt = o.quando;
  else if (o.quando === "auto") {
    // próxima janela livre que também respeite cooldown do produto e limite do board (V2 §16)
    const regras = await regrasRepeticao();
    const pinsProduto = await pinsParaRepeticao(produto.id, board.id, new Date(), 30);
    let desde = inicioAposCooldown(new Date(), pinsProduto.filter((x) => x.productId === produto.id), regras.cooldownHoras);
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const slot = await proximoHorario(desde);
      if (!slot) break;
      const conf = o.ignorarRepeticao ? [] : await conflitosRepeticao({ productId: produto.id, boardId: board.id, creativeId: c.id, quando: slot });
      if (!conf.length) {
        scheduledAt = slot;
        break;
      }
      const adiaveis = conf.filter((x) => x.codigo === "cooldown" || x.codigo === "board_dia" || x.codigo === "limite_produto");
      if (adiaveis.length !== conf.length) throw new Error(conf.map((x) => x.mensagem).join(" "));
      desde = new Date(slot.getTime() + 3 * 3_600_000);
    }
    if (!scheduledAt) throw new Error("Nenhum horário livre que respeite janelas, cooldown e limite do board nos próximos dias.");
  }
  if (scheduledAt && o.quando !== "auto" && !o.ignorarRepeticao) {
    const conflitos = await conflitosRepeticao({ productId: produto.id, boardId: board.id, creativeId: c.id, quando: scheduledAt });
    if (conflitos.length) {
      await auditar({
        acao: "variante.bloqueada",
        entidade: "creative",
        entidadeId: c.id,
        actorId: o.actorId,
        actorType: o.actorType,
        metadata: { evento: conflitos.some((x) => x.codigo === "cooldown") ? "bloqueada_cooldown" : "bloqueada_repeticao", conflitos },
      });
      throw new Error(conflitos.map((x) => x.mensagem).join(" "));
    }
  }
  const status: PinStatus = !scheduledAt ? "draft" : aprovacaoDispensada || o.actorType === "user" ? "scheduled" : "pending_approval";

  const { data, error } = await db
    .from("ml_pins")
    .insert({
      creative_id: c.id,
      product_id: produto.id,
      board_id: board.id,
      affiliate_link_id: (link as { id: string } | null)?.id ?? null,
      title: c.title,
      description: c.description,
      alt_text: c.alt_text,
      link_url: (link as { affiliate_url: string } | null)?.affiliate_url ?? produto.permalink,
      media_url: (asset as { public_url: string }).public_url,
      status,
      scheduled_at: scheduledAt?.toISOString() ?? null,
      timezone: geral.timezone,
      environment: (await pinterest.ambiente()) ?? "production",
      validation: { preco_referencia: produto.current_price },
      family_id: c.family_id,
      board_section_id: c.board_section_id,
      ai_modified: c.ai_modified,
      created_by: o.actorId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao criar Pin: ${error.message}`);
  const pin = data as PinRow;
  await registrarTransicao({ entidade: "pin", id: pin.id, de: null, para: status, motivo: o.quando === "auto" ? "Agendado na próxima janela livre" : null, actorId: o.actorId, actorType: o.actorType });
  await auditar({ acao: "pin.criar", entidade: "pin", entidadeId: pin.id, actorId: o.actorId, actorType: o.actorType, metadata: { creative: c.id, board: board.name, status, scheduled_at: pin.scheduled_at } });
  await recalcularStatus(produto.id, o);
  if (o.quando === "agora" && status === "scheduled") await enfileirarPublicacao(pin.id, o.actorId ?? null);
  return pin;
}

export async function enfileirarPublicacao(pinId: string, userId: string | null): Promise<void> {
  await enfileirar({ tipo: "PUBLISH_PIN", payload: { pin_id: pinId }, idempotencyKey: `publish:${pinId}`, entidade: { tipo: "pin", id: pinId }, criadoPor: userId });
}

export async function agendarCriativoAutomatico(creativeId: string): Promise<void> {
  const { count } = await mlDb().from("ml_pins").select("id", { count: "exact", head: true }).eq("creative_id", creativeId).in("status", NAO_PUBLICADOS.concat(["published", "publishing"]));
  if ((count ?? 0) > 0) return;
  try {
    const pin = await criarPin(creativeId, { quando: "auto", actorType: "automation" });
    await auditar({ acao: "automacao.agendar", entidade: "pin", entidadeId: pin.id, actorType: "automation", metadata: { creative: creativeId, scheduled_at: pin.scheduled_at, status: pin.status } });
  } catch (e) {
    await abrirPendencia({
      tipo: "publish_blocked",
      titulo: "Não foi possível agendar automaticamente",
      detalhe: e instanceof Error ? e.message : String(e),
      entidade: { tipo: "creative", id: creativeId },
      dedupeKey: `auto_schedule:${creativeId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Ações sobre Pins
// ---------------------------------------------------------------------------
export async function agendarPin(pinId: string, quando: Date | "auto", ator: Ator = {}): Promise<PinRow> {
  const pin = await lerPin(pinId);
  if (!NAO_PUBLICADOS.includes(pin.status as PinStatus) && pin.status !== "canceled") throw new Error("Este Pin não pode ser (re)agendado.");
  const data = quando === "auto" ? await proximoHorario() : quando;
  if (!data) throw new Error("Nenhum horário livre nas janelas configuradas (veja limite diário/janelas).");
  if (data.getTime() < Date.now() - 60_000) throw new Error("Escolha um horário no futuro.");
  if (pin.status === "canceled") await mudarStatusPin(pinId, "draft", { ...ator, motivo: "Reaberto" });
  const atual = await lerPin(pinId);
  await mudarStatusPin(pinId, "scheduled", {
    ...ator,
    motivo: `Agendado para ${data.toISOString()}`,
    patch: { scheduled_at: data.toISOString(), last_error: null },
  });
  await resolverPendenciasDaEntidade("pin", pinId);
  await recalcularStatus(atual.product_id, ator);
  return lerPin(pinId);
}

export async function aprovarPin(pinId: string, ator: Ator = {}): Promise<void> {
  const pin = await lerPin(pinId);
  if (pin.status !== "pending_approval") return;
  await mudarStatusPin(pinId, "scheduled", { ...ator, motivo: "Publicação aprovada" });
}

export async function pausarPin(pinId: string, ator: Ator = {}): Promise<void> {
  await mudarStatusPin(pinId, "paused", { ...ator, motivo: "Pausado" });
}

export async function retomarPin(pinId: string, ator: Ator = {}): Promise<void> {
  const pin = await lerPin(pinId);
  const quando = pin.scheduled_at && new Date(pin.scheduled_at).getTime() > Date.now() ? new Date(pin.scheduled_at) : "auto";
  await agendarPin(pinId, quando, ator);
}

export async function cancelarPin(pinId: string, ator: Ator = {}): Promise<void> {
  const pin = await lerPin(pinId);
  if (pin.status === "published" || pin.status === "publishing") throw new Error("Pin já publicado/publicando não pode ser cancelado.");
  await mudarStatusPin(pinId, "canceled", { ...ator, motivo: "Cancelado" });
  await resolverPendenciasDaEntidade("pin", pinId);
  await recalcularStatus(pin.product_id, ator);
}

export async function publicarAgora(pinId: string, ator: Ator = {}): Promise<void> {
  const pin = await lerPin(pinId);
  if (pin.external_pin_id) throw new Error("Este Pin já foi publicado.");
  if (!["scheduled", "draft", "pending_approval", "failed", "blocked", "paused"].includes(pin.status)) throw new Error("Este Pin não pode ser publicado agora.");
  if (pin.status !== "scheduled") {
    if (pin.status === "paused") await mudarStatusPin(pinId, "scheduled", { ...ator, motivo: "Publicar agora" });
    else if (pin.status !== "failed" && pin.status !== "blocked") await mudarStatusPin(pinId, "scheduled", { ...ator, motivo: "Publicar agora", patch: { scheduled_at: new Date().toISOString() } });
  }
  await mlDb().from("ml_pins").update({ scheduled_at: new Date().toISOString() }).eq("id", pinId);
  await enfileirarPublicacao(pinId, ator.actorId ?? null);
}

export async function editarPin(pinId: string, e: { title?: string; description?: string; alt_text?: string; board_id?: string; link_url?: string }, ator: Ator = {}): Promise<void> {
  const pin = await lerPin(pinId);
  if (!NAO_PUBLICADOS.includes(pin.status as PinStatus)) throw new Error("Só dá para editar Pins ainda não publicados.");
  if (e.link_url) {
    const v = validarLinkAfiliado(e.link_url);
    if (!v.ok) throw new Error(v.erros.join(" "));
    e.link_url = v.url!;
  }
  await mlDb().from("ml_pins").update(e).eq("id", pinId);
  await auditar({ acao: "pin.editar", entidade: "pin", entidadeId: pinId, actorId: ator.actorId, antes: { title: pin.title, board_id: pin.board_id, link_url: pin.link_url }, depois: e });
}

export async function duplicarPublicacao(pinId: string, boardId: string, quando: Date | "auto", ator: Ator = {}): Promise<PinRow> {
  const pin = await lerPin(pinId);
  return criarPin(pin.creative_id, { ...ator, boardId, quando });
}

// ---------------------------------------------------------------------------
// Checagem de produto e validação pré-publicação (spec §11)
// ---------------------------------------------------------------------------
export async function checarProduto(productId: string): Promise<{ disponivel: boolean | null; preco: number | null; mudou: string[] }> {
  const p = await lerProduto(productId);
  const tipo = p.external_type === "product" ? "PRODUCT" : p.external_type === "user_product" ? "USER_PRODUCT" : "ITEM";
  const d = await ml.resolverProduto(p.external_id, tipo);
  const mudou: string[] = [];
  const patch: Partial<ProdutoRow> = { last_checked_at: new Date().toISOString() };
  if (d) {
    if (d.available != null) {
      if (p.available !== d.available) mudou.push(d.available ? "voltou a ficar disponível" : "ficou indisponível");
      patch.available = d.available;
      patch.availability_reason = d.availabilityReason;
    }
    if (d.price != null) {
      if (p.current_price != null && Number(p.current_price) !== d.price) mudou.push(`preço ${Number(p.current_price).toFixed(2)} → ${d.price.toFixed(2)}`);
      patch.current_price = d.price;
      patch.original_price = d.originalPrice;
      patch.discount_pct = descontoPct(d.price, d.originalPrice);
    }
    await mlDb().from("ml_products").update(patch).eq("id", productId);
    await gravarSnapshot(productId, d, { fonte: "check" });
  }
  return { disponivel: d?.available ?? p.available, preco: d?.price ?? (p.current_price != null ? Number(p.current_price) : null), mudou };
}

export interface ItemValidacao {
  chave: string;
  ok: boolean;
  bloqueia: boolean;
  detalhe: string;
}

export async function validarPin(pinId: string, opts: { checarProdutoOnline?: boolean } = {}): Promise<ItemValidacao[]> {
  const pin = await lerPin(pinId);
  const [pub, geral] = await Promise.all([lerConfig("publicacao"), lerConfig("geral")]);
  const itens: ItemValidacao[] = [];
  const add = (chave: string, ok: boolean, detalhe: string, bloqueia = true) => itens.push({ chave, ok, bloqueia: !ok && bloqueia, detalhe });

  // Produto disponível e sem mudança relevante
  let produto = await lerProduto(pin.product_id);
  if (opts.checarProdutoOnline) {
    try {
      await checarProduto(pin.product_id);
      produto = await lerProduto(pin.product_id);
    } catch (e) {
      add("produto_check", false, `Não foi possível revalidar o produto agora: ${e instanceof Error ? e.message : e}`, false);
    }
  }
  add("produto_disponivel", produto.available !== false, produto.available === false ? `Produto indisponível (${produto.availability_reason ?? "sem estoque"})` : "Produto disponível");
  const ref = (pin.validation as { preco_referencia?: number | null; ignorar_preco?: boolean } | null) ?? {};
  if (ref.preco_referencia != null && produto.current_price != null && !ref.ignorar_preco) {
    const variacao = (Math.abs(Number(produto.current_price) - Number(ref.preco_referencia)) / Number(ref.preco_referencia)) * 100;
    add(
      "preco_estavel",
      variacao <= pub.variacao_preco_bloqueio_pct,
      variacao <= pub.variacao_preco_bloqueio_pct
        ? `Preço estável (${variacao.toFixed(0)}%)`
        : `Preço mudou ${variacao.toFixed(0)}% desde o agendamento (limite ${pub.variacao_preco_bloqueio_pct}%)`,
    );
  }
  if (["rejected", "paused"].includes(produto.status)) add("produto_status", false, `Produto ${produto.status === "rejected" ? "descartado" : "pausado"}`);

  // Criativo continua aprovado (pode ter voltado para revisão após edição/troca de imagem)
  const criativo = await lerCriativo(pin.creative_id);
  add(
    "criativo_aprovado",
    ["approved", "published"].includes(criativo.status),
    ["approved", "published"].includes(criativo.status) ? "Criativo aprovado" : `Criativo em "${criativo.status}" — aprove antes de publicar`,
  );

  // Link de afiliado
  const vl = pin.link_url ? validarLinkAfiliado(pin.link_url) : null;
  add("link_afiliado", Boolean(vl?.ok) || !geral.exigir_link_afiliado, vl?.ok ? "Link de afiliado válido" : `Link inválido ou ausente${vl ? `: ${vl.erros.join(" ")}` : ""}`);

  // Board e integração
  const { data: board } = pin.board_id ? await mlDb().from("ml_pinterest_boards").select("*").eq("id", pin.board_id).maybeSingle() : { data: null };
  const b = board as BoardRow | null;
  add("board", Boolean(b && b.active && !b.removed_at), b ? (b.removed_at ? "Board foi removido do Pinterest" : b.active ? `Board "${b.name}"` : "Board desativado") : "Sem board");
  const integ = await lerIntegracao("pinterest");
  add("pinterest", ["connected", "expiring"].includes(integ.status), integ.status === "connected" ? "Pinterest conectado" : `Pinterest: ${integ.status}${integ.last_error ? ` — ${integ.last_error}` : ""}`);

  // Imagem acessível
  if (pin.media_url) {
    try {
      const r = await fetch(pin.media_url, { method: "HEAD", signal: AbortSignal.timeout(8_000), cache: "no-store" });
      add("imagem", r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"), r.ok ? "Imagem acessível" : `Imagem inacessível (HTTP ${r.status})`);
    } catch {
      add("imagem", false, "Imagem inacessível (timeout)");
    }
  } else add("imagem", false, "Sem imagem");

  // Repetição (V2 §16): no horário em que o Pin vai sair
  const quandoPin = pin.scheduled_at && new Date(pin.scheduled_at).getTime() > Date.now() ? new Date(pin.scheduled_at) : new Date();
  const conflitos = await conflitosRepeticao({ productId: pin.product_id, boardId: pin.board_id, creativeId: pin.creative_id, quando: quandoPin }, pin.id);
  add("repeticao", conflitos.length === 0, conflitos.length ? conflitos.map((x) => x.mensagem).join(" ") : "Sem repetição recente");

  // V2: pacote Pinterest, fidelidade e redirect do link
  const cr = await lerCriativo(pin.creative_id);
  if (cr.family_id) {
    const { revalidarPacote } = await import("./variantes");
    const pacote = await revalidarPacote(cr.id);
    add("pacote", pacote.status === "ready", pacote.status === "ready" ? "Pacote Pinterest completo" : `Pacote ${pacote.status}: ${pacote.erros.map((e) => e.mensagem).join(" ")}`);
    const cfg = await lerConfig("criativos_v2");
    const { fidelidadeLiberaAprovacao } = await import("../familias/pacote");
    const lib = fidelidadeLiberaAprovacao({
      modo: cr.fidelity_mode,
      imagemManualOuIa: cr.image_mode === "manual_chatgpt" || cr.image_mode === "upload",
      status: cr.fidelity_status,
      exigirRevisao: cfg.exigir_revisao_referencia,
      automatico: false,
      nivelAutomacao: geral.nivel_automacao,
    });
    add("fidelidade", lib.ok && cr.fidelity_status !== "failed", lib.ok && cr.fidelity_status !== "failed" ? `Fidelidade: ${cr.fidelity_status}` : lib.motivo ?? "Fidelidade reprovada");
  }
  if (pin.affiliate_link_id) {
    const { data: lk } = await mlDb().from("ml_affiliate_links").select("redirect_status, final_host").eq("id", pin.affiliate_link_id).maybeSingle();
    const l = lk as { redirect_status: string; final_host: string | null } | null;
    if (l) add("redirect", l.redirect_status !== "inconsistent", l.redirect_status === "inconsistent" ? `Link redireciona para destino inconsistente (${l.final_host ?? "?"})` : `Redirect: ${l.redirect_status}${l.final_host ? ` → ${l.final_host}` : ""}`);
  }
  add("ai_disclosure", true, cr.ai_modified ? "Conteúdo de IA: será declarado (ai_disclosures AI_MODIFIED)" : "Sem IA na imagem", false);

  // Textos e disclosure
  const textos = problemasDeTexto({ titulo: pin.title, descricao: pin.description, disclosure: geral.disclosure, exigirDisclosure: pub.exigir_disclosure });
  add("textos", textos.length === 0, textos.length ? textos.join(" ") : "Título/descrição dentro dos limites, com disclosure");

  await mlDb().from("ml_pins").update({ validation: { ...ref, itens, em: new Date().toISOString() }, validated_at: new Date().toISOString() }).eq("id", pinId);
  return itens;
}

async function bloquear(pin: PinRow, problemas: ItemValidacao[]): Promise<void> {
  const detalhe = problemas.map((p) => p.detalhe).join(" · ");
  if (pin.status !== "blocked") await mudarStatusPin(pin.id, "blocked", { motivo: detalhe, actorType: "automation", patch: { last_error: detalhe } });
  await abrirPendencia({
    tipo: "publish_blocked",
    titulo: "Publicação bloqueada na validação",
    detalhe,
    entidade: { tipo: "pin", id: pin.id },
    dedupeKey: `publish_blocked:${pin.id}`,
    prioridade: 20,
    payload: { pin_id: pin.id, product_id: pin.product_id },
  });
}

// ---------------------------------------------------------------------------
// PUBLISH_PIN — idempotente (ADR-ML-014)
// ---------------------------------------------------------------------------
export async function publicarPin(pinId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  let pin = await lerPin(pinId);
  if (pin.external_pin_id) return { ja_publicado: pin.external_pin_id };
  if (!["scheduled", "publishing", "failed", "blocked"].includes(pin.status)) {
    return { ignorado: `Pin em "${pin.status}" não é publicável.` };
  }
  if (pin.scheduled_at && new Date(pin.scheduled_at).getTime() > Date.now() + 60_000) {
    return { ignorado: "Ainda não é a hora agendada." };
  }

  const itens = await validarPin(pinId, { checarProdutoOnline: true });
  const problemas = itens.filter((i) => i.bloqueia);
  if (problemas.length) {
    await bloquear(pin, problemas);
    await ctx.log("warn", "Publicação bloqueada pela validação", problemas);
    return { bloqueado: problemas.map((p) => p.chave) };
  }

  pin = await lerPin(pinId);
  // Falha ambígua anterior (timeout depois de enviar)? Procura o Pin no board antes de criar outro.
  if (pin.status === "publishing" && pin.attempts > 0) {
    const { data: board } = await mlDb().from("ml_pinterest_boards").select("external_id").eq("id", pin.board_id!).maybeSingle();
    const recentes = await pinterest.pinsRecentesDoBoard((board as { external_id: string }).external_id);
    const achado = recentes.find((r) => r.link === pin.link_url);
    if (achado) {
      await marcarPublicado(pin, achado.id, ctx);
      return { recuperado: achado.id };
    }
  }

  if (pin.status !== "publishing") await mudarStatusPin(pinId, "publishing", { motivo: "Enviando ao Pinterest", actorType: "automation" });
  await mlDb().from("ml_pins").update({ attempts: pin.attempts + 1 }).eq("id", pinId);
  const { data: board } = await mlDb().from("ml_pinterest_boards").select("external_id").eq("id", pin.board_id!).single();
  try {
    const pc = await lerConfig("pinterest_copy");
    const criado = await pinterest.criarPin({
      board_id: (board as { external_id: string }).external_id,
      title: pin.title ?? "",
      description: pin.description ?? "",
      link: pin.link_url ?? "",
      alt_text: pin.alt_text ?? undefined,
      media_url: pin.media_url ?? "",
      board_section_id: pin.board_section_id,
      ai_modified: pin.ai_modified,
      enviar_ai_disclosure: pc.enviar_ai_disclosure,
    });
    await mlDb().from("ml_pins").update({ ai_disclosure_sent: criado.aiDisclosureEnviado }).eq("id", pinId);
    await marcarPublicado(pin, criado.id, ctx);
    return { pin_id: criado.id, ai_disclosure: criado.aiDisclosureEnviado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // V2 §10: Pinterest recusou o formato do link → pendência específica; o destino nunca é trocado em silêncio
    if (e instanceof ErroApiExterna && e.status === 400 && /link|url/i.test(`${e.message} ${e.corpo ?? ""}`)) {
      await abrirPendencia({
        tipo: "publish_blocked",
        titulo: "Pinterest recusou o link de afiliado",
        detalhe: `${msg}. Gere outro link no painel de afiliados (não alteramos o destino automaticamente).`,
        entidade: { tipo: "pin", id: pinId },
        dedupeKey: `link_recusado:${pinId}`,
        prioridade: 15,
      });
    }
    const ambigua = e instanceof ErroApiExterna && (e.tipo === "timeout" || e.tipo === "network");
    // Ambígua: mantém "publishing" para a próxima tentativa conferir o board antes.
    if (!ambigua) {
      const final = e instanceof ErroApiExterna && !e.retentavel;
      await mudarStatusPin(pinId, "failed", { motivo: msg, actorType: "automation", patch: { last_error: msg } });
      if (final) {
        await abrirPendencia({ tipo: "publish_blocked", titulo: "Falha ao publicar Pin", detalhe: msg, entidade: { tipo: "pin", id: pinId }, dedupeKey: `publish_failed:${pinId}`, prioridade: 20 });
      }
    } else {
      await mlDb().from("ml_pins").update({ last_error: msg }).eq("id", pinId);
    }
    throw e;
  }
}

async function marcarPublicado(pin: PinRow, externalId: string, ctx: CtxJob): Promise<void> {
  const amb = await pinterest.ambiente();
  await mlDb()
    .from("ml_pins")
    .update({
      external_pin_id: externalId,
      external_url: amb === "sandbox" ? null : `https://www.pinterest.com/pin/${externalId}/`,
      published_at: new Date().toISOString(),
      environment: amb,
      last_error: null,
    })
    .eq("id", pin.id);
  await mudarStatusPin(pin.id, "published", { motivo: `Publicado (${externalId})`, actorType: "automation" });
  const c = await lerCriativo(pin.creative_id);
  if (c.status === "approved") await mudarStatusCriativo(c.id, "published", { motivo: "Pin publicado", actorType: "automation" });
  const produto = await lerProduto(pin.product_id);
  await mlDb()
    .from("ml_products")
    .update({ last_promoted_at: new Date().toISOString(), times_promoted: produto.times_promoted + 1 })
    .eq("id", pin.product_id);
  await resolverPendenciasDaEntidade("pin", pin.id);
  await auditar({ acao: "pin.publicar", entidade: "pin", entidadeId: pin.id, actorType: "automation", metadata: { external_pin_id: externalId, ambiente: amb, job: ctx.job.id } });
  await recalcularStatus(pin.product_id);
}

// ---------------------------------------------------------------------------
// Rotinas agendadas
// ---------------------------------------------------------------------------
export async function despacharPublicacoes(): Promise<Record<string, unknown>> {
  const db = mlDb();
  const cfg = await lerConfig("criativos_v2");
  const agora = Date.now();
  const { data: vencidos } = await db
    .from("ml_pins")
    .select("id, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date(agora).toISOString())
    .is("external_pin_id", null)
    .order("scheduled_at", { ascending: false })
    .limit(50);
  const lista = (vencidos ?? []) as { id: string; scheduled_at: string }[];
  // V2 §16: fila atrasada (worker parado) não vira rajada — publica 1 dos muito atrasados e reagenda o resto
  const limiteAtraso = agora - cfg.atraso_maximo_min * 60_000;
  const emDia = lista.filter((p) => new Date(p.scheduled_at).getTime() >= limiteAtraso);
  const atrasados = lista.filter((p) => new Date(p.scheduled_at).getTime() < limiteAtraso);
  const publicar = [...emDia, ...atrasados.slice(0, emDia.length ? 0 : 1)];
  for (const p of publicar) await enfileirarPublicacao(p.id, null);
  let reagendados = 0;
  for (const p of atrasados.filter((x) => !publicar.includes(x))) {
    try {
      await agendarPin(p.id, "auto", { actorType: "automation" });
      reagendados++;
    } catch {
      /* sem horário livre: fica para a próxima rodada */
    }
  }
  if (reagendados) await auditar({ acao: "publicacao.anti_flood", actorType: "automation", metadata: { evento: "bloqueada_repeticao", reagendados } });

  // Automação: da "piscina" de variantes aprovadas, agenda UMA por produto (diversidade + cooldown)
  let agendados = 0;
  const auto = await lerConfig("automacao");
  if (auto.auto_agendar && !auto.pausado) {
    const { data: aprovados } = await db
      .from("ml_creatives")
      .select("id, product_id, visual_type, scene_preset_id, quality_score, created_at")
      .eq("status", "approved")
      .order("created_at")
      .limit(200);
    const porProduto = new Map<string, { id: string; visual_type: string; scene_preset_id: string | null; quality_score: number | null; created_at: string }[]>();
    for (const c of (aprovados ?? []) as { id: string; product_id: string; visual_type: string; scene_preset_id: string | null; quality_score: number | null; created_at: string }[]) {
      const { count } = await db.from("ml_pins").select("id", { count: "exact", head: true }).eq("creative_id", c.id).neq("status", "canceled");
      if ((count ?? 0) > 0) continue;
      porProduto.set(c.product_id, [...(porProduto.get(c.product_id) ?? []), c]);
    }
    for (const [productId, cands] of porProduto) {
      if (agendados >= 10) break;
      const { data: ult } = await db
        .from("ml_pins")
        .select("creative_id, status")
        .eq("product_id", productId)
        .in("status", ["scheduled", "publishing", "published", "pending_approval"])
        .order("created_at", { ascending: false })
        .limit(5);
      const ultIds = ((ult ?? []) as { creative_id: string }[]).map((u) => u.creative_id);
      const { data: ultCr } = ultIds.length ? await db.from("ml_creatives").select("id, visual_type, scene_preset_id").in("id", ultIds) : { data: [] };
      const ultimos = ultIds
        .map((id) => ((ultCr ?? []) as { id: string; visual_type: string; scene_preset_id: string | null }[]).find((x) => x.id === id))
        .filter((x): x is { id: string; visual_type: string; scene_preset_id: string | null } => Boolean(x))
        .map((x) => ({ visualType: x.visual_type, sceneKey: x.scene_preset_id }));
      const escolhida = escolherVariante(
        cands.map((c) => ({ id: c.id, visualType: c.visual_type, sceneKey: c.scene_preset_id, qualidade: c.quality_score != null ? Number(c.quality_score) : null, criadoEm: c.created_at })),
        ultimos,
      );
      if (!escolhida) continue;
      await agendarCriativoAutomatico(escolhida.id);
      agendados++;
    }
  }
  return { publicacoes_enfileiradas: publicar.length, reagendados_anti_flood: reagendados, agendados };
}

/** Revalida os Pins que vão sair em breve (bloqueia + pendência se houver problema). */
export async function revalidarAgendados(antecedenciaMin: number): Promise<Record<string, unknown>> {
  const ate = new Date(Date.now() + antecedenciaMin * 60_000).toISOString();
  const { data } = await mlDb()
    .from("ml_pins")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", ate)
    .or(`validated_at.is.null,validated_at.lt.${new Date(Date.now() - 30 * 60_000).toISOString()}`)
    .limit(30);
  let bloqueados = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const itens = await validarPin(id, { checarProdutoOnline: true });
    const problemas = itens.filter((i) => i.bloqueia);
    if (problemas.length) {
      await bloquear(await lerPin(id), problemas);
      bloqueados++;
    }
  }
  return { revalidados: (data ?? []).length, bloqueados };
}

/** Confere preço/disponibilidade do catálogo já publicado (em lotes, os mais antigos primeiro). */
export async function revalidarCatalogo(lote: number, ctx: CtxJob): Promise<Record<string, unknown>> {
  const { data } = await mlDb()
    .from("ml_products")
    .select("id, status")
    .in("status", ["published", "scheduled", "ready_to_schedule"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(lote);
  let indisponiveis = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    if (ctx.restanteMs() < 15_000) break;
    const r = await checarProduto(id);
    if (r.disponivel === false) {
      indisponiveis++;
      await abrirPendencia({
        tipo: "product_changed",
        titulo: "Produto publicado ficou indisponível",
        detalhe: r.mudou.join(", ") || "Sem estoque/inativo no Mercado Livre",
        entidade: { tipo: "product", id },
        dedupeKey: `product_unavailable:${id}`,
        prioridade: 40,
      });
    }
  }
  return { checados: (data ?? []).length, indisponiveis };
}

/**
 * "Testar Pin sandbox" (spec §14): cria um Pin de teste no SANDBOX para provar a
 * permissão de escrita. Recusado em produção para não publicar teste de verdade.
 */
export async function publicarPinDeTeste(boardId: string, userId: string | null): Promise<{ pinId: string }> {
  if ((await pinterest.ambiente()) !== "sandbox") {
    throw new Error("O Pin de teste só é criado no ambiente Sandbox (em produção ele ficaria público).");
  }
  const { data: board } = await mlDb().from("ml_pinterest_boards").select("external_id, name").eq("id", boardId).maybeSingle();
  if (!board) throw new Error("Board não encontrado — sincronize os boards.");
  const { data: asset } = await mlDb().from("ml_creative_assets").select("public_url").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!asset) throw new Error("Gere ao menos um criativo antes (o teste usa a imagem mais recente).");
  const criado = await pinterest.criarPin({
    board_id: (board as { external_id: string }).external_id,
    title: "Pin de teste — Afiliados ML",
    description: "Teste de integração criado pelo painel (sandbox).",
    link: "https://www.mercadolivre.com.br",
    media_url: (asset as { public_url: string }).public_url,
  });
  await auditar({ acao: "pinterest.pin_teste", entidade: "board", entidadeId: boardId, actorId: userId, metadata: { pin: criado.id } });
  return { pinId: criado.id };
}
