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
        confirmacao_whatsapp: "✅ Ja tinha anotado isso 🙂",
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
      confirmacao_whatsapp: "Nao reconheci esse numero. Vincule seu WhatsApp no app primeiro 🙂",
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

    const categoria = await matchPorNome(admin, "categorias", "nome", workspaceId, t.categoria);
    const pagador = await matchPorNome(admin, "entidades", "nome", workspaceId, t.pagador);
    const beneficiario = await matchPorNome(admin, "entidades", "nome", workspaceId, t.beneficiario);

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

    // 7b. Itens da nota — produtos (com pré-conferência) + itens_transacao
    let itensProcessados = 0;
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

        await admin.from("itens_transacao").insert({
          workspace_id: workspaceId,
          transacao_id: tx.id,
          produto_id: prod.produtoId,
          descricao_original: String(it.nome),
          quantidade: Number.isFinite(qtd) ? qtd : 1,
          unidade: it.unidade ?? null,
          valor_unitario: vUnit,
          valor_total: vTotal,
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
      `✅ Anotei: ${moeda(valor)} ${ondePartes.join(" ")}`.trim() + itensTxt + ". Detalhes no app.";
    if (pendencias > 0) {
      confirmacao += `\nℹ️ ${pendencias} ${pendencias === 1 ? "item" : "itens"} para voce conferir no app quando puder.`;
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
