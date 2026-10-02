import "server-only";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { lerConfig, versaoConfig } from "../config";
import * as openai from "../integracoes/openai";
import { analiseSchema, analiseZod, entradaAnalise, promptAnalise, PROMPT_VERSAO } from "../conteudo/ia";
import { calcularScore, PESOS_PADRAO, priorVisualPorCategoria, type Pesos } from "../scoring/engine";
import { diasEntre, maiorLado, tendenciasQueCasam } from "../scoring/sinais";
import { caminhoNomes } from "./categorias";
import { aprovarProduto, lerProduto, mudarStatus } from "./produtos";
import type { AnaliseIA, CategoriaRow, ProdutoRow } from "../tipos";
import type { DadosProdutoConteudo } from "../conteudo/angulos";

export function dadosConteudo(p: ProdutoRow, cat: CategoriaRow | null): DadosProdutoConteudo {
  return {
    titulo: p.title,
    categoria: caminhoNomes(cat),
    atributos: ((p.attributes as { name: string; value: string }[] | null) ?? []).map((a) => ({ name: a.name, value: a.value })),
    marca: p.brand,
    preco: p.current_price != null ? Number(p.current_price) : null,
    rating: p.rating != null ? Number(p.rating) : null,
    avaliacoes: p.reviews_count,
    descricao: p.description,
  };
}

export async function pesosAtivos(): Promise<{ versao: number; pesos: Pesos }> {
  const sc = await lerConfig("scoring");
  const { data } = await mlDb().from("ml_scoring_versions").select("version, weights").eq("version", sc.versao_ativa).maybeSingle();
  const row = data as { version: number; weights: Partial<Pesos> } | null;
  return { versao: row?.version ?? 1, pesos: { ...PESOS_PADRAO, ...(row?.weights ?? {}) } };
}

async function analisarComIA(p: ProdutoRow, cat: CategoriaRow | null): Promise<AnaliseIA | null> {
  const ia = await lerConfig("ia");
  const imagem = ((p.pictures as { url: string }[] | null) ?? [])[0]?.url ?? p.thumbnail;
  const versao = await versaoConfig("ia");
  const r = await openai.gerarJson({
    modelo: ia.modelo_texto,
    nomeSchema: "analise_produto",
    jsonSchema: analiseSchema as unknown as Record<string, unknown>,
    validador: analiseZod,
    instrucoes: promptAnalise(ia.instrucoes_extras),
    entrada: [
      { type: "input_text", text: entradaAnalise(dadosConteudo(p, cat)) },
      ...(imagem ? [{ type: "input_image" as const, image_url: imagem, detail: "low" as const }] : []),
    ],
    esforco: ia.modo === "qualidade" ? "medium" : "low",
  });
  return { ...r.dados, modelo: r.modelo, analisado_em: new Date().toISOString(), prompt_version: `${PROMPT_VERSAO}+ia@${versao}` } as AnaliseIA;
}

/**
 * SCORE_PRODUCT: regras duras + engine (+ análise de IA opcional) → nova
 * versão de score (histórico preservado) → status ANALYZED → auto-aprovação
 * se a regra estiver ligada.
 */
