import "server-only";
import { mlDb } from "../db";
import { lerConfig } from "../config";
import { enfileirar } from "../jobs/fila";
import { BUCKET } from "../media/storage";
import * as ml from "../integracoes/mercadolivre";
import * as pinterest from "../integracoes/pinterest";
import * as openai from "../integracoes/openai";
import * as apify from "../integracoes/apify";
import { lerIntegracao, atualizarIntegracao } from "../integracoes/estado";
import { obterTokenValido } from "../integracoes/tokens";
import { abrirPendencia, resolverPendenciasPorChave } from "./pendencias";
import { sincronizarCategoria } from "./categorias";
import type { CtxJob } from "../jobs/executor";

/**
 * PROCESS_PIPELINE ("varredor"): pega o que ficou para trás — produto
 * descoberto sem enriquecer, enriquecido sem score, categorias sem nome — e
 * enfileira o passo certo. Idempotente (chaves por entidade).
 */
export async function processarPipeline(lote: number): Promise<Record<string, unknown>> {
  const db = mlDb();
  const dezMin = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: semEnriquecer } = await db
    .from("ml_products")
    .select("id")
    .in("status", ["discovered", "error"])
    .is("enriched_at", null)
    .lt("updated_at", dezMin)
    .limit(lote);
  for (const { id } of (semEnriquecer ?? []) as { id: string }[]) {
    await enfileirar({ tipo: "ENRICH_PRODUCT", payload: { product_id: id }, idempotencyKey: `enrich:${id}`, entidade: { tipo: "product", id } });
  }
  const { data: semScore } = await db
    .from("ml_products")
    .select("id")
    .in("status", ["discovered", "enriching"])
    .not("enriched_at", "is", null)
    .lt("updated_at", dezMin)
    .limit(lote);
  for (const { id } of (semScore ?? []) as { id: string }[]) {
    await enfileirar({ tipo: "SCORE_PRODUCT", payload: { product_id: id }, idempotencyKey: `score:${id}`, entidade: { tipo: "product", id } });
  }
  // Criativos travados em geração sem job ativo (ex.: job morreu) voltam para a fila.
  const { data: travados } = await db
    .from("ml_creatives")
    .select("id, copy_status, image_status")
    .in("status", ["to_generate", "generating"])
    .lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .limit(lote);
  for (const c of (travados ?? []) as { id: string; copy_status: string; image_status: string }[]) {
    if (c.copy_status !== "ready") {
      await enfileirar({ tipo: "GENERATE_COPY", payload: { creative_id: c.id, then_image: true }, idempotencyKey: `copy:${c.id}`, entidade: { tipo: "creative", id: c.id } });
    } else if (c.image_status !== "ready" && c.image_status !== "waiting_manual") {
      await enfileirar({ tipo: "GENERATE_IMAGE", payload: { creative_id: c.id }, idempotencyKey: `image:${c.id}`, entidade: { tipo: "creative", id: c.id } });
    }
  }
  // Categorias criadas só com o id (placeholder) ganham nome/caminho.
  const { data: semNome } = await db.from("ml_categories").select("id, name").limit(200);
  let categorias = 0;
  for (const c of ((semNome ?? []) as { id: string; name: string }[]).filter((x) => x.id === x.name).slice(0, 5)) {
    try {
      await sincronizarCategoria(c.id);
      categorias++;
    } catch {
      /* tenta na próxima */
    }
  }
  return {
    enriquecer: (semEnriquecer ?? []).length,
    pontuar: (semScore ?? []).length,
    criativos_retomados: (travados ?? []).length,
    categorias,
  };
}

