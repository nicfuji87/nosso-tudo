import "server-only";
import { mlDb } from "../db";
import { auditar, registrarTransicao } from "../auditoria";
import { lerConfig, versaoConfig } from "../config";
import { assertTransicao, type CreativeStatus } from "../estados";
import { enfileirar } from "../jobs/fila";
import { ErroPermanente } from "../jobs/erros";
import * as openai from "../integracoes/openai";
import { angulosPorRegra, copyPorTemplate } from "../conteudo/angulos";
import { aplicarGuardrails, LIMITES_PIN, similaridade } from "../conteudo/guardrails";
import {
  angulosSchema,
  angulosZod,
  copySchema,
  copyZod,
  entradaCopy,
  promptAngulos,
  promptCopy,
  promptImagem,
  PROMPT_VERSAO,
} from "../conteudo/ia";
import { baixarImagem, salvarAsset, salvarReferencia, variante } from "../media/storage";
import { renderizarComposicao, renderizarRecorte } from "../media/composicao";
import { dadosConteudo } from "./scoring";
import { lerProduto, recalcularStatus } from "./produtos";
import type { AnguloRow, CategoriaRow, CriativoRow, ProdutoRow } from "../tipos";

type ModoImagem = "api" | "manual_chatgpt" | "upload" | "composition";
type Ator = { actorId?: string | null; actorType?: "user" | "system" | "automation" };

async function contexto(productId: string): Promise<{ p: ProdutoRow; cat: CategoriaRow | null }> {
  const p = await lerProduto(productId);
  const { data } = p.category_id ? await mlDb().from("ml_categories").select("*").eq("id", p.category_id).maybeSingle() : { data: null };
  return { p, cat: data as CategoriaRow | null };
}

export async function lerCriativo(id: string): Promise<CriativoRow> {
  const { data } = await mlDb().from("ml_creatives").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ErroPermanente("Criativo não encontrado.");
  return data as CriativoRow;
}

export async function mudarStatusCriativo(
  id: string,
  para: CreativeStatus,
  opts: Ator & { motivo?: string | null; patch?: Partial<CriativoRow> } = {},
): Promise<void> {
  const c = await lerCriativo(id);
  assertTransicao("creative", c.status, para);
  const { data, error } = await mlDb()
    .from("ml_creatives")
    .update({ ...(opts.patch ?? {}), status: para })
    .eq("id", id)
    .eq("status", c.status)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("O criativo foi alterado por outra operação. Atualize a tela.");
  await registrarTransicao({ entidade: "creative", id, de: c.status, para, motivo: opts.motivo, actorId: opts.actorId, actorType: opts.actorType });
}

async function revisao(c: CriativoRow, motivo: "edit" | "regenerate_copy" | "regenerate_image" | "replace_image" | "generated", userId?: string | null) {
  await mlDb()
    .from("ml_creative_revisions")
    .insert({
      creative_id: c.id,
      reason: motivo,
      created_by: userId ?? null,
      snapshot: {
        headline: c.headline,
        title: c.title,
        description: c.description,
        alt_text: c.alt_text,
        cta: c.cta,
        keywords: c.keywords,
        asset_id: c.current_asset_id,
        board_id: c.board_id,
      },
    });
}

