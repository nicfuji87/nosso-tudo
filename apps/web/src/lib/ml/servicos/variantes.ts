import "server-only";
import { mlDb } from "../db";
import { auditar, registrarTransicao } from "../auditoria";
import { lerConfig } from "../config";
import { enfileirar } from "../jobs/fila";
import { ErroPermanente } from "../jobs/erros";
import * as openai from "../integracoes/openai";
import { aplicarGuardrails, comDisclosure } from "../conteudo/guardrails";
import { angulosPorRegra, copyPorTemplate, nomeGancho } from "../conteudo/angulos";
import {
  fidelidadeSchema,
  fidelidadeZod,
  INSTRUCOES_PLANO,
  pacoteSchema,
  pacoteZod,
  planoFamiliaSchema,
  planoFamiliaZod,
  statusFidelidade,
} from "../conteudo/ia-v2";
import {
  estimarCusto,
  MODO_FIDELIDADE_LABEL,
  planejarVariantes,
  textosPadrao,
  TIPO_VISUAL_LABEL,
  type Estimativa,
  type Mix,
  type ModoFidelidade,
  type PresetResumo,
  type TipoVisual,
} from "../familias/plano";
import { fidelidadeLiberaAprovacao, validarPacote } from "../familias/pacote";
import { baixarImagem, salvarAsset } from "../media/storage";
import { renderizarComposicao } from "../media/composicao";
import { renderizarCenaExata, renderizarEditorial, renderizarFundoProgramatico, renderizarOverlay } from "../media/composicao-v2";
import { decodificar } from "../media/pixels";
import { lerCriativo, mudarStatusCriativo } from "./criativos";
import { caminhoNomes } from "./categorias";
import { dadosConteudo } from "./scoring";
import { lerProduto, recalcularStatus } from "./produtos";
import { listarMidia, prepararRecorte, referenciasDoProduto, type MidiaRow } from "./midia";
import { lerPreset, montarPrompt, varsDoPreset, type PresetRow } from "./prompts";
import { abrirPendencia } from "./pendencias";
import type { CtxJob } from "../jobs/executor";
import type { CategoriaRow, CriativoRow, ProdutoRow } from "../tipos";
import type { Database } from "../database.types";

export type FamiliaRow = Database["public"]["Tables"]["ml_creative_families"]["Row"];
type Ator = { actorId?: string | null; actorType?: "user" | "system" | "automation" };

/** Como a imagem é produzida: automático (app/API) ou fora do app (ChatGPT/upload). */
export type MetodoImagem = "auto" | "manual_chatgpt" | "upload";

