import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { normalizarTexto } from "@/lib/normalize";

/**
 * Classificação de itens/transações no servidor (paridade com a Edge
 * `ingest-whatsapp`): ancora categoria no padrão canônico, resolve produto
 * (memória), classifica item e resolve/cria contexto. Reaproveita as funções
 * SQL `buscar_match_categoria` / `buscar_match_produto`.
 */

type DB = ReturnType<typeof createClient>;

const ESSENCIALIDADES = new Set(["essencial", "necessario", "superfluo", "investimento"]);

/** Ancora um nome de categoria no padrão (exato → fuzzy pg_trgm). */
export async function resolverCategoriaCanonica(
  db: DB,
  workspaceId: string,
  nome: string | null | undefined,
  minScore = 0.45,
): Promise<{ id: string; nome: string } | null> {
  if (!nome) return null;
  const alvo = normalizarTexto(nome);
  const { data: cats } = await db
    .from("categorias")
    .select("id, nome")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true);
  const exato = (cats as { id: string; nome: string }[] | null)?.find(
    (c) => normalizarTexto(c.nome) === alvo,
  );
  if (exato) return { id: exato.id, nome: exato.nome };

  const { data } = await db.rpc("buscar_match_categoria", {
    p_workspace_id: workspaceId,
    p_nome: nome,
  });
  const top = (data as { id: string; nome: string; score: number }[] | null)?.[0];
  if (top && Number(top.score) >= minScore) return { id: top.id, nome: top.nome };
  return null;
}

export interface ProdutoResolvido {
  produtoId: string | null;
  status: "confirmado" | "sugerido" | "novo";
  score: number | null;
  sugestaoCriada: boolean;
}

/** Resolve produto (código de barras → fuzzy → auto/sugestão/novo). */
export async function resolverProduto(
  db: DB,
  workspaceId: string,
  nomeRaw: string,
  codigoBarras: string | null = null,
): Promise<ProdutoResolvido> {
  const nome = nomeRaw.trim();
  const normalizado = normalizarTexto(nome);
  if (!normalizado) return { produtoId: null, status: "novo", score: null, sugestaoCriada: false };

  const { data: candidatos } = await db.rpc("buscar_match_produto", {
    p_workspace_id: workspaceId,
    p_nome: nome,
    p_codigo_barras: codigoBarras,
  });
  const top = (candidatos as { id: string; nome: string; score: number }[] | null)?.[0];
  const score = top ? Number(top.score) : 0;
  if (top && score >= 0.95) {
    return { produtoId: top.id, status: "confirmado", score, sugestaoCriada: false };
  }

  const { data: novo } = await db
    .from("produtos")
    .insert({
      workspace_id: workspaceId,
      nome,
      nome_normalizado: normalizado,
      codigo_barras: codigoBarras,
      status_revisao: "novo",
    })
    .select("id, nome")
    .maybeSingle();
  const novoRow = novo as { id: string; nome: string } | null;

  if (top && score >= 0.6 && novoRow) {
    await db.from("sugestoes_match").insert({
      workspace_id: workspaceId,
      tipo: "produto",
      registro_origem_id: novoRow.id,
      registro_sugerido_id: top.id,
      texto_origem: nome,
      texto_sugerido: top.nome,
      score_confianca: score,
      origem: "app",
    });
    return { produtoId: novoRow.id, status: "sugerido", score, sugestaoCriada: true };
  }
  return { produtoId: novoRow?.id ?? null, status: "novo", score, sugestaoCriada: false };
}

/**
 * Classifica um item: categoria (memória do produto → hint ancorado →
 * categoria da transação), essencialidade (memória → hint → default da
 * categoria) e tipo. Aprende o que faltava na memória do produto.
 */
export async function classificarItem(
  db: DB,
  workspaceId: string,
  produtoId: string | null,
  hintCategoria: string | null,
  hintEssencialidade: string | null,
  hintTipo: string | null,
  txCategoriaId: string | null,
): Promise<{ categoriaId: string | null; essencialidade: string | null; tipo: string | null }> {
  let produtoCat: string | null = null;
  let produtoEss: string | null = null;
  let produtoTipo: string | null = null;
  if (produtoId) {
    const { data: p } = await db
      .from("produtos")
      .select("categoria_sugerida_id, essencialidade_padrao, tipo_padrao")
      .eq("id", produtoId)
      .maybeSingle();
    const row = p as
      | { categoria_sugerida_id: string | null; essencialidade_padrao: string | null; tipo_padrao: string | null }
      | null;
    produtoCat = row?.categoria_sugerida_id ?? null;
    produtoEss = row?.essencialidade_padrao ?? null;
    produtoTipo = row?.tipo_padrao ?? null;
  }

  let categoriaId = produtoCat;
  if (!categoriaId) {
    const m = await resolverCategoriaCanonica(db, workspaceId, hintCategoria);
    categoriaId = m?.id ?? null;
  }
  if (!categoriaId) categoriaId = txCategoriaId;

  let essencialidade =
    produtoEss ?? (hintEssencialidade && ESSENCIALIDADES.has(hintEssencialidade) ? hintEssencialidade : null);
  if (!essencialidade && categoriaId) {
    const { data: c } = await db
      .from("categorias")
      .select("essencialidade_padrao")
      .eq("id", categoriaId)
      .maybeSingle();
    essencialidade = (c as { essencialidade_padrao: string | null } | null)?.essencialidade_padrao ?? null;
  }

  const tipo = produtoTipo ?? (hintTipo ? String(hintTipo) : null);

  if (produtoId) {
    const patch: Record<string, unknown> = {};
    if (!produtoCat && categoriaId) patch.categoria_sugerida_id = categoriaId;
    if (!produtoEss && essencialidade) patch.essencialidade_padrao = essencialidade;
    if (!produtoTipo && tipo) patch.tipo_padrao = tipo;
    if (Object.keys(patch).length > 0) await db.from("produtos").update(patch).eq("id", produtoId);
  }

  return { categoriaId, essencialidade, tipo };
}

/** Resolve (ou cria) o contexto/evento da compra a partir de um nome. */
export async function resolverContexto(
  db: DB,
  workspaceId: string,
  nomeRaw: string | null | undefined,
  tipo: string | null = null,
  dataReferencia: string | null = null,
): Promise<string | null> {
  const nome = (nomeRaw ?? "").trim();
  if (!nome) return null;
  const alvo = normalizarTexto(nome);
  const { data: existentes } = await db
    .from("contextos")
    .select("id, nome")
    .eq("workspace_id", workspaceId)
    .eq("arquivado", false);
  const achado = (existentes as { id: string; nome: string }[] | null)?.find(
    (x) => normalizarTexto(x.nome) === alvo,
  );
  if (achado) return achado.id;

  const { data: novo } = await db
    .from("contextos")
    .insert({ workspace_id: workspaceId, nome, tipo, data_referencia: dataReferencia })
    .select("id")
    .maybeSingle();
  return (novo as { id: string } | null)?.id ?? null;
}
