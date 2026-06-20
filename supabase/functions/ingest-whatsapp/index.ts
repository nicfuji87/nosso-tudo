import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---- shared (inline para deploy self-contained) ----------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const serviceClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// ---- Enums espelhando o schema ---------------------------------------------
const TIPOS = new Set([
  "despesa",
  "receita",
  "transferencia",
  "investimento_aporte",
  "investimento_resgate",
]);
const MEIOS = new Set([
  "cartao_credito",
  "cartao_debito",
  "pix",
  "dinheiro",
  "transferencia",
  "boleto",
  "vr",
  "va",
  "cartao_escola",
  "outro",
]);

const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface MatchResult {
  id: string | null;
  nome: string | null;
  match: "auto" | "sugestao" | "novo" | "existente" | null;
  score: number | null;
}

/** Resolve estabelecimento em 4 camadas (exato → fuzzy → auto/sugestão/novo). */
async function resolverEstabelecimento(
  admin: SupabaseClient,
  workspaceId: string,
  nomeRaw: string,
): Promise<{ result: MatchResult; sugestaoCriada: boolean }> {
  const nome = nomeRaw.trim();
  const normalizado = norm(nome);
  if (!normalizado) return { result: { id: null, nome: null, match: null, score: null }, sugestaoCriada: false };

  // 1. Match exato normalizado
  const { data: exato } = await admin
    .from("estabelecimentos")
    .select("id, nome")
    .eq("workspace_id", workspaceId)
    .eq("nome_normalizado", normalizado)
    .maybeSingle();
  if (exato) {
    return { result: { id: exato.id, nome: exato.nome, match: "existente", score: 1 }, sugestaoCriada: false };
  }

  // 2. Match fuzzy (pg_trgm) reusando a função SQL existente
  const { data: candidatos } = await admin.rpc("buscar_match_estabelecimento", {
    p_workspace_id: workspaceId,
    p_nome: nome,
  });
  const top = (candidatos as Array<{ id: string; nome: string; score: number }> | null)?.[0];
  const score = top ? Number(top.score) : 0;

  // ≥ 0.95 → auto-vincula ao existente
  if (top && score >= 0.95) {
    return { result: { id: top.id, nome: top.nome, match: "auto", score }, sugestaoCriada: false };
  }

  // Cria novo estabelecimento (origem whatsapp)
  const { data: novo } = await admin
    .from("estabelecimentos")
    .insert({
      workspace_id: workspaceId,
      nome,
      nome_normalizado: normalizado,
      origem_criacao: "whatsapp",
      status_revisao: "novo",
    })
    .select("id, nome")
    .maybeSingle();

  // 0.60–0.94 → zona cinza: registra sugestão para o Inbox de Revisão
  if (top && score >= 0.6 && novo) {
    await admin.from("sugestoes_match").insert({
      workspace_id: workspaceId,
      tipo: "estabelecimento",
      registro_origem_id: novo.id,
      registro_sugerido_id: top.id,
      texto_origem: nome,
      texto_sugerido: top.nome,
      score_confianca: score,
      origem: "whatsapp",
    });
    return { result: { id: novo.id, nome: novo.nome, match: "sugestao", score }, sugestaoCriada: true };
  }

  return { result: { id: novo?.id ?? null, nome: novo?.nome ?? nome, match: "novo", score }, sugestaoCriada: false };
}

/** Match simples por nome (categoria/entidade) — exato normalizado, sem criar. */
async function matchPorNome(
  admin: SupabaseClient,
  table: string,
  campoNome: string,
  workspaceId: string,
  nomeRaw: string | undefined | null,
): Promise<{ id: string; nome: string } | null> {
  if (!nomeRaw) return null;
  const alvo = norm(nomeRaw);
  const { data } = await admin
    .from(table)
    .select(`id, ${campoNome}`)
    .eq("workspace_id", workspaceId);
  const row = (data as Array<Record<string, string>> | null)?.find(
    (r) => norm(r[campoNome]) === alvo,
  );
  return row ? { id: row.id, nome: row[campoNome] } : null;
}

interface ItemResult {
  produtoId: string | null;
  status: "confirmado" | "sugerido" | "novo";
  score: number | null;
  sugestaoCriada: boolean;
}