export interface OpcoesLote {
  mix: Mix;
  modo: ModoFidelidade;
  metodo: MetodoImagem;
  presetIds: string[];
  referenciaIds?: string[] | null; // ordem: principal primeiro
  boardId?: string | null;
  angleId?: string | null;
  nome?: string | null;
  hipotese?: string | null;
  objetivo?: string | null;
  headlines?: string[] | null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
async function contexto(productId: string): Promise<{ p: ProdutoRow; cat: CategoriaRow | null }> {
  const p = await lerProduto(productId);
  const { data } = p.category_id ? await mlDb().from("ml_categories").select("*").eq("id", p.category_id).maybeSingle() : { data: null };
  return { p, cat: data as CategoriaRow | null };
}

export async function lerFamilia(id: string): Promise<FamiliaRow> {
  const { data } = await mlDb().from("ml_creative_families").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ErroPermanente("Família não encontrada.");
  return data as FamiliaRow;
}

async function precos(): Promise<{ imagem: number; texto: number; visao: number }> {
  const ia = await lerConfig("ia");
  const imagem = ia.qualidade_imagem === "high" ? ia.preco_imagem_high : ia.qualidade_imagem === "low" ? ia.preco_imagem_low : ia.preco_imagem_medium;
  return { imagem, texto: ia.preco_texto, visao: ia.preco_visao };
}

async function presetsResumo(ids: string[]): Promise<PresetResumo[]> {
  let q = mlDb().from("ml_scene_presets").select("id, key, name, category_hint, text_area").eq("active", true).order("sort");
  if (ids.length) q = q.in("id", ids);
  const { data } = await q;
  return ((data ?? []) as PresetResumo[]).map((p) => ({ ...p, text_area: (p.text_area ?? "top") as PresetResumo["text_area"] }));
}

/** image_mode legado (origem dos pixels) a partir do método e do modo de fidelidade. */
function imageMode(metodo: MetodoImagem, modo: ModoFidelidade, temOpenAI: boolean): CriativoRow["image_mode"] {
  if (metodo === "manual_chatgpt") return "manual_chatgpt";
  if (metodo === "upload") return "upload";
  if (modo === "reference_generation") return temOpenAI ? "api" : "manual_chatgpt";
  return "composition";
}

// ---------------------------------------------------------------------------
// Wizard: estimativa e criação (V2 §11.6)
// ---------------------------------------------------------------------------
export async function estimarLote(productId: string, o: OpcoesLote): Promise<Estimativa & { variantes: number; temOpenAI: boolean; limiteUsd: number; semReferencia: boolean }> {
  const { p, cat } = await contexto(productId);
  const cfg = await lerConfig("criativos_v2");
  const temOpenAI = await openai.configurada();
  const presets = await presetsResumo(o.presetIds);
  const variantes = planejarVariantes({
    mix: o.mix,
    presets,
    caminhoCategoria: caminhoNomes(cat),
    titulo: p.title,
    modo: o.modo,
    manual: o.metodo !== "auto",
    headlines: o.headlines ?? [],
    editorial: null,
  });
  const est = estimarCusto(variantes, { manual: o.metodo !== "auto", temOpenAI, precos: await precos() });
  const refs = await referenciasDoProduto(productId, o.referenciaIds);
  return { ...est, variantes: variantes.length, temOpenAI, limiteUsd: cfg.limite_custo_lote_usd, semReferencia: !refs.principal };
}

export async function criarFamiliaELote(productId: string, o: OpcoesLote, ator: Ator & { confirmarCusto?: boolean } = {}): Promise<{ familyId: string; jobId: string; estimativa: Estimativa }> {
  const p = await lerProduto(productId);
  if (["rejected", "discovered", "enriching", "analyzed", "error"].includes(p.status)) {
    throw new Error("Aprove o produto antes de criar criativos.");
  }
  const total = o.mix.lifestyle_no_text + o.mix.lifestyle_text + o.mix.editorial + o.mix.product_layout;
  if (total < 1) throw new Error("Escolha ao menos uma variante.");
  const cfg = await lerConfig("criativos_v2");
  if (total > cfg.max_variantes_ativas_familia) throw new Error(`Máximo de ${cfg.max_variantes_ativas_familia} variantes por família (Configurações › Criativos V2).`);
  const est = await estimarLote(productId, o);
  if (est.semReferencia) throw new Error("Selecione a referência principal do produto (Imagens do anúncio) antes de gerar o lote.");
  if (est.custoUsd > est.limiteUsd && !ator.confirmarCusto) {
    throw new Error(`Custo estimado US$ ${est.custoUsd.toFixed(2)} acima do limite por lote (US$ ${est.limiteUsd.toFixed(2)}). Reduza o lote ou confirme o custo.`);
  }
  const refs = await referenciasDoProduto(productId, o.referenciaIds);
  const refIds = [refs.principal?.id, ...refs.complementares.map((m) => m.id)].filter((x): x is string => Boolean(x));
  const { data: link } = await mlDb().from("ml_affiliate_links").select("id").eq("product_id", productId).eq("active", true).maybeSingle();

  const { data, error } = await mlDb()
    .from("ml_creative_families")
    .insert({
      product_id: productId,
      angle_id: o.angleId ?? null,
      name: o.nome?.trim() || `Família ${new Date().toLocaleDateString("pt-BR")}`,
      hypothesis: o.hipotese ?? null,
      objective: o.objetivo ?? null,
      default_board_id: o.boardId ?? null,
      affiliate_link_id: (link as { id: string } | null)?.id ?? null,
      plan: { mix: o.mix, modo: o.modo, metodo: o.metodo, preset_ids: o.presetIds, referencia_ids: refIds, headlines: o.headlines ?? [] },
      status: "planning",
      cost_estimated_usd: est.custoUsd,
      created_by: ator.actorId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar família: ${error.message}`);
  const familyId = (data as { id: string }).id;
  const { job } = await enfileirar({
    tipo: "PLAN_CREATIVE_FAMILY",
    payload: { family_id: familyId },
    idempotencyKey: `plan:${familyId}`,
    entidade: { tipo: "family", id: familyId },
    criadoPor: ator.actorId ?? null,
  });
  await mlDb().from("ml_creative_families").update({ batch_job_id: job.id }).eq("id", familyId);
  await auditar({ acao: "familia.criar", entidade: "family", entidadeId: familyId, actorId: ator.actorId, actorType: ator.actorType, metadata: { produto: productId, estimativa: est, opcoes: o } });
  return { familyId, jobId: job.id, estimativa: est };
}

// ---------------------------------------------------------------------------
// PLAN_CREATIVE_FAMILY — hipótese, benefício, headlines e editorial
// ---------------------------------------------------------------------------
export async function planejarFamilia(familyId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const f = await lerFamilia(familyId);
  const { p, cat } = await contexto(f.product_id);
  const plano = (f.plan as Record<string, unknown>) ?? {};
  const headlinesUsuario = ((plano.headlines as string[] | undefined) ?? []).filter(Boolean);
  const dados = dadosConteudo(p, cat);
  let nome = f.name;
  let hipotese = f.hypothesis;
  let objetivo = f.objective;
  let headlines = headlinesUsuario;
  let editorial: { titulo: string; pontos: string[] } | null = null;
  let fonte = "template";

  if (await openai.configurada()) {
    try {
      const ia = await lerConfig("ia");
      const { data: ang } = f.angle_id ? await mlDb().from("ml_creative_angles").select("type, hook").eq("id", f.angle_id).maybeSingle() : { data: null };
      const r = await openai.gerarJson({
        modelo: ia.modelo_texto,
        nomeSchema: "plano_familia",
        jsonSchema: planoFamiliaSchema as unknown as Record<string, unknown>,
        validador: planoFamiliaZod,
        instrucoes: `${INSTRUCOES_PLANO}${ia.instrucoes_extras ? `\n\nInstruções do operador:\n${ia.instrucoes_extras}` : ""}`,
        entrada: [
          {
            type: "input_text",
            text: [
              `Produto: ${p.title}`,
              dados.categoria.length ? `Categoria: ${dados.categoria.join(" › ")}` : "",
              dados.atributos.length ? `Atributos: ${dados.atributos.slice(0, 12).map((a) => `${a.name}: ${a.value}`).join("; ")}` : "",
              ang ? `Ângulo escolhido: ${(ang as { hook: string }).hook}` : "",
              f.hypothesis ? `Hipótese sugerida pelo operador: ${f.hypothesis}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      });
      nome = f.name.startsWith("Família ") ? r.dados.nome : f.name;
      hipotese = hipotese || r.dados.hipotese;
      objetivo = objetivo || r.dados.objetivo;
      headlines = headlinesUsuario.length ? headlinesUsuario : r.dados.headlines;
      editorial = { titulo: r.dados.editorial_titulo, pontos: r.dados.editorial_pontos };
      fonte = "ai";
    } catch (e) {
      await ctx.log("warn", `Plano por IA indisponível, usando modelo padrão: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!editorial || !headlines.length) {
    const hooks = angulosPorRegra(dados, 4).map((a) => a.hook);
    const t = textosPadrao(hooks, nomeGancho(p.title));
    headlines = headlines.length ? headlines : t.headlines;
    editorial = editorial ?? t.editorial;
    objetivo = objetivo || "mais praticidade no dia a dia";
    if (nome.startsWith("Família ") && headlines[0]) nome = headlines[0];
    hipotese = hipotese || `Quem busca ${nomeGancho(p.title)} responde a ideias práticas e visuais.`;
  }
  const headlinesFinais = headlines.map((h) => aplicarGuardrails({ headline: h, titulo: h, descricao: "-", alt_text: "-", palavras_chave: [] }, { disclosure: "", exigirDisclosure: false, permitirPreco: false }).headline);
  await mlDb()
    .from("ml_creative_families")
    .update({ name: nome, hypothesis: hipotese, objective: objetivo, plan: { ...plano, headlines: headlinesFinais, editorial, fonte_plano: fonte } })
    .eq("id", familyId);
  await enfileirar({
    tipo: "GENERATE_CREATIVE_BATCH",
    payload: { family_id: familyId },
    idempotencyKey: `batch:${familyId}`,
    entidade: { tipo: "family", id: familyId },
    parentId: ctx.job.id,
    criadoPor: ctx.job.created_by,
  });
  return { fonte, headlines: headlinesFinais.length };
}

// ---------------------------------------------------------------------------
// GENERATE_CREATIVE_BATCH — cria as variantes e dispara o pipeline de cada uma
// ---------------------------------------------------------------------------
export async function gerarLote(familyId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const f = await lerFamilia(familyId);
  if (f.status === "archived") return { ignorado: "família arquivada" };
  const { count: ja } = await mlDb().from("ml_creatives").select("id", { count: "exact", head: true }).eq("family_id", familyId);
  if ((ja ?? 0) > 0) {
    // idempotente: retry não duplica variantes — só retoma o pipeline das existentes
    const { data } = await mlDb().from("ml_creatives").select("id").eq("family_id", familyId);
    for (const { id } of (data ?? []) as { id: string }[]) await avancarVariante(id);
    return { retomadas: ja };
  }
  const { p, cat } = await contexto(f.product_id);
  const plano = f.plan as unknown as { mix: Mix; modo: ModoFidelidade; metodo: MetodoImagem; preset_ids: string[]; referencia_ids: string[]; headlines: string[]; editorial: { titulo: string; pontos: string[] } | null };
  const temOpenAI = await openai.configurada();
  const presets = await presetsResumo(plano.preset_ids ?? []);
  const variantes = planejarVariantes({
    mix: plano.mix,
    presets,
    caminhoCategoria: caminhoNomes(cat),
    titulo: p.title,
    modo: plano.modo,
    manual: plano.metodo !== "auto",
    headlines: plano.headlines ?? [],
    editorial: plano.editorial ?? null,
  });
  const pr = await precos();
  const criados: string[] = [];
  for (const v of variantes) {
    const modoImg = imageMode(plano.metodo, v.fidelity_mode, temOpenAI);
    const efetivoReferencia = v.fidelity_mode === "reference_generation" && modoImg === "api";
    const custo = plano.metodo === "auto" && temOpenAI ? (v.fidelity_mode !== "original_layout" ? pr.imagem : 0) + (efetivoReferencia ? pr.visao : 0) + pr.texto : 0;
    const { data, error } = await mlDb()
      .from("ml_creatives")
      .insert({
        product_id: f.product_id,
        angle_id: f.angle_id,
        family_id: familyId,
        visual_type: v.visual_type,
        scene_preset_id: v.scene_preset_id,
        fidelity_mode: v.fidelity_mode,
        source_media_ids: plano.referencia_ids ?? [],
        has_text_overlay: v.has_text_overlay,
        headline: v.headline,
        editorial_points: v.editorial_points,
        image_mode: modoImg,
        board_id: f.default_board_id,
        status: "to_generate",
        copy_status: "none",
        image_status: "none",
        fidelity_status: modoImg === "manual_chatgpt" || modoImg === "upload" || v.fidelity_mode === "reference_generation" ? "pending" : "not_required",
        cost_estimated_usd: custo,
        created_by: ctx.job.created_by,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao criar variante: ${error.message}`);
    const id = (data as { id: string }).id;
    criados.push(id);
    await registrarTransicao({
      entidade: "creative",
      id,
      de: null,
      para: "to_generate",
      motivo: `${TIPO_VISUAL_LABEL[v.visual_type]} · ${MODO_FIDELIDADE_LABEL[v.fidelity_mode]}${v.scene_key ? ` · ${v.scene_key}` : ""}`,
      actorType: ctx.job.created_by ? "user" : "automation",
      actorId: ctx.job.created_by,
    });
  }
  await mlDb().from("ml_creative_families").update({ status: "generating" }).eq("id", familyId);
  for (const id of criados) await avancarVariante(id);
  await recalcularStatus(f.product_id);
  return { variantes: criados.length };
}