export async function pontuarProduto(id: string, opts: { reanalisarIA?: boolean } = {}): Promise<Record<string, unknown>> {
  const db = mlDb();
  const p = await lerProduto(id);
  const [{ data: catData }, sc, desc, auto, { versao, pesos }] = await Promise.all([
    p.category_id ? db.from("ml_categories").select("*").eq("id", p.category_id).maybeSingle() : Promise.resolve({ data: null }),
    lerConfig("scoring"),
    lerConfig("descoberta"),
    lerConfig("automacao"),
    pesosAtivos(),
  ]);
  const cat = catData as CategoriaRow | null;
  const idsCaminho = ((cat?.path as { id: string }[] | null) ?? []).map((x) => x.id);

  // Proibida se ela ou algum ancestral estiver marcado.
  let proibida = Boolean(cat?.prohibited);
  let comissao = cat?.commission_pct != null ? Number(cat.commission_pct) : null;
  if (idsCaminho.length) {
    const { data: anc } = await db.from("ml_categories").select("id, prohibited, commission_pct").in("id", idsCaminho);
    const porId = new Map(((anc ?? []) as { id: string; prohibited: boolean; commission_pct: number | null }[]).map((a) => [a.id, a]));
    proibida = proibida || idsCaminho.some((i) => porId.get(i)?.prohibited);
    if (comissao == null) {
      for (const i of [...idsCaminho].reverse()) {
        const c = porId.get(i)?.commission_pct;
        if (c != null) {
          comissao = Number(c);
          break;
        }
      }
    }
  }

  // Tendências das últimas 2 semanas (gerais + da árvore da categoria).
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: trends } = await db
    .from("ml_trends")
    .select("keyword, category_id")
    .gte("week_start", desde)
    .limit(2000);
  const buscas = ((trends ?? []) as { keyword: string; category_id: string | null }[])
    .filter((t) => !t.category_id || idsCaminho.includes(t.category_id) || t.category_id === p.category_id)
    .map((t) => t.keyword);
  const casadas = tendenciasQueCasam(p.title, Array.from(new Set(buscas)));

  const { count: coletas } = await db.from("ml_product_rankings").select("id", { count: "exact", head: true }).eq("product_id", id);

  // Duplicata: mesmo anúncio vencedor / mesmo produto de catálogo já acompanhado.
  let duplicadoDe: string | null = null;
  if (desc.excluir_duplicatas && (p.item_id || p.external_type === "item")) {
    const chave = p.item_id ?? p.external_id;
    const { data: dup } = await db
      .from("ml_products")
      .select("id, first_seen_at")
      .neq("id", id)
      .or(`external_id.eq.${chave},item_id.eq.${chave}`)
      .lt("first_seen_at", p.first_seen_at)
      .limit(1);
    duplicadoDe = ((dup ?? []) as { id: string }[])[0]?.id ?? null;
  }

  // IA (opcional, com cache de 30 dias)
  let analise = (p.ai_analysis as AnaliseIA | null) ?? null;
  let erroIA: string | null = null;
  let iaNova = false;
  const iaVencida = !p.ai_analyzed_at || diasEntre(p.ai_analyzed_at) > 30;
  if (sc.usar_ia && (opts.reanalisarIA || iaVencida) && (await openai.configurada())) {
    try {
      analise = await analisarComIA(p, cat);
      iaNova = true;
    } catch (e) {
      erroIA = e instanceof Error ? e.message : String(e);
    }
  }

  const { data: perf } = await db
    .from("ml_performance_stats")
    .select("perf_score")
    .eq("dimension", "product")
    .eq("key", id)
    .eq("period_days", 90)
    .maybeSingle();

  const pictures = (p.pictures as { url: string; width?: number | null; height?: number | null }[] | null) ?? [];
  const resultado = calcularScore(
    {
      disponivel: p.available,
      temImagemUtilizavel: pictures.length > 0 || Boolean(p.thumbnail),
      emCooldownDeDescarte: Boolean(p.cooldown_until && new Date(p.cooldown_until).getTime() > Date.now()),
      categoriaProibida: proibida,
      duplicadoDe,
      posicaoRanking: p.current_rank,
      tamanhoListaRanking: sc.params.tamanhoRanking,
      variacaoRanking: p.rank_delta,
      novoNoRanking: (coletas ?? 0) <= 1 && p.current_rank != null,
      casaComTendencia: casadas.length > 0,
      temHistorico: (coletas ?? 0) >= 2,
      rating: p.rating != null ? Number(p.rating) : null,
      qtdAvaliacoes: p.reviews_count,
      preco: p.current_price != null ? Number(p.current_price) : null,
      precoOriginal: p.original_price != null ? Number(p.original_price) : null,
      descontoPct: p.discount_pct != null ? Number(p.discount_pct) : null,
      comissaoPct: comissao,
      qtdImagens: pictures.length,
      maiorLadoImagem: maiorLado(pictures),
      ia: analise ? { pinterestFit: analise.pinterest_fit, apeloVisual: analise.apelo_visual, qualidadeImagem: analise.qualidade_imagem } : null,
      priorVisualCategoria: priorVisualPorCategoria(caminhoNomes(cat)),
      vezesPromovido: p.times_promoted,
      diasDesdeUltimaPromocao: p.last_promoted_at ? diasEntre(p.last_promoted_at) : null,
      scorePerformance: (perf as { perf_score: number | null } | null)?.perf_score ?? null,
    },
    pesos,
    sc.params,
  );

  const motivo = [
    resultado.eligible ? null : `Inelegível: ${resultado.hardRuleFailures.join(" ")}`,
    erroIA ? `IA indisponível: ${erroIA}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;

  const { data: scoreRow, error } = await db
    .from("ml_product_scores")
    .insert({
      product_id: id,
      score: resultado.score,
      confidence: resultado.confidence,
      eligible: resultado.eligible,
      components: resultado.components,
      positives: [...resultado.positives, ...(analise?.pontos_fortes ?? []).map((x) => `IA: ${x}`)],
      alerts: [...resultado.alerts, ...(analise?.riscos ?? []).map((x) => `IA: ${x}`)],
      missing_data: resultado.missingData,
      hard_rule_failures: resultado.hardRuleFailures,
      formula_version: versao,
      weights: pesos,
      model: analise?.modelo ?? null,
      prompt_version: analise ? PROMPT_VERSAO : null,
      reason: motivo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao gravar score: ${error.message}`);

  await db
    .from("ml_products")
    .update({
      score: resultado.score,
      score_confidence: resultado.confidence,
      eligible: resultado.eligible,
      score_id: (scoreRow as { id: string }).id,
      trend_keywords: casadas,
      ...(analise && iaNova ? { ai_analysis: analise, ai_analyzed_at: analise.analisado_em ?? new Date().toISOString() } : {}),
    })
    .eq("id", id);

  const atual = await lerProduto(id);
  if (["discovered", "enriching", "error"].includes(atual.status)) {
    await mudarStatus(id, "analyzed", { motivo: `Score ${resultado.score} (confiança ${Math.round(resultado.confidence * 100)}%)`, actorType: "automation" });
  }

  // Auto-aprovação (nível de automação ≥ 3 ou regra ligada explicitamente)
  let autoAprovado = false;
  if (
    auto.auto_aprovar_produtos &&
    !auto.pausado &&
    resultado.eligible &&
    resultado.score >= auto.auto_aprovar_score_min &&
    resultado.confidence >= auto.auto_aprovar_confianca_min &&
    resultado.score >= desc.score_minimo_recomendar &&
    (await lerProduto(id)).status === "analyzed"
  ) {
    await aprovarProduto(id, {
      actorType: "automation",
      motivo: `Auto-aprovado: score ${resultado.score} ≥ ${auto.auto_aprovar_score_min} e confiança ${resultado.confidence} ≥ ${auto.auto_aprovar_confianca_min}`,
      metadata: { regra: "auto_aprovar_produtos", score: resultado.score, confianca: resultado.confidence, versao_formula: versao },
    });
    autoAprovado = true;
  }
  if (autoAprovado) {
    await auditar({ acao: "automacao.auto_aprovar", entidade: "product", entidadeId: id, actorType: "automation", metadata: { score: resultado.score } });
  }

  return { score: resultado.score, confianca: resultado.confidence, elegivel: resultado.eligible, ia: Boolean(analise), erroIA, autoAprovado };
}