/** Resolve produto (código de barras → exato → fuzzy → auto/sugestão/novo). */
async function resolverProduto(
  admin: SupabaseClient,
  workspaceId: string,
  nomeRaw: string,
  codigoBarras: string | null,
): Promise<ItemResult> {
  const nome = nomeRaw.trim();
  const normalizado = norm(nome);
  if (!normalizado) return { produtoId: null, status: "novo", score: null, sugestaoCriada: false };

  // buscar_match_produto resolve código de barras (score 1.0) e fuzzy por nome/apelido
  const { data: candidatos } = await admin.rpc("buscar_match_produto", {
    p_workspace_id: workspaceId,
    p_nome: nome,
    p_codigo_barras: codigoBarras,
  });
  const top = (candidatos as Array<{ id: string; nome: string; score: number }> | null)?.[0];
  const score = top ? Number(top.score) : 0;

  // ≥ 0.95 (ou código de barras) → sincroniza com o existente, sem duplicar
  if (top && score >= 0.95) {
    return { produtoId: top.id, status: "confirmado", score, sugestaoCriada: false };
  }

  const { data: novo } = await admin
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

  // 0.60–0.94 → pré-conferência: cria sugestão para o Inbox
  if (top && score >= 0.6 && novo) {
    await admin.from("sugestoes_match").insert({
      workspace_id: workspaceId,
      tipo: "produto",
      registro_origem_id: novo.id,
      registro_sugerido_id: top.id,
      texto_origem: nome,
      texto_sugerido: top.nome,
      score_confianca: score,
      origem: "whatsapp",
    });
    return { produtoId: novo.id, status: "sugerido", score, sugestaoCriada: true };
  }

  return { produtoId: novo?.id ?? null, status: "novo", score, sugestaoCriada: false };
}

const ESSENCIALIDADES = new Set(["essencial", "necessario", "superfluo", "investimento"]);

/**
 * Ancora um nome de categoria no padrão. Entende o formato "Grupo › Subcategoria"
 * que a Nia/n8n manda (separadores › ou >, não "/" nem "," — que aparecem em nomes
 * canônicos como "Óculos/lentes"), resolvendo a folha pelo par sub+grupo-pai — assim
 * desambigua subcategorias de mesmo nome em grupos diferentes (Passeios em Lazer ×
 * Viagens, Vacinas em Saúde × Pets). Cai para exato (preferindo a subcategoria ao
 * grupo homônimo) e, por fim, fuzzy pg_trgm. Paridade com lib/classificacao.ts.
 */
async function resolverCategoriaCanonica(
  admin: SupabaseClient,
  workspaceId: string,
  nomeRaw: string | undefined | null,
  minScore = 0.45,
): Promise<{ id: string; nome: string } | null> {
  if (!nomeRaw) return null;
  const nome = String(nomeRaw);
  const { data: catsData } = await admin
    .from("categorias")
    .select("id, nome, categoria_pai_id")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true);
  const cats =
    (catsData as Array<{ id: string; nome: string; categoria_pai_id: string | null }> | null) ?? [];
  const nomePorId = new Map(cats.map((c) => [c.id, c.nome]));

  const partes = nome.split(/\s*[›>»]\s*/).map((s) => s.trim()).filter(Boolean);
  if (partes.length >= 2) {
    const grupoAlvo = norm(partes[partes.length - 2]!);
    const subAlvo = norm(partes[partes.length - 1]!);
    const folhas = cats.filter((c) => c.categoria_pai_id && norm(c.nome) === subAlvo);
    const comPai = folhas.find((c) => norm(nomePorId.get(c.categoria_pai_id!) ?? "") === grupoAlvo);
    if (comPai) return { id: comPai.id, nome: comPai.nome };
    if (folhas[0]) return { id: folhas[0].id, nome: folhas[0].nome };
    const grupo = cats.find((c) => !c.categoria_pai_id && norm(c.nome) === grupoAlvo);
    if (grupo) return { id: grupo.id, nome: grupo.nome };
  }

  const alvo = norm(nome);
  const exatos = cats.filter((c) => norm(c.nome) === alvo);
  const exato = exatos.find((c) => c.categoria_pai_id) ?? exatos[0]; // prefere subcategoria
  if (exato) return { id: exato.id, nome: exato.nome };

  const { data } = await admin.rpc("buscar_match_categoria", {
    p_workspace_id: workspaceId,
    p_nome: nome,
  });
  const top = (data as Array<{ id: string; nome: string; score: number }> | null)?.[0];
  if (top && Number(top.score) >= minScore) return { id: top.id, nome: top.nome };
  return null;
}