/** GENERATE_PENDING_CREATIVES: produtos prontos para criativo sem nenhum → ângulos/criativos. */
export async function gerarCriativosPendentes(porExecucao: number): Promise<Record<string, unknown>> {
  const auto = await lerConfig("automacao");
  if (!auto.auto_gerar_criativos) return { ignorado: "Geração automática de criativos desligada." };
  const { data } = await mlDb().from("ml_products").select("id").eq("status", "ready_for_creative").order("score", { ascending: false }).limit(porExecucao);
  let n = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const { criado } = await enfileirar({
      tipo: "GENERATE_CREATIVES",
      payload: { product_id: id, auto: true },
      idempotencyKey: `creatives:${id}`,
      entidade: { tipo: "product", id },
    });
    if (criado) n++;
  }
  return { produtos: n };
}

/** REFRESH_TOKENS: renova antes de expirar e marca "expirando" com antecedência. */
export async function renovarTokens(): Promise<Record<string, unknown>> {
  const out: Record<string, string> = {};
  for (const prov of ["mercadolivre", "pinterest"] as const) {
    const integ = await lerIntegracao(prov);
    if (integ.status === "disconnected") {
      out[prov] = "desconectado";
      continue;
    }
    try {
      // margem larga: ML (6 h de vida) renova com 2 h; Pinterest (30 dias) com 3 dias
      const margem = prov === "mercadolivre" ? 2 * 3_600_000 : 3 * 86_400_000;
      await obterTokenValido(prov, prov === "mercadolivre" ? ml.renovarToken : pinterest.renovarToken, margem);
      const atual = await lerIntegracao(prov);
      const refreshVence = atual.refresh_expires_at ? new Date(atual.refresh_expires_at).getTime() - Date.now() : null;
      if (refreshVence != null && refreshVence < 7 * 86_400_000) {
        await atualizarIntegracao(prov, { status: "expiring" });
        await abrirPendencia({
          tipo: "integration_auth",
          titulo: `Autorização do ${prov === "mercadolivre" ? "Mercado Livre" : "Pinterest"} expira em breve`,
          detalhe: "Reconecte para renovar a autorização antes que expire.",
          dedupeKey: `integration_auth:${prov}`,
          prioridade: 10,
        });
        out[prov] = "expirando";
      } else {
        if (atual.status === "expiring") await atualizarIntegracao(prov, { status: "connected" });
        await resolverPendenciasPorChave(`integration_auth:${prov}`);
        out[prov] = "ok";
      }
    } catch (e) {
      out[prov] = `erro: ${e instanceof Error ? e.message : e}`;
    }
  }
  return out;
}

/** SYNC_BOARDS: espelha os boards do Pinterest (marca removidos; mantém mapeamentos). */
export async function sincronizarBoards(): Promise<Record<string, unknown>> {
  const boards = await pinterest.listarBoards();
  const db = mlDb();
  const agora = new Date().toISOString();
  const { data: atuais } = await db.from("ml_pinterest_boards").select("id, external_id");
  const existentes = new Map(((atuais ?? []) as { id: string; external_id: string }[]).map((b) => [b.external_id, b.id]));
  let novos = 0;
  for (const b of boards) {
    const campos = {
      name: b.name,
      description: b.description ?? null,
      privacy: b.privacy ?? null,
      pin_count: b.pin_count ?? null,
      follower_count: b.follower_count ?? null,
      image_url: b.media?.image_cover_url ?? null,
      synced_at: agora,
      removed_at: null,
    };
    if (existentes.has(b.id)) {
      await db.from("ml_pinterest_boards").update(campos).eq("external_id", b.id);
    } else {
      await db.from("ml_pinterest_boards").insert({ external_id: b.id, ...campos });
      novos++;
    }
  }
  const vistos = new Set(boards.map((b) => b.id));
  const removidos = [...existentes.keys()].filter((e) => !vistos.has(e));
  if (removidos.length) await db.from("ml_pinterest_boards").update({ removed_at: agora }).in("external_id", removidos);
  // Garante um board padrão quando há boards e nenhum marcado.
  const { count } = await db.from("ml_pinterest_boards").select("id", { count: "exact", head: true }).eq("is_default", true).is("removed_at", null);
  if (!count && boards[0]) await db.from("ml_pinterest_boards").update({ is_default: true }).eq("external_id", boards[0].id);
  return { total: boards.length, novos, removidos: removidos.length };
}