// ---------------------------------------------------------------------------
// Orquestração: decide o PRÓXIMO passo pelo estado real (idempotente, retomável)
// ---------------------------------------------------------------------------
async function passo(tipo: Parameters<typeof enfileirar>[0]["tipo"], creativeId: string, extra: Record<string, unknown> = {}) {
  await enfileirar({
    tipo,
    payload: { creative_id: creativeId, ...extra },
    idempotencyKey: `v2:${tipo}:${creativeId}`,
    entidade: { tipo: "creative", id: creativeId },
  });
}

async function midiaPrincipal(c: CriativoRow): Promise<MidiaRow | null> {
  const refs = await referenciasDoProduto(c.product_id, c.source_media_ids?.length ? c.source_media_ids : null);
  return refs.principal;
}

export async function avancarVariante(creativeId: string): Promise<string> {
  const c = await lerCriativo(creativeId);
  if (!c.family_id) return "legado";
  if (["rejected", "archived", "published"].includes(c.status)) return "encerrado";
  const manual = c.image_mode === "manual_chatgpt" || c.image_mode === "upload";

  // 1) imagem base
  if (!c.base_asset_id) {
    if (manual) {
      if (c.status !== "waiting_manual_image") {
        await prepararManual(c);
        await mudarStatusCriativo(creativeId, "waiting_manual_image", { motivo: "Aguardando imagem feita fora do app", actorType: "automation" });
        await recalcularStatus(c.product_id);
      }
      return "aguardando_manual";
    }
    if (c.status === "to_generate") await mudarStatusCriativo(creativeId, "generating", { motivo: "Gerando imagem", actorType: "automation" });
    if (c.fidelity_mode === "reference_generation") {
      await passo("GENERATE_REFERENCE_IMAGE", creativeId);
      return "referencia";
    }
    if (c.fidelity_mode === "exact_composition") {
      const m = await midiaPrincipal(c);
      if (m && m.cutout_status === "none") {
        await enfileirar({ tipo: "PREPARE_PRODUCT_CUTOUT", payload: { media_id: m.id }, idempotencyKey: `cutout:${m.id}`, entidade: { tipo: "product", id: c.product_id } });
        return "recorte";
      }
      const { count } = await mlDb().from("ml_creative_assets").select("id", { count: "exact", head: true }).eq("creative_id", creativeId).eq("kind", "background");
      if (!count) {
        await passo("GENERATE_LIFESTYLE_BACKGROUND", creativeId);
        return "cenario";
      }
    }
    await passo("COMPOSE_EXACT_PRODUCT", creativeId);
    return "composicao";
  }

  // 2) fidelidade (só quando a imagem pode ter alterado o produto)
  if (c.fidelity_status === "pending" && !c.fidelity_checked_at && (await openai.configurada())) {
    await passo("CHECK_CREATIVE_FIDELITY", creativeId);
    return "fidelidade";
  }

  // 3) texto programático
  const precisaOverlay = c.has_text_overlay || c.visual_type === "editorial";
  if (precisaOverlay && (!c.current_asset_id || c.current_asset_id === c.base_asset_id)) {
    await passo("APPLY_TEXT_OVERLAY", creativeId);
    return "overlay";
  }
  if (!precisaOverlay && c.current_asset_id !== c.base_asset_id) {
    await mlDb().from("ml_creatives").update({ current_asset_id: c.base_asset_id, image_status: "ready" }).eq("id", creativeId);
  }

  // 4) pacote Pinterest
  if (c.package_status === "missing") {
    await passo("GENERATE_PINTEREST_PACKAGE", creativeId);
    return "pacote";
  }

  // 5) pronto → revisão
  await concluirVariante(creativeId);
  return "revisao";
}