/** Resolve (ou cria) o contexto/evento da compra. Aceita string ou {nome,tipo,data}. */
async function resolverContexto(
  admin: SupabaseClient,
  workspaceId: string,
  ctxRaw: unknown,
): Promise<string | null> {
  if (!ctxRaw) return null;
  const isObj = typeof ctxRaw === "object" && ctxRaw !== null;
  const c = ctxRaw as Record<string, unknown>;
  const nome = (isObj ? String(c.nome ?? "") : String(ctxRaw)).trim();
  if (!nome) return null;
  const tipo = isObj && c.tipo ? String(c.tipo) : null;
  const data = isObj ? ((c.data ?? c.data_referencia) as string | null) ?? null : null;

  const alvo = norm(nome);
  const { data: existentes } = await admin
    .from("contextos")
    .select("id, nome")
    .eq("workspace_id", workspaceId)
    .eq("arquivado", false);
  const achado = (existentes as Array<{ id: string; nome: string }> | null)?.find(
    (x) => norm(x.nome) === alvo,
  );
  if (achado) return achado.id;

  const { data: novo } = await admin
    .from("contextos")
    .insert({ workspace_id: workspaceId, nome, tipo, data_referencia: data })
    .select("id")
    .maybeSingle();
  return (novo as { id: string } | null)?.id ?? null;
}

/**
 * Classifica um item: categoria (memória do produto → hint ancorado → categoria
 * da transação), essencialidade (produto → hint → default da categoria) e tipo.
 * Aprende o que faltava de volta na memória do produto.
 */