/** CLEANUP: logs, chamadas, jobs concluídos e referências temporárias além da retenção. */
export async function limpar(retencaoDias: number): Promise<Record<string, unknown>> {
  const db = mlDb();
  const limite = new Date(Date.now() - retencaoDias * 86_400_000).toISOString();
  const r1 = await db.from("ml_api_calls").delete().lt("created_at", limite).select("id");
  const r2 = await db.from("ml_jobs").delete().in("status", ["succeeded", "canceled"]).lt("finished_at", limite).select("id");
  const r3 = await db.from("ml_oauth_states").delete().lt("expires_at", new Date().toISOString()).select("state");
  const r4 = await db.from("ml_schedule_runs").delete().lt("created_at", new Date(Date.now() - 4 * retencaoDias * 86_400_000).toISOString()).select("id");
  // Referências do modo manual de criativos que já têm imagem final.
  const { data: refs } = await db.storage.from(BUCKET).list("references", { limit: 1000 });
  let midia = 0;
  if (refs?.length) {
    const ids = refs.map((f) => f.name.split(".")[0]!);
    const { data: prontos } = await db.from("ml_creatives").select("id").in("id", ids).in("status", ["approved", "published", "archived", "rejected"]).lt("updated_at", limite);
    const remover = ((prontos ?? []) as { id: string }[]).map((c) => refs.find((f) => f.name.startsWith(c.id))?.name).filter(Boolean).map((n) => `references/${n}`);
    if (remover.length) {
      await db.storage.from(BUCKET).remove(remover);
      midia = remover.length;
    }
  }
  return {
    api_calls: r1.data?.length ?? 0,
    jobs: r2.data?.length ?? 0,
    oauth_states: r3.data?.length ?? 0,
    schedule_runs: r4.data?.length ?? 0,
    midia_temporaria: midia,
  };
}

export interface ItemDiagnostico {
  chave: string;
  label: string;
  ok: boolean | null; // null = não configurado (opcional)
  detalhe: string;
}