// ---------------------------------------------------------------------------
// Ângulos
// ---------------------------------------------------------------------------
export async function gerarAngulos(productId: string, opts: { quantidade?: number } = {}): Promise<{ criados: number; fonte: string }> {
  const { p, cat } = await contexto(productId);
  const ia = await lerConfig("ia");
  const auto = await lerConfig("automacao");
  const quantidade = opts.quantidade ?? 4;
  const db = mlDb();
  const { data: existentes } = await db.from("ml_creative_angles").select("hook, batch").eq("product_id", productId);
  const lista = (existentes ?? []) as { hook: string; batch: number }[];
  const batch = lista.reduce((m, a) => Math.max(m, a.batch), 0) + 1;
  const dados = dadosConteudo(p, cat);

  let sugestoes: { type: string; hook: string; audience: string; keyword: string; rationale: string; score: number }[];
  let fonte = "template";
  let modelo: string | null = null;
  if (await openai.configurada()) {
    const r = await openai.gerarJson({
      modelo: ia.modelo_texto,
      nomeSchema: "angulos",
      jsonSchema: angulosSchema as unknown as Record<string, unknown>,
      validador: angulosZod,
      instrucoes: promptAngulos(quantidade, lista.map((a) => a.hook), ia.instrucoes_extras, ia.variacao),
      entrada: [{ type: "input_text", text: entradaCopy(dados, { type: "geral", hook: "—" }) }],
      esforco: ia.modo === "qualidade" ? "medium" : "low",
    });
    sugestoes = r.dados.angulos;
    fonte = "ai";
    modelo = r.modelo;
  } else {
    sugestoes = angulosPorRegra(dados, quantidade + lista.length).filter((s) => !lista.some((a) => similaridade(a.hook, s.hook) > 0.8));
  }
  // nunca repetir gancho quase igual a um já existente
  sugestoes = sugestoes.filter((s) => !lista.some((a) => similaridade(a.hook, s.hook) > 0.8)).slice(0, quantidade);
  if (!sugestoes.length) return { criados: 0, fonte };

  const versao = await versaoConfig("ia");
  const { data: inseridos, error } = await db
    .from("ml_creative_angles")
    .insert(
      sugestoes.map((s) => ({
        product_id: productId,
        type: s.type,
        hook: s.hook.slice(0, 120),
        audience: s.audience,
        keyword: s.keyword,
        rationale: s.rationale,
        score: s.score,
        source: fonte,
        model: modelo,
        prompt_version: fonte === "ai" ? `${PROMPT_VERSAO}+ia@${versao}` : "regras-v1",
        batch,
      })),
    )
    .select("id, score");
  if (error) throw new Error(`Falha ao gravar ângulos: ${error.message}`);

  // Automação: seleciona os N melhores e (se ligado) já gera os criativos.
  if (auto.auto_selecionar_angulos > 0 && !auto.pausado) {
    const melhores = ((inseridos ?? []) as { id: string; score: number | null }[])
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, auto.auto_selecionar_angulos)
      .map((a) => a.id);
    await db.from("ml_creative_angles").update({ status: "selected" }).in("id", melhores);
    if (auto.auto_gerar_criativos) {
      await criarCriativos(productId, melhores, { actorType: "automation" });
      await auditar({ acao: "automacao.gerar_criativos", entidade: "product", entidadeId: productId, actorType: "automation", metadata: { angulos: melhores } });
    }
  }
  return { criados: sugestoes.length, fonte };
}

// ---------------------------------------------------------------------------
// Criativos
// ---------------------------------------------------------------------------
export async function modoPadrao(): Promise<ModoImagem> {
  const cr = await lerConfig("criativos");
  // spec §8: sem OpenAI, "Gerar criativos" abre o modo manual (ChatGPT)
  if (cr.modo_imagem_padrao === "api" && !(await openai.configurada())) return "manual_chatgpt";
  return cr.modo_imagem_padrao;
}