async function concluirVariante(creativeId: string): Promise<void> {
  const c = await lerCriativo(creativeId);
  if (["generating", "to_generate", "waiting_manual_image"].includes(c.status)) {
    await mudarStatusCriativo(creativeId, "review", { motivo: "Variante pronta para revisão", actorType: "automation" });
  }
  await mlDb().from("ml_creatives").update({ image_status: "ready", copy_status: "ready" }).eq("id", creativeId);
  if (c.fidelity_status === "failed" || c.fidelity_status === "warning") {
    await auditar({ acao: "fidelidade.alerta", entidade: "creative", entidadeId: creativeId, actorType: "automation", metadata: { evento: "fidelity_warning", status: c.fidelity_status, score: c.fidelity_score } });
  }
  // família fica "ativa" quando nenhuma variante está mais em produção
  if (c.family_id) {
    const { count } = await mlDb()
      .from("ml_creatives")
      .select("id", { count: "exact", head: true })
      .eq("family_id", c.family_id)
      .in("status", ["to_generate", "generating"]);
    if (!count) await mlDb().from("ml_creative_families").update({ status: "active" }).eq("id", c.family_id).eq("status", "generating");
  }
  // auto-aprovação respeitando a regra de fidelidade (V2 §5.2)
  const [auto, geral, cfg] = await Promise.all([lerConfig("automacao"), lerConfig("geral"), lerConfig("criativos_v2")]);
  const atual = await lerCriativo(creativeId);
  if (auto.auto_aprovar_criativos && !auto.pausado && atual.status === "review" && atual.package_status === "ready") {
    const lib = fidelidadeLiberaAprovacao({
      modo: atual.fidelity_mode,
      imagemManualOuIa: atual.image_mode === "manual_chatgpt" || atual.image_mode === "upload",
      status: atual.fidelity_status,
      exigirRevisao: cfg.exigir_revisao_referencia,
      automatico: true,
      nivelAutomacao: geral.nivel_automacao,
    });
    if (lib.ok && (atual.quality_score == null || Number(atual.quality_score) >= auto.auto_aprovar_criativos_qualidade_min)) {
      const { aprovarCriativo } = await import("./criativos");
      await aprovarCriativo(creativeId, { actorType: "automation", motivo: "Auto-aprovado: pacote pronto e fidelidade liberada" });
    }
  }
  await recalcularStatus(c.product_id);
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------
async function varsPrompt(c: CriativoRow, preset: PresetRow | null): Promise<Record<string, string>> {
  const f = c.family_id ? await lerFamilia(c.family_id) : null;
  const { p } = await contexto(c.product_id);
  return {
    product_title: p.title,
    benefit: f?.objective ?? "praticidade no dia a dia",
    fidelity_constraints: "mesma quantidade de peças da foto",
    text_instruction: c.has_text_overlay ? "Deixe o terço superior limpo (o texto será aplicado depois)." : "Não escreva nenhum texto na imagem.",
    ...varsDoPreset(preset),
  };
}

function chaveTemplateImagem(c: CriativoRow, manual: boolean): string {
  if (manual) return "manual_chatgpt";
  if (c.fidelity_mode === "reference_generation") return c.visual_type === "editorial" ? "editorial" : c.visual_type === "lifestyle_text" ? "lifestyle_text" : "reference_generation";
  return "exact_background";
}

async function baixarReferencias(c: CriativoRow, max = 4): Promise<{ bytes: Buffer; mime: string }[]> {
  const refs = await referenciasDoProduto(c.product_id, c.source_media_ids?.length ? c.source_media_ids : null);
  const lista = [refs.principal, ...refs.complementares].filter((m): m is MidiaRow => Boolean(m?.public_url)).slice(0, max);
  const out: { bytes: Buffer; mime: string }[] = [];
  for (const m of lista) {
    try {
      out.push(await baixarImagem(m.public_url!));
    } catch {
      /* referência inacessível é pulada */
    }
  }
  if (!out.length) throw new ErroPermanente("Nenhuma imagem de referência disponível — importe/selecione as imagens do anúncio.");
  return out;
}

/** Modo manual: prompt final + referências prontas para o ChatGPT (V2 §8.3). */
async function prepararManual(c: CriativoRow): Promise<void> {
  const preset = await lerPreset(c.scene_preset_id);
  const prompt = await montarPrompt("manual_chatgpt", await varsPrompt(c, preset));
  const m = await midiaPrincipal(c);
  await mlDb()
    .from("ml_creatives")
    .update({ image_prompt: prompt.texto, prompt_version: prompt.versao, reference_image_url: m?.public_url ?? null, image_status: "waiting_manual" })
    .eq("id", c.id);
  await auditar({ acao: "prompt.gerado", entidade: "creative", entidadeId: c.id, actorType: "automation", metadata: { evento: "prompt_gerado", versao: prompt.versao, faltando: prompt.faltando } });
}

/** GENERATE_LIFESTYLE_BACKGROUND — só o cenário (produto entra depois, intacto). */
export async function gerarFundo(creativeId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  const preset = await lerPreset(c.scene_preset_id);
  let bytes: Buffer;
  let modelo: string | null = null;
  let prompt: string | null = null;
  let ia = false;
  if (await openai.configurada()) {
    const cfgIa = await lerConfig("ia");
    const pr = await montarPrompt("exact_background", await varsPrompt(c, preset));
    prompt = pr.texto;
    const g = await openai.gerarImagem({ modelo: cfgIa.modelo_imagem, prompt: pr.texto, qualidade: cfgIa.qualidade_imagem });
    bytes = g.bytes;
    modelo = g.modelo;
    ia = true;
    await mlDb().from("ml_creatives").update({ prompt_version: pr.versao, image_prompt: pr.texto }).eq("id", creativeId);
    await ctx.log("info", "Cenário gerado por IA", { evento: "imagem_gerada", tipo: "background", versao: pr.versao });
  } else {
    bytes = await renderizarFundoProgramatico({ paleta: preset?.palette });
    await ctx.log("info", "Cenário estilizado sem IA (OpenAI não configurada)", { evento: "imagem_gerada", tipo: "background" });
  }
  const a = await salvarAsset({ creativeId, bytes, modo: ia ? "api" : "composition", prompt, modelo, kind: "background" });
  if (ia) await somarCusto(creativeId, "imagem");
  await mlDb().from("ml_creatives").update({ ai_modified: ia }).eq("id", creativeId);
  await avancarVariante(creativeId);
  return { asset: a.id, ia };
}

/** COMPOSE_EXACT_PRODUCT — produto real sobre o cenário (ou foto + layout). */
export async function comporVariante(creativeId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  const preset = await lerPreset(c.scene_preset_id);
  const cr = await lerConfig("criativos");
  const m = await midiaPrincipal(c);
  const { p } = await contexto(c.product_id);
  const fotoUrl = m?.public_url ?? ((p.pictures as { url: string }[] | null) ?? [])[0]?.url ?? p.thumbnail;
  if (!fotoUrl) throw new ErroPermanente("Produto sem imagem para compor.");
  const area = (preset?.text_area ?? "top") as "top" | "bottom" | "none";
  const posicao = area === "top" ? "bottom" : area === "bottom" ? "top" : "center";
  let bytes: Buffer;
  let notas: string;

  if (c.fidelity_mode === "original_layout" && c.visual_type === "product_layout") {
    const foto = await baixarImagem(fotoUrl);
    bytes = await renderizarComposicao({ layout: "produto", imagem: foto, headline: c.headline ?? p.title, cta: c.cta ?? cr.cta_padrao, corFundo: cr.cor_fundo, corDestaque: cr.cor_destaque });
    notas = "Foto original do anúncio em layout (máxima fidelidade).";
  } else {
    const { data: fundoRow } = await mlDb().from("ml_creative_assets").select("public_url").eq("creative_id", creativeId).eq("kind", "background").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const fundo = fundoRow
      ? await baixarImagem((fundoRow as { public_url: string }).public_url)
      : { bytes: await renderizarFundoProgramatico({ paleta: preset?.palette }), mime: "image/png" as const };
    const recortado = Boolean(m?.cutout_status === "ready" && m.cutout_url && c.fidelity_mode === "exact_composition");
    const produtoBytes = await baixarImagem(recortado ? m!.cutout_url! : fotoUrl);
    const bmp = decodificar(produtoBytes.bytes);
    bytes = await renderizarCenaExata({
      fundo,
      produto: { bytes: produtoBytes.bytes, mime: produtoBytes.mime, largura: bmp.width, altura: bmp.height },
      recortado,
      posicao,
    });
    notas = recortado
      ? "Produto real recortado (pixels preservados) sobre o cenário."
      : `Foto original emoldurada sobre o cenário${m?.cutout_note ? ` (${m.cutout_note})` : ""}.`;
  }
  const a = await salvarAsset({ creativeId, bytes, modo: "composition", kind: "base" });
  await mlDb()
    .from("ml_creatives")
    .update({ base_asset_id: a.id, image_hash: a.hash, fidelity_notes: { composicao: notas }, image_status: "ready" })
    .eq("id", creativeId);
  await ctx.log("info", notas, { evento: "imagem_gerada", tipo: "composicao" });
  await avancarVariante(creativeId);
  return { asset: a.id };
}

/** GENERATE_REFERENCE_IMAGE — modelo multimodal com as fotos do anúncio (sempre checa fidelidade). */
export async function gerarPorReferencia(creativeId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  if (!(await openai.configurada())) {
    // sem OpenAI: vira modo manual (não falha o lote)
    await mlDb().from("ml_creatives").update({ image_mode: "manual_chatgpt" }).eq("id", creativeId);
    await avancarVariante(creativeId);
    return { fallback: "manual_chatgpt" };
  }
  const preset = await lerPreset(c.scene_preset_id);
  const cfgIa = await lerConfig("ia");
  const pr = await montarPrompt(chaveTemplateImagem(c, false), await varsPrompt(c, preset));
  const refs = await baixarReferencias(c);
  const g = await openai.gerarImagem({ modelo: cfgIa.modelo_imagem, prompt: pr.texto, qualidade: cfgIa.qualidade_imagem, referencias: refs });
  const a = await salvarAsset({ creativeId, bytes: g.bytes, modo: "api", prompt: pr.texto, modelo: g.modelo, kind: "base" });
  await somarCusto(creativeId, "imagem");
  await mlDb()
    .from("ml_creatives")
    .update({
      base_asset_id: a.id,
      image_hash: a.hash,
      ai_modified: true,
      image_prompt: pr.texto,
      prompt_version: pr.versao,
      model: g.modelo,
      fidelity_status: "pending",
      fidelity_checked_at: null,
      image_status: "ready",
    })
    .eq("id", creativeId);
  await ctx.log("info", "Imagem gerada com referência", { evento: "imagem_gerada", versao: pr.versao, referencias: refs.length, uso: g.uso });
  await avancarVariante(creativeId);
  return { asset: a.id, referencias: refs.length };
}

/** CHECK_CREATIVE_FIDELITY — análise de visão comparando referência × gerada (assistida). */
export async function checarFidelidade(creativeId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  if (!c.base_asset_id) throw new ErroPermanente("Criativo sem imagem para checar.");
  const { data: base } = await mlDb().from("ml_creative_assets").select("public_url").eq("id", c.base_asset_id).single();
  const refs = await referenciasDoProduto(c.product_id, c.source_media_ids?.length ? c.source_media_ids : null);
  const urlsRef = [refs.principal, ...refs.complementares].filter((m): m is MidiaRow => Boolean(m?.public_url)).slice(0, 3).map((m) => m.public_url!);
  if (!urlsRef.length) throw new ErroPermanente("Sem imagens de referência para comparar.");
  const ia = await lerConfig("ia");
  const tpl = await montarPrompt("fidelity_check", {});
  const r = await openai.gerarJson({
    modelo: ia.modelo_visao,
    nomeSchema: "fidelidade",
    jsonSchema: fidelidadeSchema as unknown as Record<string, unknown>,
    validador: fidelidadeZod,
    instrucoes: tpl.texto,
    entrada: [
      { type: "input_text", text: `Produto: ${(await lerProduto(c.product_id)).title}. As ${urlsRef.length} primeiras imagens são REFERÊNCIA; a última é a GERADA.` },
      ...urlsRef.map((u) => ({ type: "input_image" as const, image_url: u, detail: "high" as const })),
      { type: "input_image", image_url: (base as { public_url: string }).public_url, detail: "high" },
    ],
    esforco: "medium",
  });
  const status = statusFidelidade(r.dados);
  await somarCusto(creativeId, "visao");
  await mlDb()
    .from("ml_creatives")
    .update({
      fidelity_status: status,
      fidelity_score: r.dados.score,
      fidelity_notes: { ...((c.fidelity_notes as object | null) ?? {}), ia: r.dados, modelo: r.modelo, versao: tpl.versao },
      fidelity_checked_at: new Date().toISOString(),
    })
    .eq("id", creativeId);
  if (status !== "ok") {
    await ctx.log("warn", `Alerta de fidelidade (${status}, score ${r.dados.score}): ${r.dados.problemas.join("; ")}`, { evento: "fidelity_warning" });
  }
  await avancarVariante(creativeId);
  return { status, score: r.dados.score };
}

/** APPLY_TEXT_OVERLAY — headline/editorial aplicados pelo app sobre a base sem texto. */
export async function aplicarOverlay(creativeId: string, ctx: CtxJob): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  if (!c.base_asset_id) throw new ErroPermanente("Sem imagem base para aplicar texto.");
  const { data: base } = await mlDb().from("ml_creative_assets").select("public_url").eq("id", c.base_asset_id).single();
  const img = await baixarImagem((base as { public_url: string }).public_url);
  const cr = await lerConfig("criativos");
  const preset = await lerPreset(c.scene_preset_id);
  const { p } = await contexto(c.product_id);
  let bytes: Buffer;
  if (c.visual_type === "editorial") {
    const pontos = c.editorial_points?.length ? c.editorial_points : [];
    bytes = await renderizarEditorial({ imagem: img, titulo: c.headline ?? `Ideias com ${nomeGancho(p.title)}`, pontos, corFundo: cr.cor_fundo, corDestaque: cr.cor_destaque });
  } else {
    const area = (preset?.text_area === "bottom" ? "bottom" : "top") as "top" | "bottom";
    bytes = await renderizarOverlay({ base: img, headline: c.headline ?? nomeGancho(p.title), area, corDestaque: cr.cor_destaque });
  }
  const a = await salvarAsset({ creativeId, bytes, modo: c.image_mode as "composition", kind: "final", parentAssetId: c.base_asset_id });
  await mlDb().from("ml_creatives").update({ current_asset_id: a.id, image_hash: a.hash, image_status: "ready" }).eq("id", creativeId);
  await ctx.log("info", "Texto aplicado pelo compositor", { evento: "imagem_gerada", tipo: "overlay" });
  await avancarVariante(creativeId);
  return { asset: a.id };
}