/** DIAGNOSTICS — "Teste completo" (spec §14). */
export async function diagnosticar(ctx: CtxJob): Promise<{ itens: ItemDiagnostico[] }> {
  const itens: ItemDiagnostico[] = [];
  const add = async (chave: string, label: string, f: () => Promise<{ ok: boolean | null; detalhe: string }>) => {
    try {
      const r = await f();
      itens.push({ chave, label, ...r });
    } catch (e) {
      itens.push({ chave, label, ok: false, detalhe: e instanceof Error ? e.message : String(e) });
    }
    await ctx.progresso({ itens });
  };
  const db = mlDb();

  await add("banco", "Banco de dados", async () => {
    const { error } = await db.from("ml_settings").select("key").limit(1);
    return { ok: !error, detalhe: error ? error.message : "Leitura OK" };
  });
  await add("storage", "Storage de mídia", async () => {
    const caminho = `diagnostics/${Date.now()}.txt`;
    const up = await db.storage.from(BUCKET).upload(caminho, new Blob(["ok"], { type: "text/plain" }), { upsert: true, contentType: "text/plain" });
    if (up.error) {
      // bucket só aceita imagens: erro de mime prova que o bucket existe e valida tipo
      const { data } = await db.storage.getBucket(BUCKET);
      return { ok: Boolean(data), detalhe: data ? `Bucket "${BUCKET}" OK (público, só imagens)` : up.error.message };
    }
    await db.storage.from(BUCKET).remove([caminho]);
    return { ok: true, detalhe: "Upload e remoção OK" };
  });
  await add("worker", "Batida automática do worker", async () => {
    const rt = await lerConfig("runtime");
    return rt.app_url
      ? { ok: true, detalhe: `pg_cron chama ${rt.app_url}/api/ml/worker a cada minuto` }
      : { ok: false, detalhe: "URL do app não registrada — abra o painel no domínio publicado para ativar." };
  });

  const mlInteg = await lerIntegracao("mercadolivre");
  if (mlInteg.status === "disconnected") {
    itens.push({ chave: "ml_auth", label: "Mercado Livre — autenticação", ok: false, detalhe: "Não conectado" });
  } else {
    await add("ml_auth", "Mercado Livre — autenticação", async () => {
      const r = await ml.testarConexao();
      return r.ok ? { ok: true, detalhe: `Conta ${r.conta}` } : { ok: false, detalhe: r.erro };
    });
    const { data: cat } = await db.from("ml_categories").select("id").eq("tracked", true).limit(1).maybeSingle();
    const alvo = (cat as { id: string } | null)?.id ?? "MLB1574";
    await add("ml_highlights", "Mercado Livre — /highlights", async () => {
      const h = await ml.maisVendidos(alvo);
      return h ? { ok: true, detalhe: `${h.length} itens em ${alvo}` } : { ok: false, detalhe: `Sem ranking para ${alvo} (escolha uma subcategoria)` };
    });
    await add("ml_trends", "Mercado Livre — /trends", async () => {
      const t = await ml.tendencias(null);
      return { ok: t.length > 0, detalhe: `${t.length} tendências` };
    });
  }

  const pin = await lerIntegracao("pinterest");
  if (pin.status === "disconnected") {
    itens.push({ chave: "pin_auth", label: "Pinterest — autenticação", ok: false, detalhe: "Não conectado" });
  } else {
    await add("pin_auth", "Pinterest — autenticação", async () => {
      const r = await pinterest.testarConexao();
      return r.ok ? { ok: true, detalhe: `Conta ${r.conta} (${(await pinterest.ambiente()) === "sandbox" ? "sandbox" : "produção"})` } : { ok: false, detalhe: r.erro };
    });
    await add("pin_boards", "Pinterest — leitura de boards", async () => {
      const b = await pinterest.listarBoards();
      return { ok: true, detalhe: `${b.length} boards` };
    });
    await add("pin_escrita", "Pinterest — permissão de escrita", async () => {
      const atual = await lerIntegracao("pinterest");
      const tem = ["boards:write", "pins:write"].every((s) => atual.scopes.includes(s));
      return {
        ok: tem || atual.scopes.length === 0 ? (tem ? true : null) : false,
        detalhe: tem ? "Escopos pins:write e boards:write concedidos" : atual.scopes.length ? `Escopos: ${atual.scopes.join(", ")}` : "Token manual — escopos não informados",
      };
    });
  }

  await add("openai", "OpenAI (opcional)", async () => {
    if (!(await openai.chave())) return { ok: null, detalhe: "Não configurada — geração manual/composição disponível" };
    const r = await openai.testarConexao();
    return r.ok ? { ok: true, detalhe: r.conta } : { ok: false, detalhe: r.erro };
  });
  await add("apify", "Apify (opcional)", async () => {
    const a = await lerIntegracao("apify");
    if (a.status === "disconnected") return { ok: null, detalhe: "Não configurado — app funciona sem Apify" };
    const r = await apify.testarConexao();
    return r.ok ? { ok: true, detalhe: r.conta } : { ok: false, detalhe: r.erro };
  });
  await add("categorias", "Categorias acompanhadas", async () => {
    const { count } = await db.from("ml_categories").select("id", { count: "exact", head: true }).eq("tracked", true);
    return { ok: (count ?? 0) > 0, detalhe: count ? `${count} categoria(s)` : "Nenhuma — escolha em Configurações › Categorias" };
  });
  await add("boards", "Boards de destino", async () => {
    const { count } = await db.from("ml_pinterest_boards").select("id", { count: "exact", head: true }).eq("active", true).is("removed_at", null);
    const { count: padrao } = await db.from("ml_pinterest_boards").select("id", { count: "exact", head: true }).eq("is_default", true);
    return { ok: (count ?? 0) > 0, detalhe: count ? `${count} ativos${padrao ? ", com padrão" : ", sem padrão"}` : "Sincronize os boards" };
  });
  return { itens };
}