/** Cria um criativo por ângulo e enfileira a geração de texto (que encadeia a imagem). */
export async function criarCriativos(
  productId: string,
  angleIds: string[],
  opts: Ator & { modo?: ModoImagem } = {},
): Promise<string[]> {
  const db = mlDb();
  const modo = opts.modo ?? (await modoPadrao());
  const { data: angulos } = await db.from("ml_creative_angles").select("*").in("id", angleIds).eq("product_id", productId);
  const criados: string[] = [];
  for (const a of (angulos ?? []) as AnguloRow[]) {
    const { data, error } = await db
      .from("ml_creatives")
      .insert({
        product_id: productId,
        angle_id: a.id,
        headline: a.hook.slice(0, LIMITES_PIN.headline),
        image_mode: modo,
        status: "to_generate",
        copy_status: "queued",
        created_by: opts.actorId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao criar criativo: ${error.message}`);
    const id = (data as { id: string }).id;
    criados.push(id);
    await registrarTransicao({ entidade: "creative", id, de: null, para: "to_generate", motivo: `Ângulo: ${a.hook}`, actorId: opts.actorId, actorType: opts.actorType });
    await enfileirar({ tipo: "GENERATE_COPY", payload: { creative_id: id, then_image: true }, idempotencyKey: `copy:${id}`, entidade: { tipo: "creative", id }, criadoPor: opts.actorId ?? null });
  }
  if (criados.length) {
    await db.from("ml_creative_angles").update({ status: "used" }).in("id", angleIds);
    await recalcularStatus(productId, opts);
  }
  return criados;
}

/** Gera (ou regenera) os textos. Guardrails sempre aplicados. */
export async function gerarCopy(creativeId: string, opts: { encadearImagem?: boolean; userId?: string | null } = {}): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  const { p, cat } = await contexto(c.product_id);
  const [ia, cr, geral, pub] = await Promise.all([lerConfig("ia"), lerConfig("criativos"), lerConfig("geral"), lerConfig("publicacao")]);
  const db = mlDb();
  const { data: anguloData } = c.angle_id ? await db.from("ml_creative_angles").select("*").eq("id", c.angle_id).maybeSingle() : { data: null };
  const angulo = (anguloData as AnguloRow | null) ?? { type: "descoberta", hook: c.headline ?? p.title, audience: null, keyword: null };

  await db.from("ml_creatives").update({ copy_status: "generating" }).eq("id", creativeId);
  if (c.status === "to_generate") await mudarStatusCriativo(creativeId, "generating", { motivo: "Gerando textos", actorType: "automation" });

  // Headlines recentes de OUTROS criativos (evitar repetição — spec §22)
  const { data: recentes } = await db
    .from("ml_creatives")
    .select("headline")
    .neq("id", creativeId)
    .not("headline", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  const evitar = ((recentes ?? []) as { headline: string }[]).map((r) => r.headline);

  let bruta;
  let modelo: string | null = null;
  const dados = dadosConteudo(p, cat);
  if (await openai.configurada()) {
    const r = await openai.gerarJson({
      modelo: ia.modelo_texto,
      nomeSchema: "copy_pin",
      jsonSchema: copySchema as unknown as Record<string, unknown>,
      validador: copyZod,
      instrucoes: promptCopy({ evitarHeadlines: evitar.slice(0, 15), extras: ia.instrucoes_extras, ctaPadrao: cr.cta_padrao, permitirPreco: cr.mostrar_preco_na_arte }),
      entrada: [{ type: "input_text", text: entradaCopy(dados, angulo) }],
      esforco: ia.modo === "qualidade" ? "medium" : "low",
    });
    bruta = r.dados;
    modelo = r.modelo;
  } else {
    bruta = copyPorTemplate(dados, angulo, cr.cta_padrao);
  }
  const final = aplicarGuardrails(bruta, {
    disclosure: geral.disclosure,
    exigirDisclosure: pub.exigir_disclosure,
    permitirPreco: cr.mostrar_preco_na_arte,
  });
  const versao = await versaoConfig("ia");
  const repetida = evitar.some((h) => similaridade(h, final.headline) > 0.85);

  if (c.title || c.description) await revisao(c, "regenerate_copy", opts.userId);
  await db
    .from("ml_creatives")
    .update({
      headline: final.headline,
      title: final.titulo,
      description: final.descricao,
      alt_text: final.alt_text,
      keywords: final.palavras_chave,
      cta: final.cta ?? cr.cta_padrao,
      copy_status: "ready",
      model: modelo ?? c.model,
      prompt_version: modelo ? `${PROMPT_VERSAO}+ia@${versao}` : "template-v1",
      quality_notes: { guardrails: final.alteracoes, headline_repetida: repetida },
      last_error: null,
    })
    .eq("id", creativeId);

  if (opts.encadearImagem) {
    await enfileirar({ tipo: "GENERATE_IMAGE", payload: { creative_id: creativeId }, idempotencyKey: `image:${creativeId}`, entidade: { tipo: "creative", id: creativeId } });
  } else {
    await finalizarSePronto(creativeId);
  }
  return { fonte: modelo ? "ai" : "template", guardrails: final.alteracoes.length, headline_repetida: repetida };
}

/** Gera a imagem conforme o modo. Manual/upload viram pendência com prompt e referência prontos. */
export async function gerarImagem(creativeId: string, opts: { userId?: string | null } = {}): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  const { p } = await contexto(c.product_id);
  const [ia, cr] = await Promise.all([lerConfig("ia"), lerConfig("criativos")]);
  const db = mlDb();
  const { data: anguloData } = c.angle_id ? await db.from("ml_creative_angles").select("type").eq("id", c.angle_id).maybeSingle() : { data: null };
  const tipoAngulo = (anguloData as { type: string } | null)?.type ?? "descoberta";
  const fotos = ((p.pictures as { url: string }[] | null) ?? []).map((x) => x.url);
  const fotoPrincipal = fotos[0] ?? p.thumbnail;
  if (!fotoPrincipal) throw new ErroPermanente("O produto não tem imagem para usar como referência.");
  const headline = c.headline ?? p.title;
  const modo = c.image_mode as ModoImagem;

  if (modo === "manual_chatgpt" || modo === "upload") {
    const referencia = await salvarReferencia(creativeId, variante(fotoPrincipal)).catch(() => fotoPrincipal);
    const prompt = modo === "manual_chatgpt" ? promptImagem({ titulo: p.title, anguloTipo: tipoAngulo, headline, modoManual: true }) : null;
    await db
      .from("ml_creatives")
      .update({ image_status: "waiting_manual", image_prompt: prompt, reference_image_url: referencia })
      .eq("id", creativeId);
    const atual = await lerCriativo(creativeId);
    if (atual.status !== "waiting_manual_image") {
      await mudarStatusCriativo(creativeId, "waiting_manual_image", { motivo: "Aguardando imagem manual", actorType: "automation" });
    }
    await recalcularStatus(c.product_id);
    return { modo, pendente: true };
  }

  await db.from("ml_creatives").update({ image_status: "generating" }).eq("id", creativeId);
  const atual = await lerCriativo(creativeId);
  if (["to_generate", "review", "approved", "rejected", "waiting_manual_image"].includes(atual.status)) {
    await mudarStatusCriativo(creativeId, "generating", { motivo: "Gerando imagem", actorType: "automation" });
  }

  const ref = await baixarImagem(variante(fotoPrincipal));
  let bytes: Buffer;
  let prompt: string | null = null;
  let modelo: string | null = null;
  let selo: string | null = null;
  if (cr.mostrar_preco_na_arte && p.current_price != null) selo = `R$ ${Number(p.current_price).toFixed(2).replace(".", ",")}`;
  else if (p.discount_pct != null && Number(p.discount_pct) >= 10) selo = `-${Math.round(Number(p.discount_pct))}%`;

  if (modo === "api") {
    prompt = promptImagem({ titulo: p.title, anguloTipo: tipoAngulo, headline, modoManual: false });
    const gerada = await openai.gerarImagem({ modelo: ia.modelo_imagem, prompt, qualidade: ia.qualidade_imagem, referencia: ref });
    modelo = gerada.modelo;
    // headline aplicada por composição (texto nítido e controlado, sem depender do modelo)
    bytes = await renderizarComposicao({
      layout: "cena",
      imagem: { bytes: gerada.bytes, mime: gerada.mime },
      headline,
      cta: c.cta ?? cr.cta_padrao,
      corFundo: cr.cor_fundo,
      corDestaque: cr.cor_destaque,
    });
  } else {
    bytes = await renderizarComposicao({
      layout: "produto",
      imagem: ref,
      headline,
      cta: c.cta ?? cr.cta_padrao,
      selo,
      corFundo: cr.cor_fundo,
      corDestaque: cr.cor_destaque,
    });
  }

  if (atual.current_asset_id) await revisao(atual, "regenerate_image", opts.userId);
  const asset = await salvarAsset({ creativeId, bytes, modo, prompt, modelo, userId: opts.userId });
  await db
    .from("ml_creatives")
    .update({ current_asset_id: asset.id, image_status: "ready", image_prompt: prompt ?? c.image_prompt, model: modelo ?? c.model, last_error: null })
    .eq("id", creativeId);
  await finalizarSePronto(creativeId);
  return { modo, asset: asset.id };
}

/** Upload manual (modo ChatGPT ou upload/substituição). */
export async function receberImagemManual(creativeId: string, bytes: Buffer, userId: string | null, opts: { feitaComIA?: boolean } = {}): Promise<{ avisos: string[] }> {
  const c = await lerCriativo(creativeId);
  if (c.family_id) {
    const { receberImagemVariante } = await import("./variantes");
    return receberImagemVariante(creativeId, bytes, { userId, feitaComIA: opts.feitaComIA });
  }
  if (c.status === "published" || c.status === "archived") throw new Error("Criativo publicado/arquivado não pode trocar de imagem.");
  if (c.current_asset_id) await revisao(c, "replace_image", userId);
  const modo: ModoImagem = c.image_mode === "manual_chatgpt" ? "manual_chatgpt" : "upload";
  const asset = await salvarAsset({ creativeId, bytes, modo, prompt: c.image_prompt, userId });
  await mlDb().from("ml_creatives").update({ current_asset_id: asset.id, image_status: "ready", last_error: null }).eq("id", creativeId);
  await auditar({ acao: "criativo.imagem_manual", entidade: "creative", entidadeId: creativeId, actorId: userId, metadata: { asset: asset.id, modo } });
  // imagem nova de um aprovado volta para revisão
  if (c.status === "approved") await mudarStatusCriativo(creativeId, "review", { motivo: "Imagem substituída", actorId: userId });
  await finalizarSePronto(creativeId, { actorId: userId, actorType: "user" });
  return { avisos: asset.avisos };
}

/** Pontuação de qualidade heurística (completo, limites, imagem vertical). */
function qualidade(c: CriativoRow, asset: { width: number | null; height: number | null } | null): { score: number; notas: string[] } {
  let s = 100;
  const notas: string[] = [];
  const penalizar = (cond: boolean, pontos: number, nota: string) => {
    if (!cond) return;
    s -= pontos;
    notas.push(nota);
  };
  penalizar(!c.title, 30, "Sem título");
  penalizar(!c.description || c.description.length < 80, 15, "Descrição curta");
  penalizar(!c.alt_text, 10, "Sem texto alternativo");
  penalizar((c.keywords ?? []).length < 2, 10, "Poucas palavras-chave");
  penalizar(!asset, 40, "Sem imagem");
  penalizar(Boolean(asset?.width && asset.height && asset.height / asset.width < 1.3), 15, "Imagem não vertical");
  const qn = (c.quality_notes as { headline_repetida?: boolean } | null) ?? {};
  penalizar(Boolean(qn.headline_repetida), 15, "Headline parecida com outra recente");
  return { score: Math.max(0, s), notas };
}

/** Texto + imagem prontos → revisão (ou aprovado direto pela regra de automação). */
async function finalizarSePronto(creativeId: string, ator: Ator = { actorType: "automation" }): Promise<void> {
  const c = await lerCriativo(creativeId);
  if (c.copy_status !== "ready" || c.image_status !== "ready") {
    await recalcularStatus(c.product_id, ator);
    return;
  }
  const { data: asset } = c.current_asset_id
    ? await mlDb().from("ml_creative_assets").select("width, height").eq("id", c.current_asset_id).maybeSingle()
    : { data: null };
  const q = qualidade(c, asset as { width: number | null; height: number | null } | null);
  await mlDb()
    .from("ml_creatives")
    .update({ quality_score: q.score, quality_notes: { ...((c.quality_notes as object | null) ?? {}), heuristica: q.notas } })
    .eq("id", creativeId);
  if (["generating", "to_generate", "waiting_manual_image"].includes(c.status)) {
    await mudarStatusCriativo(creativeId, "review", { motivo: "Pronto para revisão", ...ator });
  }
  const auto = await lerConfig("automacao");
  const atual = await lerCriativo(creativeId);
  if (auto.auto_aprovar_criativos && !auto.pausado && atual.status === "review" && q.score >= auto.auto_aprovar_criativos_qualidade_min) {
    await aprovarCriativo(creativeId, {
      actorType: "automation",
      motivo: `Auto-aprovado: qualidade ${q.score} ≥ ${auto.auto_aprovar_criativos_qualidade_min}`,
    });
    return;
  }
  await recalcularStatus(c.product_id, ator);
}

export async function aprovarCriativo(id: string, ator: Ator & { motivo?: string } = {}): Promise<void> {
  const c = await lerCriativo(id);
  if (c.status === "approved") return;
  if (!c.current_asset_id || !c.title) throw new Error("O criativo precisa de imagem e título antes de ser aprovado.");
  if (c.family_id) {
    // V2: fidelidade (§5.2) e pacote Pinterest completo (§9) antes de aprovar
    const [geral, cfg] = await Promise.all([lerConfig("geral"), lerConfig("criativos_v2")]);
    const { fidelidadeLiberaAprovacao } = await import("../familias/pacote");
    const lib = fidelidadeLiberaAprovacao({
      modo: c.fidelity_mode,
      imagemManualOuIa: c.image_mode === "manual_chatgpt" || c.image_mode === "upload",
      status: c.fidelity_status,
      exigirRevisao: cfg.exigir_revisao_referencia,
      automatico: ator.actorType === "automation",
      nivelAutomacao: geral.nivel_automacao,
    });
    if (!lib.ok) throw new Error(lib.motivo);
    const { revalidarPacote } = await import("./variantes");
    const pacote = await revalidarPacote(id);
    if (pacote.status !== "ready") throw new Error(`Pacote Pinterest ${pacote.status === "invalid" ? "inválido" : "incompleto"}: ${pacote.erros.map((e) => e.mensagem).join(" ")}`);
  }
  await mudarStatusCriativo(id, "approved", {
    ...ator,
    motivo: ator.motivo ?? "Aprovado",
    patch: { approved_at: new Date().toISOString(), approved_by: ator.actorId ?? null, rejection_reason: null },
  });
  await mlDb().from("ml_feedback").insert({ entity_type: "creative", entity_id: id, kind: "approve", created_by: ator.actorId ?? null, note: ator.motivo ?? null });
  await auditar({ acao: "criativo.aprovar", entidade: "creative", entidadeId: id, actorId: ator.actorId, actorType: ator.actorType, metadata: { motivo: ator.motivo } });
  await recalcularStatus(c.product_id, ator);
  const auto = await lerConfig("automacao");
  if (auto.auto_agendar && !auto.pausado) {
    const { agendarCriativoAutomatico } = await import("./publicacao");
    await agendarCriativoAutomatico(id);
  }
}

export async function rejeitarCriativo(id: string, motivo: string, ator: Ator = {}): Promise<void> {
  const c = await lerCriativo(id);
  await mudarStatusCriativo(id, "rejected", { ...ator, motivo: `Rejeitado: ${motivo}`, patch: { rejection_reason: motivo } });
  // Pins não publicados deste criativo são cancelados.
  await mlDb()
    .from("ml_pins")
    .update({ status: "canceled", last_error: "Criativo rejeitado" })
    .eq("creative_id", id)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);
  await mlDb().from("ml_feedback").insert({ entity_type: "creative", entity_id: id, kind: "reject", reason: motivo, created_by: ator.actorId ?? null });
  await auditar({ acao: "criativo.rejeitar", entidade: "creative", entidadeId: id, actorId: ator.actorId, actorType: ator.actorType, metadata: { motivo } });
  await recalcularStatus(c.product_id, ator);
}

export interface EdicaoCriativo {
  headline?: string;
  title?: string;
  description?: string;
  alt_text?: string;
  cta?: string;
  keywords?: string[];
  board_id?: string | null;
  image_mode?: ModoImagem;
}

export async function editarCriativo(id: string, e: EdicaoCriativo, userId: string | null): Promise<string[]> {
  const c = await lerCriativo(id);
  if (["published", "archived"].includes(c.status)) throw new Error("Criativo publicado/arquivado não pode ser editado.");
  const [geral, pub, cr] = await Promise.all([lerConfig("geral"), lerConfig("publicacao"), lerConfig("criativos")]);
  const final = aplicarGuardrails(
    {
      headline: e.headline ?? c.headline ?? "",
      titulo: e.title ?? c.title ?? "",
      descricao: e.description ?? c.description ?? "",
      alt_text: e.alt_text ?? c.alt_text ?? "",
      palavras_chave: e.keywords ?? c.keywords ?? [],
      cta: e.cta ?? c.cta ?? undefined,
    },
    { disclosure: geral.disclosure, exigirDisclosure: pub.exigir_disclosure, permitirPreco: cr.mostrar_preco_na_arte },
  );
  await revisao(c, "edit", userId);
  await mlDb()
    .from("ml_creatives")
    .update({
      headline: final.headline,
      title: final.titulo,
      description: final.descricao,
      alt_text: final.alt_text,
      keywords: final.palavras_chave,
      cta: final.cta ?? null,
      ...(e.board_id !== undefined ? { board_id: e.board_id } : {}),
      ...(e.image_mode ? { image_mode: e.image_mode } : {}),
    })
    .eq("id", id);
  // Pins ainda não publicados acompanham o texto editado.
  await mlDb()
    .from("ml_pins")
    .update({ title: final.titulo, description: final.descricao, alt_text: final.alt_text })
    .eq("creative_id", id)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);
  await auditar({ acao: "criativo.editar", entidade: "creative", entidadeId: id, actorId: userId, antes: { title: c.title, headline: c.headline }, depois: { title: final.titulo, headline: final.headline } });
  if (c.family_id) {
    const v2 = await import("./variantes");
    // headline mudou numa variante com texto na arte → reaplica o overlay
    if (c.has_text_overlay && e.headline !== undefined && final.headline !== c.headline && c.base_asset_id) {
      await mlDb().from("ml_creatives").update({ current_asset_id: c.base_asset_id }).eq("id", id);
      if (c.status === "approved") await mudarStatusCriativo(id, "review", { motivo: "Headline da arte alterada", actorId: userId });
      await enfileirar({ tipo: "APPLY_TEXT_OVERLAY", payload: { creative_id: id }, idempotencyKey: `v2:APPLY_TEXT_OVERLAY:${id}`, entidade: { tipo: "creative", id }, criadoPor: userId });
    }
    await v2.revalidarPacote(id);
  }
  return final.alteracoes;
}

/** Variante sem alterar o original (spec §10 "Duplicar"). */
export async function duplicarCriativo(id: string, userId: string | null): Promise<string> {
  const c = await lerCriativo(id);
  const { data, error } = await mlDb()
    .from("ml_creatives")
    .insert({
      product_id: c.product_id,
      angle_id: c.angle_id,
      variant_of: c.id,
      headline: c.headline,
      title: c.title,
      description: c.description,
      alt_text: c.alt_text,
      cta: c.cta,
      keywords: c.keywords,
      board_id: c.board_id,
      image_mode: c.image_mode,
      image_prompt: c.image_prompt,
      reference_image_url: c.reference_image_url,
      current_asset_id: c.current_asset_id,
      copy_status: c.copy_status === "ready" ? "ready" : "none",
      image_status: c.current_asset_id ? "ready" : "none",
      status: c.current_asset_id && c.title ? "review" : "to_generate",
      model: c.model,
      prompt_version: c.prompt_version,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const novo = (data as { id: string }).id;
  await registrarTransicao({ entidade: "creative", id: novo, de: null, para: c.current_asset_id && c.title ? "review" : "to_generate", motivo: `Duplicado de ${id}`, actorId: userId });
  await auditar({ acao: "criativo.duplicar", entidade: "creative", entidadeId: novo, actorId: userId, metadata: { origem: id } });
  await recalcularStatus(c.product_id, { actorId: userId, actorType: "user" });
  return novo;
}

/** "Gerar 3 variações": novos ângulos + criativos, respeitando o limite configurado. */
export async function gerarVariacoes(productId: string, userId: string | null): Promise<number> {
  const cr = await lerConfig("criativos");
  const { count } = await mlDb()
    .from("ml_creatives")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .in("status", ["to_generate", "generating", "waiting_manual_image", "review"]);
  const vagas = Math.max(0, cr.variacoes - (count ?? 0));
  if (vagas === 0) throw new Error(`Já há ${count} criativos em produção para este produto (limite ${cr.variacoes}).`);
  const { data: livres } = await mlDb()
    .from("ml_creative_angles")
    .select("id")
    .eq("product_id", productId)
    .in("status", ["suggested", "selected"])
    .order("score", { ascending: false })
    .limit(vagas);
  let ids = ((livres ?? []) as { id: string }[]).map((a) => a.id);
  if (ids.length < vagas) {
    await gerarAngulos(productId, { quantidade: vagas - ids.length + 1 });
    const { data: mais } = await mlDb()
      .from("ml_creative_angles")
      .select("id")
      .eq("product_id", productId)
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(vagas - ids.length);
    ids = [...ids, ...((mais ?? []) as { id: string }[]).map((a) => a.id)];
  }
  const criados = await criarCriativos(productId, ids.slice(0, vagas), { actorId: userId, actorType: "user" });
  return criados.length;
}

/** "Imagem escolhida" no editor: volta para uma imagem anterior do histórico. */
export async function usarAsset(creativeId: string, assetId: string, userId: string | null): Promise<void> {
  const c = await lerCriativo(creativeId);
  if (["published", "archived"].includes(c.status)) throw new Error("Criativo publicado/arquivado não pode trocar de imagem.");
  const { data } = await mlDb().from("ml_creative_assets").select("id").eq("id", assetId).eq("creative_id", creativeId).maybeSingle();
  if (!data) throw new Error("Imagem não pertence a este criativo.");
  if (c.current_asset_id === assetId) return;
  await revisao(c, "replace_image", userId);
  await mlDb().from("ml_creatives").update({ current_asset_id: assetId, image_status: "ready" }).eq("id", creativeId);
  await mlDb()
    .from("ml_pins")
    .update({ media_url: ((await mlDb().from("ml_creative_assets").select("public_url").eq("id", assetId).single()).data as { public_url: string }).public_url })
    .eq("creative_id", creativeId)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);
  await auditar({ acao: "criativo.usar_imagem", entidade: "creative", entidadeId: creativeId, actorId: userId, metadata: { asset: assetId } });
  if (c.status === "approved") await mudarStatusCriativo(creativeId, "review", { motivo: "Imagem trocada", actorId: userId });
  await finalizarSePronto(creativeId, { actorId: userId, actorType: "user" });
}

/** Crop 2:3 por ponto focal sobre a imagem atual — gera um novo asset (histórico preservado). */
export async function recortarImagem(creativeId: string, foco: { x: number; y: number; zoom: number }, userId: string | null): Promise<string> {
  const c = await lerCriativo(creativeId);
  if (!c.current_asset_id) throw new Error("O criativo ainda não tem imagem.");
  if (["published", "archived"].includes(c.status)) throw new Error("Criativo publicado/arquivado não pode ser recortado.");
  const { data } = await mlDb().from("ml_creative_assets").select("*").eq("id", c.current_asset_id).single();
  const a = data as { public_url: string; width: number | null; height: number | null; mode: "api" | "manual_chatgpt" | "upload" | "composition" };
  if (!a.width || !a.height) throw new Error("Dimensões da imagem desconhecidas — não é possível recortar.");
  const img = await baixarImagem(a.public_url);
  if (img.mime === "image/webp") throw new Error("Recorte não suporta WEBP; envie PNG ou JPG.");
  const bytes = await renderizarRecorte({ ...img, largura: a.width, altura: a.height }, foco);
  await revisao(c, "replace_image", userId);
  const novo = await salvarAsset({ creativeId, bytes, modo: a.mode, prompt: c.image_prompt, userId });
  await mlDb().from("ml_creatives").update({ current_asset_id: novo.id, image_status: "ready" }).eq("id", creativeId);
  await mlDb()
    .from("ml_pins")
    .update({ media_url: novo.url })
    .eq("creative_id", creativeId)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);
  await auditar({ acao: "criativo.recortar", entidade: "creative", entidadeId: creativeId, actorId: userId, metadata: { foco } });
  if (c.status === "approved") await mudarStatusCriativo(creativeId, "review", { motivo: "Imagem recortada", actorId: userId });
  await finalizarSePronto(creativeId, { actorId: userId, actorType: "user" });
  return novo.id;
}