/** GENERATE_PINTEREST_PACKAGE — título, descrição, alt text (lendo a imagem final quando há IA), board e validação. */
export async function gerarPacote(creativeId: string, ctx: CtxJob | null): Promise<Record<string, unknown>> {
  const c = await lerCriativo(creativeId);
  const { p, cat } = await contexto(c.product_id);
  const [geral, pub, pc, ia, cr] = await Promise.all([lerConfig("geral"), lerConfig("publicacao"), lerConfig("pinterest_copy"), lerConfig("ia"), lerConfig("criativos")]);
  const f = c.family_id ? await lerFamilia(c.family_id) : null;
  const preset = await lerPreset(c.scene_preset_id);
  const dados = dadosConteudo(p, cat);
  const finalId = c.current_asset_id ?? c.base_asset_id;
  const { data: asset } = finalId ? await mlDb().from("ml_creative_assets").select("public_url").eq("id", finalId).maybeSingle() : { data: null };
  const urlFinal = (asset as { public_url: string } | null)?.public_url ?? null;
  const descricaoVisual = `${TIPO_VISUAL_LABEL[c.visual_type as TipoVisual]}${preset ? ` em ${preset.environment}` : ""}`;

  let bruta: { headline: string; titulo: string; descricao: string; alt_text: string; palavras_chave: string[] };
  let interesses: string[] = [];
  let versao = "template-v1";
  if (await openai.configurada()) {
    const tpl = await montarPrompt("pinterest_copy", {
      visual_description: descricaoVisual,
      tone: pc.tom,
      title_rules: pc.regras_titulo,
      description_rules: pc.regras_descricao,
      alt_rules: pc.regra_alt,
    });
    const r = await openai.gerarJson({
      modelo: ia.modelo_texto,
      nomeSchema: "pacote_pinterest",
      jsonSchema: pacoteSchema as unknown as Record<string, unknown>,
      validador: pacoteZod,
      instrucoes: tpl.texto,
      entrada: [
        {
          type: "input_text",
          text: [
            `Produto: ${p.title}`,
            dados.categoria.length ? `Categoria: ${dados.categoria.join(" › ")}` : "",
            dados.atributos.length ? `Atributos: ${dados.atributos.slice(0, 12).map((a) => `${a.name}: ${a.value}`).join("; ")}` : "",
            f ? `Família/hipótese: ${f.name} — ${f.hypothesis ?? ""}. Benefício: ${f.objective ?? ""}` : "",
            c.headline ? `Headline da arte: ${c.headline}` : "Imagem sem texto.",
            `Tipo de criativo: ${descricaoVisual}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
        ...(urlFinal ? [{ type: "input_image" as const, image_url: urlFinal, detail: "low" as const }] : []),
      ],
    });
    bruta = { headline: c.headline ?? r.dados.titulo, titulo: r.dados.titulo, descricao: r.dados.descricao, alt_text: r.dados.alt_text, palavras_chave: r.dados.palavras_chave };
    interesses = r.dados.interesses;
    versao = tpl.versao;
    await somarCusto(creativeId, "texto");
  } else {
    const headlinesFamilia = ((f?.plan as { headlines?: string[] } | null)?.headlines ?? []).filter(Boolean);
    const { count: posicao } = await mlDb().from("ml_creatives").select("id", { count: "exact", head: true }).eq("family_id", c.family_id ?? "").lt("created_at", c.created_at);
    const gancho = c.headline ?? headlinesFamilia[(posicao ?? 0) % Math.max(headlinesFamilia.length, 1)] ?? `Ideia prática: ${nomeGancho(p.title)}`;
    const t = copyPorTemplate(dados, { type: "descoberta", hook: gancho, keyword: nomeGancho(p.title) }, cr.cta_padrao);
    bruta = {
      headline: c.headline ?? t.headline,
      titulo: `${gancho}${p.brand ? ` | ${p.brand}` : ""}`,
      descricao: f?.objective ? `${t.descricao}\nBenefício: ${f.objective}.` : t.descricao,
      alt_text: `Foto ${c.ai_modified ? "ilustrativa" : ""} de ${p.title}${preset ? ` em ${preset.environment}` : ""}`.replace(/\s+/g, " "),
      palavras_chave: t.palavras_chave,
    };
  }
  const final = aplicarGuardrails(bruta, { disclosure: geral.disclosure, exigirDisclosure: pub.exigir_disclosure, permitirPreco: cr.mostrar_preco_na_arte });
  const descricao = pub.exigir_disclosure ? comDisclosure(final.descricao, geral.disclosure) : final.descricao;

  // board: o da variante → padrão da família → mapeamento por categoria → padrão
  let boardId = c.board_id ?? f?.default_board_id ?? null;
  if (!boardId) {
    const { data: boards } = await mlDb().from("ml_pinterest_boards").select("id, category_ids, is_default").eq("active", true).is("removed_at", null);
    const lista = (boards ?? []) as { id: string; category_ids: string[]; is_default: boolean }[];
    const caminho = [...((cat?.path as { id: string }[] | null) ?? []).map((x) => x.id).reverse(), p.category_id].filter(Boolean) as string[];
    boardId = caminho.map((cid) => lista.find((b) => b.category_ids.includes(cid))?.id).find(Boolean) ?? lista.find((b) => b.is_default)?.id ?? null;
  }
  await mlDb()
    .from("ml_creatives")
    .update({
      title: final.titulo,
      description: descricao,
      alt_text: final.alt_text,
      keywords: final.palavras_chave,
      interests: interesses,
      disclosure_text: pub.exigir_disclosure ? geral.disclosure : null,
      copy_template_version: versao,
      board_id: boardId,
      copy_status: "ready",
      quality_notes: { ...((c.quality_notes as object | null) ?? {}), guardrails: final.alteracoes },
    })
    .eq("id", creativeId);
  const v = await revalidarPacote(creativeId);
  if (ctx) await ctx.log(v.status === "ready" ? "info" : "warn", `Pacote Pinterest: ${v.status}`, { evento: v.status === "ready" ? "pacote_pronto" : "pacote_invalido", erros: v.erros });
  if (c.status !== "approved") await avancarVariante(creativeId);
  return { status: v.status, erros: v.erros.length, versao };
}

/** Recalcula o status do pacote (chamado após edições, troca de link/board e antes de publicar). */
export async function revalidarPacote(creativeId: string): Promise<ReturnType<typeof validarPacote>> {
  const c = await lerCriativo(creativeId);
  const [geral, pub] = await Promise.all([lerConfig("geral"), lerConfig("publicacao")]);
  const { data: link } = await mlDb().from("ml_affiliate_links").select("affiliate_url, redirect_status").eq("product_id", c.product_id).eq("active", true).maybeSingle();
  const l = link as { affiliate_url: string; redirect_status: string } | null;
  const r = validarPacote({
    titulo: c.title,
    descricao: c.description,
    altText: c.alt_text,
    boardId: c.board_id,
    linkAfiliado: l?.affiliate_url ?? null,
    redirectStatus: l?.redirect_status ?? null,
    exigirLink: geral.exigir_link_afiliado,
    disclosure: geral.disclosure,
    exigirDisclosure: pub.exigir_disclosure,
    temImagemFinal: Boolean(c.current_asset_id),
  });
  await mlDb()
    .from("ml_creatives")
    .update({ package_status: r.status, package_errors: r.erros, package_version: (c.package_version ?? 0) + 1, package_updated_at: new Date().toISOString() })
    .eq("id", creativeId);
  if (r.status === "invalid") {
    await auditar({ acao: "pacote.invalido", entidade: "creative", entidadeId: creativeId, actorType: "automation", metadata: { evento: "pinterest_package_invalid", erros: r.erros } });
  }
  return r;
}

async function somarCusto(creativeId: string, tipo: "imagem" | "texto" | "visao"): Promise<void> {
  const pr = await precos();
  const c = await lerCriativo(creativeId);
  const valor = tipo === "imagem" ? pr.imagem : tipo === "texto" ? pr.texto : pr.visao;
  await mlDb().from("ml_creatives").update({ cost_actual_usd: Number(c.cost_actual_usd ?? 0) + valor }).eq("id", creativeId);
}

// ---------------------------------------------------------------------------
// Ações humanas sobre variantes e famílias
// ---------------------------------------------------------------------------
/** Upload do modo manual/upload na V2: vira base, marca IA quando veio do ChatGPT e segue o pipeline. */
export async function receberImagemVariante(creativeId: string, bytes: Buffer, o: { userId: string | null; feitaComIA?: boolean }): Promise<{ avisos: string[] }> {
  const c = await lerCriativo(creativeId);
  if (["published", "archived"].includes(c.status)) throw new Error("Variante publicada/arquivada não pode trocar de imagem.");
  const viaChatgpt = c.image_mode === "manual_chatgpt";
  const ia = viaChatgpt || Boolean(o.feitaComIA);
  const a = await salvarAsset({ creativeId, bytes, modo: viaChatgpt ? "manual_chatgpt" : "upload", prompt: c.image_prompt, userId: o.userId, kind: "base" });
  await mlDb()
    .from("ml_creatives")
    .update({
      base_asset_id: a.id,
      current_asset_id: null,
      image_hash: a.hash,
      ai_modified: ia,
      fidelity_status: ia ? "pending" : "not_required",
      fidelity_checked_at: null,
      fidelity_score: null,
      package_status: "missing",
      image_status: "ready",
      last_error: null,
    })
    .eq("id", creativeId);
  await auditar({ acao: "criativo.imagem_manual", entidade: "creative", entidadeId: creativeId, actorId: o.userId, metadata: { evento: "imagem_gerada", ai_modified: ia } });
  if (c.status === "approved") await mudarStatusCriativo(creativeId, "review", { motivo: "Imagem substituída", actorId: o.userId });
  if (c.status === "waiting_manual_image" || c.status === "to_generate") {
    await mudarStatusCriativo(creativeId, "generating", { motivo: "Imagem recebida", actorId: o.userId, actorType: "user" });
  }
  await avancarVariante(creativeId);
  return { avisos: a.avisos };
}

/** Checklist humano de fidelidade (V2 §5.2). Tudo marcado ⇒ human_ok; senão problema registrado. */
export async function revisarFidelidade(creativeId: string, checklist: Record<string, boolean>, nota: string | null, userId: string | null): Promise<"human_ok" | "failed"> {
  const c = await lerCriativo(creativeId);
  const ok = Object.values(checklist).length > 0 && Object.values(checklist).every(Boolean);
  const status = ok ? "human_ok" : "failed";
  await mlDb()
    .from("ml_creatives")
    .update({
      fidelity_status: status,
      fidelity_checked_at: new Date().toISOString(),
      fidelity_notes: { ...((c.fidelity_notes as object | null) ?? {}), humano: { checklist, nota, por: userId, em: new Date().toISOString() } },
    })
    .eq("id", creativeId);
  await mlDb().from("ml_feedback").insert({ entity_type: "creative", entity_id: creativeId, kind: ok ? "approve" : "reject", reason: ok ? "fidelidade_ok" : "fidelidade", note: nota, created_by: userId });
  await auditar({ acao: ok ? "fidelidade.confirmada" : "fidelidade.problema", entidade: "creative", entidadeId: creativeId, actorId: userId, metadata: { evento: ok ? "fidelidade_ok" : "fidelity_warning", checklist, nota } });
  return status;
}

/** "Regerar cena": nova base (histórico preservado); copy e headline mantidas. */
export async function regerarCena(creativeId: string, userId: string | null): Promise<void> {
  const c = await lerCriativo(creativeId);
  if (!c.family_id) throw new Error("Use 'Regerar imagem' para criativos sem família.");
  if (["published", "archived"].includes(c.status)) throw new Error("Variante publicada/arquivada não pode ser regenerada.");
  if (c.image_mode === "manual_chatgpt" || c.image_mode === "upload") throw new Error("Variante manual: envie uma nova imagem.");
  await mlDb()
    .from("ml_creatives")
    .update({
      base_asset_id: null,
      current_asset_id: null,
      image_status: "none",
      fidelity_status: c.fidelity_mode === "reference_generation" ? "pending" : c.fidelity_status === "human_ok" ? "not_required" : c.fidelity_status,
      fidelity_checked_at: null,
      package_status: "missing",
    })
    .eq("id", creativeId);
  if (c.status === "approved" || c.status === "review" || c.status === "rejected") {
    await mudarStatusCriativo(creativeId, "generating", { motivo: "Regerando cena", actorId: userId, actorType: "user" });
  }
  await auditar({ acao: "criativo.regerar_cena", entidade: "creative", entidadeId: creativeId, actorId: userId });
  if (c.fidelity_mode === "exact_composition") {
    // cenário NOVO: o fundo anterior fica no histórico; a composição usa sempre o mais recente
    await enfileirar({
      tipo: "GENERATE_LIFESTYLE_BACKGROUND",
      payload: { creative_id: creativeId, regerar: true },
      idempotencyKey: `v2:GENERATE_LIFESTYLE_BACKGROUND:${creativeId}`,
      entidade: { tipo: "creative", id: creativeId },
      criadoPor: userId,
    });
    return;
  }
  await avancarVariante(creativeId);
}

export async function trocarReferencia(creativeId: string, mediaIds: string[], userId: string | null): Promise<void> {
  const c = await lerCriativo(creativeId);
  const midias = await listarMidia(c.product_id);
  const validas = mediaIds.filter((id) => midias.some((m) => m.id === id && m.status === "ready"));
  if (!validas.length) throw new Error("Escolha ao menos uma imagem importada do anúncio.");
  await mlDb().from("ml_creatives").update({ source_media_ids: validas }).eq("id", creativeId);
  await auditar({ acao: "criativo.trocar_referencia", entidade: "creative", entidadeId: creativeId, actorId: userId, depois: { referencias: validas } });
  if (c.image_mode === "manual_chatgpt") {
    const atual = await lerCriativo(creativeId);
    await prepararManual(atual);
  } else {
    await regerarCena(creativeId, userId);
  }
}

/** Só rascunho (nunca aprovado/publicado, sem Pin) pode ser excluído; assets saem junto. */
export async function excluirRascunho(creativeId: string, userId: string | null): Promise<void> {
  const c = await lerCriativo(creativeId);
  if (!["to_generate", "generating", "waiting_manual_image", "review", "rejected"].includes(c.status) || c.approved_at) {
    throw new Error("Só rascunhos nunca aprovados podem ser excluídos — arquive os demais.");
  }
  const { count } = await mlDb().from("ml_pins").select("id", { count: "exact", head: true }).eq("creative_id", creativeId);
  if (count) throw new Error("Esta variante já tem Pin — arquive em vez de excluir.");
  await mlDb().from("ml_creatives").update({ current_asset_id: null, base_asset_id: null }).eq("id", creativeId);
  const { error } = await mlDb().from("ml_creatives").delete().eq("id", creativeId);
  if (error) throw new Error(error.message);
  await auditar({ acao: "criativo.excluir_rascunho", entidade: "creative", entidadeId: creativeId, actorId: userId, antes: { headline: c.headline, familia: c.family_id } });
  await recalcularStatus(c.product_id, { actorId: userId, actorType: "user" });
}

export async function arquivarFamilia(familyId: string, userId: string | null): Promise<void> {
  const f = await lerFamilia(familyId);
  await mlDb().from("ml_creative_families").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", familyId);
  const { data } = await mlDb().from("ml_creatives").select("id, status").eq("family_id", familyId).not("status", "in", "(published,archived)");
  for (const c of (data ?? []) as { id: string; status: string }[]) {
    try {
      await mudarStatusCriativo(c.id, "archived", { motivo: "Família arquivada", actorId: userId, actorType: "user" });
    } catch {
      /* status sem transição para arquivado (ex.: em geração) fica como está */
    }
  }
  await mlDb()
    .from("ml_pins")
    .update({ status: "canceled", last_error: "Família arquivada" })
    .eq("family_id", familyId)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);
  await auditar({ acao: "familia.arquivar", entidade: "family", entidadeId: familyId, actorId: userId });
  await recalcularStatus(f.product_id, { actorId: userId, actorType: "user" });
}

/** "Duplicar hipótese": nova família com o mesmo plano, para gerar outro lote. */
export async function duplicarHipotese(familyId: string, userId: string | null): Promise<string> {
  const f = await lerFamilia(familyId);
  const { data, error } = await mlDb()
    .from("ml_creative_families")
    .insert({
      product_id: f.product_id,
      angle_id: f.angle_id,
      name: `${f.name} (cópia)`,
      hypothesis: f.hypothesis,
      objective: f.objective,
      default_board_id: f.default_board_id,
      affiliate_link_id: f.affiliate_link_id,
      plan: f.plan,
      status: "planning",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  await auditar({ acao: "familia.duplicar", entidade: "family", entidadeId: id, actorId: userId, metadata: { origem: familyId } });
  return id;
}

/** "Adicionar variante" a uma família existente. */
export async function adicionarVariante(
  familyId: string,
  v: { visual_type: TipoVisual; scene_preset_id: string | null; fidelity_mode: ModoFidelidade; metodo: MetodoImagem; headline?: string | null },
  userId: string | null,
): Promise<string> {
  const f = await lerFamilia(familyId);
  if (f.status === "archived") throw new Error("Família arquivada.");
  const cfg = await lerConfig("criativos_v2");
  const { count } = await mlDb().from("ml_creatives").select("id", { count: "exact", head: true }).eq("family_id", familyId).not("status", "in", "(rejected,archived)");
  if ((count ?? 0) >= cfg.max_variantes_ativas_familia) throw new Error(`Família já tem ${count} variantes ativas (máximo ${cfg.max_variantes_ativas_familia}).`);
  const temOpenAI = await openai.configurada();
  const modoImg = imageMode(v.metodo, v.fidelity_mode, temOpenAI);
  const plano = f.plan as unknown as { referencia_ids?: string[]; editorial?: { titulo: string; pontos: string[] } | null; headlines?: string[] };
  const comTexto = v.visual_type !== "lifestyle_no_text";
  const { data, error } = await mlDb()
    .from("ml_creatives")
    .insert({
      product_id: f.product_id,
      angle_id: f.angle_id,
      family_id: familyId,
      visual_type: v.visual_type,
      scene_preset_id: v.scene_preset_id,
      fidelity_mode: v.visual_type === "product_layout" ? "original_layout" : v.fidelity_mode,
      source_media_ids: plano.referencia_ids ?? [],
      has_text_overlay: comTexto,
      headline: comTexto ? v.headline ?? (v.visual_type === "editorial" ? plano.editorial?.titulo : plano.headlines?.[0]) ?? null : null,
      editorial_points: v.visual_type === "editorial" ? plano.editorial?.pontos ?? [] : [],
      image_mode: modoImg,
      board_id: f.default_board_id,
      status: "to_generate",
      fidelity_status: modoImg === "manual_chatgpt" || modoImg === "upload" || v.fidelity_mode === "reference_generation" ? "pending" : "not_required",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  await registrarTransicao({ entidade: "creative", id, de: null, para: "to_generate", motivo: "Variante adicionada", actorId: userId, actorType: "user" });
  if (f.status === "active") await mlDb().from("ml_creative_families").update({ status: "generating" }).eq("id", familyId);
  await avancarVariante(id);
  return id;
}

/** Pendência quando nenhuma referência existe para um produto que precisa de criativos. */
export async function avisarSemReferencia(productId: string): Promise<void> {
  await abrirPendencia({
    tipo: "config_incomplete",
    titulo: "Selecione a referência do produto",
    detalhe: "Importe as imagens do anúncio e escolha a referência principal para gerar a família de criativos.",
    entidade: { tipo: "product", id: productId },
    dedupeKey: `sem_referencia:${productId}`,
    prioridade: 25,
  });
}


/**
 * "Gerar lote dos produtos elegíveis" (V2 §11.1): produtos prontos para criativo,
 * com referência principal e sem família ativa, recebem uma família com o mix
 * padrão. Respeita o limite de custo por lote (produto acima do limite é pulado).
 */
export async function gerarLotesElegiveis(limite: number, ator: Ator = {}): Promise<Record<string, unknown>> {
  const cfg = await lerConfig("criativos_v2");
  const { data } = await mlDb()
    .from("ml_products")
    .select("id")
    .eq("status", "ready_for_creative")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limite * 3);
  let criadas = 0;
  const pulados: { id: string; motivo: string }[] = [];
  const presets = (await presetsResumo([])).map((x) => x.id);
  for (const { id } of (data ?? []) as { id: string }[]) {
    if (criadas >= limite) break;
    const { count } = await mlDb().from("ml_creative_families").select("id", { count: "exact", head: true }).eq("product_id", id).in("status", ["planning", "generating", "active"]);
    if (count) continue;
    const refs = await referenciasDoProduto(id);
    if (!refs.principal) {
      await avisarSemReferencia(id);
      pulados.push({ id, motivo: "sem referência" });
      continue;
    }
    try {
      await criarFamiliaELote(id, { mix: cfg.mix, modo: cfg.modo_fidelidade_padrao, metodo: "auto", presetIds: presets }, ator);
      criadas++;
    } catch (e) {
      pulados.push({ id, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  if (criadas) await auditar({ acao: "automacao.gerar_lotes", actorId: ator.actorId, actorType: ator.actorType ?? "automation", metadata: { criadas, pulados } });
  return { familias: criadas, pulados: pulados.length };
}
