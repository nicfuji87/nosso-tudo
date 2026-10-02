"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/lib/ml/acao";
import { auditar } from "@/lib/ml/auditoria";
import { mlDb } from "@/lib/ml/db";
import { configSchemas, lerConfig, salvarConfig, type SecaoConfig } from "@/lib/ml/config";
import { FATORES, PESOS_PADRAO, validarPesos, type Pesos } from "@/lib/ml/scoring/engine";
import { enfileirar } from "@/lib/ml/jobs/fila";
import { chutarWorker } from "@/lib/ml/jobs/chute";
import { sincronizarCategoria } from "@/lib/ml/servicos/categorias";

const revalidar = () => revalidatePath("/ml", "layout");
const SECOES_EDITAVEIS = ["geral", "descoberta", "scoring", "automacao", "publicacao", "ia", "criativos", "criativos_v2", "pinterest_copy"] as const;

export async function salvarSecao(secao: string, valores: Record<string, unknown>) {
  return executarAcao("admin", async (s) => {
    const sec = z.enum(SECOES_EDITAVEIS).parse(secao) as SecaoConfig;
    // valida o objeto completo (parcial mesclado com o atual) — erro legível por campo
    const atual = await lerConfig(sec);
    const r = configSchemas[sec].safeParse({ ...atual, ...valores });
    if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const { antes, depois } = await salvarConfig(sec, r.data as never, s.userId);
    await auditar({ acao: `config.${sec}`, entidade: "settings", entidadeId: sec, antes, depois, actorId: s.userId });
    revalidar();
    return { mensagem: "Configurações salvas." };
  });
}

// ---------------------------------------------------------------------------
// Níveis de automação (spec §18) — presets auditados
// ---------------------------------------------------------------------------
const PESOS_NIVEL_4: Pesos = {
  bestseller_rank: 18,
  trend: 13,
  pinterest_fit: 18,
  reviews: 9,
  commission: 9,
  price_range: 5,
  discount: 5,
  image_quality: 9,
  novelty: 4,
  performance: 10,
};