async function classificarItem(
  admin: SupabaseClient,
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
    const { data: p } = await admin
      .from("produtos")
      .select("categoria_sugerida_id, essencialidade_padrao, tipo_padrao")
      .eq("id", produtoId)
      .maybeSingle();
    produtoCat = (p?.categoria_sugerida_id as string | null) ?? null;
    produtoEss = (p?.essencialidade_padrao as string | null) ?? null;
    produtoTipo = (p?.tipo_padrao as string | null) ?? null;
  }

  // categoria
  let categoriaId = produtoCat;
  if (!categoriaId) {
    const m = await resolverCategoriaCanonica(admin, workspaceId, hintCategoria);
    categoriaId = m?.id ?? null;
  }
  if (!categoriaId) categoriaId = txCategoriaId;

  // essencialidade
  let essencialidade =
    produtoEss ?? (hintEssencialidade && ESSENCIALIDADES.has(hintEssencialidade) ? hintEssencialidade : null);
  if (!essencialidade && categoriaId) {
    const { data: c } = await admin
      .from("categorias")
      .select("essencialidade_padrao")
      .eq("id", categoriaId)
      .maybeSingle();
    essencialidade = (c?.essencialidade_padrao as string | null) ?? null;
  }

  const tipo = produtoTipo ?? (hintTipo ? String(hintTipo) : null);

  // aprende na memória do produto (só o que ainda faltava)
  if (produtoId) {
    const patch: Record<string, unknown> = {};
    if (!produtoCat && categoriaId) patch.categoria_sugerida_id = categoriaId;
    if (!produtoEss && essencialidade) patch.essencialidade_padrao = essencialidade;
    if (!produtoTipo && tipo) patch.tipo_padrao = tipo;
    if (Object.keys(patch).length > 0) await admin.from("produtos").update(patch).eq("id", produtoId);
  }

  return { categoriaId, essencialidade, tipo };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = serviceClient();

  // 1. Auth via secret compartilhado (config WhatsApp)
  const { data: cfgRow } = await admin
    .from("integration_settings")
    .select("secrets")
    .eq("key", "whatsapp")
    .maybeSingle();
  const ingestSecret = cfgRow?.secrets?.ingest_secret as string | undefined;
  const provided = req.headers.get("x-webhook-secret");
  if (!ingestSecret || provided !== ingestSecret) {
    return json({ ok: false, error: "secret_invalido" }, 401);
  }

  // 2. Payload
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "payload_invalido" }, 400);
  }
  const telefone = String(body.telefone ?? "").trim();
  const t = body.transacao ?? {};
  if (!telefone) return json({ ok: false, error: "telefone_ausente" }, 400);
  if (!t.descricao || t.valor === undefined || t.valor === null) {
    return json({ ok: false, error: "payload_invalido", detalhe: "descricao e valor sao obrigatorios" }, 400);
  }
  const valor = Number(t.valor);
  if (!Number.isFinite(valor) || valor < 0) return json({ ok: false, error: "valor_invalido" }, 400);

  // 3. Idempotência
  const idk = body.idempotency_key ? String(body.idempotency_key) : null;
  if (idk) {
    const { data: prev } = await admin
      .from("whatsapp_ingest_log")
      .select("transacao_id")
      .eq("idempotency_key", idk)
      .maybeSingle();
    if (prev) {
      return json({
        ok: true,
        duplicado: true,
        transacao_id: prev.transacao_id,
        confirmacao_whatsapp: "OK Ja tinha anotado isso",
      });
    }
  }

  // 4. Roteamento telefone → workspace
  const { data: rota } = await admin.rpc("resolve_whatsapp", { p_telefone: telefone });
  const r = (rota as Array<{ workspace_id: string; profile_id: string; verificado: boolean }> | null)?.[0];
  if (!r) {
    return json({
      ok: false,
      error: "telefone_nao_vinculado",
      confirmacao_whatsapp: "Nao reconheci esse numero. Vincule seu WhatsApp no app primeiro.",
    });
  }
  if (!r.verificado) {
    return json({
      ok: false,
      error: "telefone_nao_verificado",
      confirmacao_whatsapp: "Seu numero ainda nao foi verificado no app.",
    });
  }
  const workspaceId = r.workspace_id;
  const profileId = r.profile_id;

  try {
    let pendencias = 0;

    // 5. Resolução de relacionados
    const estab = t.estabelecimento
      ? await resolverEstabelecimento(admin, workspaceId, String(t.estabelecimento))
      : { result: { id: null, nome: null, match: null, score: null } as MatchResult, sugestaoCriada: false };
    if (estab.sugestaoCriada) pendencias++;

    const categoria = await resolverCategoriaCanonica(admin, workspaceId, t.categoria);
    const pagador = await matchPorNome(admin, "entidades", "nome", workspaceId, t.pagador);
    const beneficiario = await matchPorNome(admin, "entidades", "nome", workspaceId, t.beneficiario);

    // contexto/evento da compra (ex.: "Passeio em família", "Compra do mês")
    const contextoId = await resolverContexto(admin, workspaceId, t.contexto);

    // cartão: por apelido ou últimos dígitos
    let cartaoId: string | null = null;
    if (t.cartao) {
      const { data: cartoes } = await admin
        .from("cartoes")
        .select("id, apelido, ultimos_digitos")
        .eq("workspace_id", workspaceId);
      const list = (cartoes as Array<{ id: string; apelido: string; ultimos_digitos: string | null }> | null) ?? [];
      const byFinal = t.cartao.final
        ? list.find((c) => c.ultimos_digitos === String(t.cartao.final))
        : undefined;
      const byNome = t.cartao.nome
        ? list.find((c) => norm(c.apelido) === norm(String(t.cartao.nome)))
        : undefined;
      cartaoId = (byFinal ?? byNome)?.id ?? null;
    }

    // conta: por apelido
    let contaId: string | null = null;
    if (t.conta?.nome) {
      const conta = await matchPorNome(admin, "contas_bancarias", "apelido", workspaceId, t.conta.nome);
      contaId = conta?.id ?? null;
    }

    // tipo / meio
    const tipo = TIPOS.has(t.tipo) ? t.tipo : "despesa";
    const meio = MEIOS.has(t.meio_pagamento) ? t.meio_pagamento : null;
    const dataTx = typeof t.data_transacao === "string" ? t.data_transacao : new Date().toISOString().slice(0, 10);

    // 6. Mídias (anexos externos já hospedados)
    let midiaId: string | null = null;
    if (Array.isArray(body.midias) && body.midias.length > 0) {
      const rows = body.midias
        .filter((m: any) => m?.url)
        .map((m: any) => ({
          workspace_id: workspaceId,
          bucket: "whatsapp-externo",
          storage_path: String(m.url),
          tipo: ["imagem", "pdf", "audio", "video", "texto", "documento"].includes(m.tipo) ? m.tipo : "documento",
          mime_type: m.mime_type ?? null,
          origem: "whatsapp",
          whatsapp_telefone: telefone,
          enviado_por: profileId,
          texto_extraido: m.texto_extraido ?? null,
          metadados: { url: m.url },
        }));
      if (rows.length > 0) {
        const { data: midias } = await admin.from("midias").insert(rows).select("id");
        midiaId = (midias as Array<{ id: string }> | null)?.[0]?.id ?? null;
      }
    }

    // 7. Cria a transação
    const score = estab.result.score ?? null;
    const { data: tx, error: txErr } = await admin
      .from("transacoes")
      .insert({
        workspace_id: workspaceId,
        tipo,
        descricao: String(t.descricao),
        valor,
        data_transacao: dataTx,
        categoria_id: categoria?.id ?? null,
        meio_pagamento: meio,
        cartao_id: cartaoId,
        conta_id: contaId,
        pagador_id: pagador?.id ?? null,
        beneficiario_id: beneficiario?.id ?? null,
        estabelecimento_id: estab.result.id,
        contexto_id: contextoId,
        observacoes: t.observacoes ?? null,
        tags: Array.isArray(t.tags) ? t.tags : [],
        origem: "whatsapp",
        criado_por: profileId,
        midia_id: midiaId,
        status_revisao: "confirmado",
        score_confianca: score,
      })
      .select("id")
      .maybeSingle();

    if (txErr || !tx) {
      return json({ ok: false, error: "falha_criar_transacao", detalhe: txErr?.message }, 500);
    }

    // 7b. Itens da nota — produtos (pré-conferência) + classificação + itens_transacao
    let itensProcessados = 0;
    const catTotais = new Map<string, number>(); // categoria_id → soma, p/ categoria dominante
    if (Array.isArray(body.itens) && body.itens.length > 0) {
      let ordem = 0;
      for (const it of body.itens) {
        if (!it?.nome) continue;
        ordem++;
        const prod = await resolverProduto(
          admin,
          workspaceId,
          String(it.nome),
          it.codigo_barras ? String(it.codigo_barras) : null,
        );
        if (prod.sugestaoCriada) pendencias++;

        const qtd = Number(it.quantidade ?? 1);
        const vUnit = it.valor_unitario != null ? Number(it.valor_unitario) : null;
        const vTotal =
          it.valor_total != null ? Number(it.valor_total) : vUnit != null ? vUnit * qtd : null;

        // Classifica: categoria (memória → hint → transação), essencialidade, tipo
        const hintTipo = it.tipo ?? it.tipo_item ?? null;
        const cls = await classificarItem(
          admin,
          workspaceId,
          prod.produtoId,
          it.categoria ? String(it.categoria) : null,
          it.essencialidade ? String(it.essencialidade) : null,
          hintTipo ? String(hintTipo) : null,
          categoria?.id ?? null,
        );
        if (cls.categoriaId) {
          catTotais.set(cls.categoriaId, (catTotais.get(cls.categoriaId) ?? 0) + (vTotal ?? 0));
        }

        await admin.from("itens_transacao").insert({
          workspace_id: workspaceId,
          transacao_id: tx.id,
          produto_id: prod.produtoId,
          descricao_original: String(it.nome),
          quantidade: Number.isFinite(qtd) ? qtd : 1,
          unidade: it.unidade ?? null,
          valor_unitario: vUnit,
          valor_total: vTotal,
          categoria_id: cls.categoriaId,
          essencialidade: cls.essencialidade ?? undefined, // undefined → default 'necessario'
          tipo_item: cls.tipo,
          status_revisao: prod.status,
          score_confianca: prod.score,
          ordem_na_nota: ordem,
        });

        // Atualiza histórico do produto (último preço/estabelecimento/compra)
        if (prod.produtoId) {
          await admin
            .from("produtos")
            .update({
              ultimo_preco_unitario: vUnit,
              ultima_compra_em: dataTx,
              ultimo_estabelecimento_id: estab.result.id,
            })
            .eq("id", prod.produtoId);
        }
        itensProcessados++;
      }
    }

    // 7c. Se a transação não tinha categoria, herda a dominante dos itens
    if (!categoria?.id && catTotais.size > 0) {
      const dominante = [...catTotais.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (dominante) {
        await admin.from("transacoes").update({ categoria_id: dominante }).eq("id", tx.id);
      }
    }

    // 8. Registra idempotência
    if (idk) {
      await admin
        .from("whatsapp_ingest_log")
        .insert({ idempotency_key: idk, workspace_id: workspaceId, transacao_id: tx.id });
    }

    // 9. Confirmação concisa (RF-124)
    const ondePartes: string[] = [];
    if (estab.result.nome) ondePartes.push(`no ${estab.result.nome}`);
    const itensTxt =
      itensProcessados > 0 ? ` (${itensProcessados} ${itensProcessados === 1 ? "item" : "itens"})` : "";
    let confirmacao =
      `OK Anotei: ${moeda(valor)} ${ondePartes.join(" ")}`.trim() + itensTxt + ". Detalhes no app.";
    if (pendencias > 0) {
      confirmacao += `\n${pendencias} ${pendencias === 1 ? "item" : "itens"} para voce conferir no app quando puder.`;
    }

    return json({
      ok: true,
      transacao_id: tx.id,
      status_revisao: "confirmado",
      score_confianca: score,
      estabelecimento: estab.result.id
        ? { id: estab.result.id, nome: estab.result.nome, match: estab.result.match, score }
        : null,
      categoria: categoria ? { id: categoria.id, nome: categoria.nome } : null,
      itens: itensProcessados,
      pendencias_inbox: pendencias,
      confirmacao_whatsapp: confirmacao,
    });
  } catch (e) {
    return json({ ok: false, error: "erro_interno", detalhe: String(e) }, 500);
  }
});