export async function aplicarNivelAutomacao(nivel: number) {
  return executarAcao("admin", async (s) => {
    const n = z.number().int().min(0).max(4).parse(nivel);
    const db = mlDb();
    const automacao = {
      auto_aprovar_produtos: n >= 3,
      auto_gerar_angulos: n >= 1,
      auto_selecionar_angulos: n >= 2 ? 2 : 0,
      auto_gerar_criativos: n >= 2,
      auto_aprovar_criativos: n >= 3,
      auto_agendar: n >= 3,
    };
    await salvarConfig("automacao", automacao, s.userId);
    await salvarConfig("geral", { nivel_automacao: n }, s.userId);
    if (n >= 3) await salvarConfig("publicacao", { exigir_aprovacao: false }, s.userId);
    else await salvarConfig("publicacao", { exigir_aprovacao: true }, s.userId);
    // Descoberta automática a partir do nível 1; geração automática a partir do 2.
    await db.from("ml_schedules").update({ enabled: n >= 1 }).in("key", ["discover_bestsellers", "discover_trends", "process_pipeline"]);
    await db.from("ml_schedules").update({ enabled: n >= 2 }).eq("key", "generate_creatives");
    await db.from("ml_schedules").update({ next_run_at: null }).in("key", ["discover_bestsellers", "discover_trends", "process_pipeline", "generate_creatives"]);
    // Nível 4: fórmula com performance histórica (nova versão; a anterior fica no histórico).
    if (n === 4) {
      const { data: ult } = await db.from("ml_scoring_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
      const versao = ((ult as { version: number } | null)?.version ?? 0) + 1;
      await db.from("ml_scoring_versions").insert({ version: versao, weights: PESOS_NIVEL_4, note: "Nível 4 — inclui performance histórica (10%)", created_by: s.userId });
      await salvarConfig("scoring", { versao_ativa: versao }, s.userId);
    }
    await auditar({ acao: "automacao.nivel", entidade: "settings", entidadeId: "nivel", actorId: s.userId, depois: { nivel: n, ...automacao } });
    revalidar();
    return { mensagem: `Nível ${n} aplicado.` };
  });
}

// ---------------------------------------------------------------------------
// Scoring: pesos versionados
// ---------------------------------------------------------------------------
export async function salvarPesos(pesos: Record<string, number>, nota?: string) {
  return executarAcao("admin", async (s) => {
    const v = validarPesos(pesos);
    if (!v.ok) throw new Error(v.erro);
    const limpos = Object.fromEntries(FATORES.map((f) => [f, Number(pesos[f])])) as Pesos;
    const db = mlDb();
    const { data: ult } = await db.from("ml_scoring_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
    const versao = ((ult as { version: number } | null)?.version ?? 0) + 1;
    const { error } = await db.from("ml_scoring_versions").insert({ version: versao, weights: limpos, note: z.string().max(300).optional().parse(nota) ?? null, created_by: s.userId });
    if (error) throw new Error(error.message);
    await salvarConfig("scoring", { versao_ativa: versao }, s.userId);
    await auditar({ acao: "scoring.nova_versao", entidade: "scoring", entidadeId: String(versao), depois: limpos, actorId: s.userId });
    revalidar();
    return { versao, mensagem: `Fórmula v${versao} ativada. Use "Reanalisar" para repontuar produtos.` };
  });
}

export async function ativarVersaoScoring(versao: number) {
  return executarAcao("admin", async (s) => {
    const v = z.number().int().min(1).parse(versao);
    const { data } = await mlDb().from("ml_scoring_versions").select("version").eq("version", v).maybeSingle();
    if (!data) throw new Error("Versão inexistente.");
    await salvarConfig("scoring", { versao_ativa: v }, s.userId);
    await auditar({ acao: "scoring.ativar_versao", entidade: "scoring", entidadeId: String(v), actorId: s.userId });
    revalidar();
    return { mensagem: `Versão ${v} ativa.` };
  });
}

export async function restaurarPesosPadrao() {
  return salvarPesos(PESOS_PADRAO as unknown as Record<string, number>, "Restaurado o padrão da especificação");
}

/** Repontua todos os produtos em triagem com a fórmula ativa. */
export async function repontuarTriagem() {
  return executarAcao("operator", async (s) => {
    const { data } = await mlDb().from("ml_products").select("id").in("status", ["analyzed", "discovered"]).limit(500);
    for (const { id } of (data ?? []) as { id: string }[]) {
      await enfileirar({ tipo: "SCORE_PRODUCT", payload: { product_id: id }, idempotencyKey: `score:${id}`, entidade: { tipo: "product", id }, criadoPor: s.userId });
    }
    await chutarWorker();
    return { mensagem: `${(data ?? []).length} produto(s) enfileirados para repontuar.` };
  });
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------
export async function sincronizarCategoriasRaiz() {
  return executarAcao("operator", async (s) => {
    const { job } = await enfileirar({ tipo: "SYNC_CATEGORIES", idempotencyKey: "sync_categories_root", criadoPor: s.userId });
    await chutarWorker();
    return { jobId: job.id, mensagem: "Buscando categorias do Mercado Livre…" };
  });
}

/** Expande uma categoria (busca subcategorias) — uma chamada rápida, feita na hora. */
export async function expandirCategoria(categoryId: string) {
  return executarAcao("operator", async () => {
    const c = await sincronizarCategoria(z.string().regex(/^MLB\d+$/).parse(categoryId));
    revalidar();
    return { mensagem: c.has_children ? "Subcategorias carregadas." : "Esta categoria não tem subcategorias." };
  });
}

const edicaoCategoria = z.object({
  tracked: z.boolean().optional(),
  prohibited: z.boolean().optional(),
  commission_pct: z.number().min(0).max(100).nullable().optional(),
  max_products: z.number().int().min(1).max(200).nullable().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
});

export async function atualizarCategoria(categoryId: string, dados: z.infer<typeof edicaoCategoria>) {
  return executarAcao("admin", async (s) => {
    const cid = z.string().regex(/^MLB\d+$/).parse(categoryId);
    const d = edicaoCategoria.parse(dados);
    const { data: antes } = await mlDb().from("ml_categories").select("tracked, prohibited, commission_pct, max_products, priority").eq("id", cid).maybeSingle();
    const { error } = await mlDb().from("ml_categories").update(d).eq("id", cid);
    if (error) throw new Error(error.message);
    await auditar({ acao: "categoria.atualizar", entidade: "category", entidadeId: cid, antes, depois: d, actorId: s.userId });
    revalidar();
    return { mensagem: "Categoria atualizada." };
  });
}

// ---------------------------------------------------------------------------
// Boards (mapeamento por categoria, padrão, ativo)
// ---------------------------------------------------------------------------
export async function atualizarBoard(boardId: string, dados: { category_ids?: string[]; is_default?: boolean; active?: boolean }) {
  return executarAcao("admin", async (s) => {
    const bid = z.string().uuid().parse(boardId);
    const d = z
      .object({ category_ids: z.array(z.string().regex(/^MLB\d+$/)).max(100).optional(), is_default: z.boolean().optional(), active: z.boolean().optional() })
      .parse(dados);
    if (d.is_default) await mlDb().from("ml_pinterest_boards").update({ is_default: false }).neq("id", bid);
    const { error } = await mlDb().from("ml_pinterest_boards").update(d).eq("id", bid);
    if (error) throw new Error(error.message);
    await auditar({ acao: "board.atualizar", entidade: "board", entidadeId: bid, depois: d, actorId: s.userId });
    revalidar();
    return { mensagem: "Board atualizado." };
  });
}

// ---------------------------------------------------------------------------
// Segurança: membros
// ---------------------------------------------------------------------------
export async function adicionarMembro(email: string, papel: string) {
  return executarAcao("owner", async (s) => {
    const e = z.string().email().parse(email.trim().toLowerCase());
    const p = z.enum(["viewer", "operator", "admin", "owner"]).parse(papel);
    const { data: perfil } = await mlDb().from("profiles").select("id").ilike("email", e).maybeSingle();
    if (!perfil) throw new Error("Nenhum usuário com este e-mail. A pessoa precisa criar conta no Nosso Tudo antes.");
    const pid = (perfil as { id: string }).id;
    const { error } = await mlDb().from("ml_members").upsert({ profile_id: pid, role: p, created_by: s.userId }, { onConflict: "profile_id" });
    if (error) throw new Error(error.message);
    await auditar({ acao: "membro.adicionar", entidade: "member", entidadeId: pid, depois: { email: e, papel: p }, actorId: s.userId });
    revalidar();
    return { mensagem: "Membro salvo." };
  });
}

export async function removerMembro(profileId: string) {
  return executarAcao("owner", async (s) => {
    const pid = z.string().uuid().parse(profileId);
    if (pid === s.userId) throw new Error("Você não pode remover a si mesmo.");
    await mlDb().from("ml_members").delete().eq("profile_id", pid);
    await auditar({ acao: "membro.remover", entidade: "member", entidadeId: pid, actorId: s.userId });
    revalidar();
    return { mensagem: "Acesso removido." };
  });
}

// ---------------------------------------------------------------------------
// V2: presets de cena e templates de prompt versionados
// ---------------------------------------------------------------------------
const presetSchema = z.object({
  name: z.string().min(2).max(80),
  environment: z.string().min(2).max(160),
  palette: z.string().max(200).nullish(),
  lighting: z.string().max(200).nullish(),
  style: z.string().max(200).nullish(),
  realism: z.string().max(60).optional(),
  text_area: z.enum(["top", "bottom", "none"]).optional(),
  restrictions: z.string().max(300).nullish(),
  category_hint: z.string().max(200).nullish(),
  active: z.boolean().optional(),
  sort: z.number().int().min(0).max(1000).optional(),
});

export async function salvarPreset(presetId: string | null, dados: z.infer<typeof presetSchema>) {
  return executarAcao("admin", async (s) => {
    const { salvarPreset: salvar } = await import("@/lib/ml/servicos/prompts");
    const idSalvo = await salvar(presetId ? z.string().uuid().parse(presetId) : null, presetSchema.parse(dados), s.userId);
    revalidar();
    return { presetId: idSalvo, mensagem: presetId ? "Preset atualizado." : "Preset criado." };
  });
}

export async function salvarTemplate(chave: string, corpo: string, nota?: string | null) {
  return executarAcao("admin", async (s) => {
    const { CHAVES_TEMPLATE, salvarNovaVersao } = await import("@/lib/ml/servicos/prompts");
    const k = z.enum(CHAVES_TEMPLATE).parse(chave);
    const v = await salvarNovaVersao(k, z.string().min(20).max(6000).parse(corpo), z.string().max(300).nullish().parse(nota) ?? null, s.userId);
    revalidar();
    return { versao: v, mensagem: `Template ${k} v${v} ativo. Novas gerações registram esta versão.` };
  });
}

export async function ativarTemplate(chave: string, versao: number) {
  return executarAcao("admin", async (s) => {
    const { CHAVES_TEMPLATE, ativarVersao } = await import("@/lib/ml/servicos/prompts");
    await ativarVersao(z.enum(CHAVES_TEMPLATE).parse(chave), z.number().int().min(1).parse(versao), s.userId);
    revalidar();
    return { mensagem: `Versão ${versao} ativada.` };
  });
}
