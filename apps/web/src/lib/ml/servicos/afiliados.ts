import "server-only";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { hostPermitido } from "../http";
import { classificarRedirect, HOSTS_AFILIADO, validarLinkAfiliado, type ResultadoValidacao } from "../afiliados/validacao";
import { lerProduto, recalcularStatus } from "./produtos";

/**
 * Validação server-side (HEAD com redirects manuais, só em hosts do ML —
 * proteção SSRF). Confirma que o link curto resolve para o Mercado Livre.
 */
export async function verificarRedirecionamento(url: string): Promise<{ ok: boolean; destino: string | null; detalhe: string; conferido?: boolean }> {
  const hosts = [...HOSTS_AFILIADO, "mercadolivre.com.br", "mercadolibre.com"];
  let atual = url;
  for (let salto = 0; salto < 6; salto++) {
    if (!hostPermitido(atual, hosts)) {
      return { ok: false, destino: atual, detalhe: `Redireciona para fora do Mercado Livre (${new URL(atual).hostname}).` };
    }
    try {
      // fetch direto (não chamarApi): precisamos do 3xx + Location sem seguir sozinho.
      const r = await fetch(atual, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; NossoTudoML/1.0)" },
        cache: "no-store",
      });
      await r.body?.cancel();
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        atual = new URL(loc, atual).toString();
        continue;
      }
      if (r.status === 404) return { ok: false, destino: atual, detalhe: "O link não existe (404)." };
      return { ok: true, destino: atual, detalhe: `Resolve para ${new URL(atual).hostname}.` };
    } catch (e) {
      // Erro de rede/timeout não invalida o link — o formato já foi validado.
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: true, destino: atual, detalhe: `Não foi possível conferir agora (${msg.slice(0, 80)}); formato válido.`, conferido: false };
    }
  }
  return { ok: true, destino: atual, detalhe: `Resolve para ${new URL(atual).hostname}.` };
}

export async function validarParaProduto(productId: string, url: string, conferirOnline = true): Promise<ResultadoValidacao & { destino?: string | null }> {
  const p = await lerProduto(productId);
  const v = validarLinkAfiliado(url, { urlOriginal: p.permalink });
  if (!v.ok || !v.url || !conferirOnline) return v;
  const r = await verificarRedirecionamento(v.url);
  if (!r.ok) return { ...v, ok: false, erros: [...v.erros, r.detalhe], destino: r.destino };
  return { ...v, avisos: [...v.avisos, r.detalhe], destino: r.destino };
}

/**
 * Salva o link (desativa o anterior, mantém histórico), atualiza Pins ainda não
 * publicados e recalcula a etapa do produto (→ pronto p/ criativo).
 */
export async function salvarLinkAfiliado(p: {
  productId: string;
  url: string;
  label?: string | null;
  userId: string | null;
  conferirOnline?: boolean;
}): Promise<{ ok: true; avisos: string[]; status: string } | { ok: false; erros: string[] }> {
  const produto = await lerProduto(p.productId);
  const v = await validarParaProduto(p.productId, p.url, p.conferirOnline ?? true);
  if (!v.ok || !v.url) return { ok: false, erros: v.erros };
  const db = mlDb();

  const { data: anterior } = await db.from("ml_affiliate_links").select("*").eq("product_id", p.productId).eq("active", true).maybeSingle();
  if ((anterior as { affiliate_url: string } | null)?.affiliate_url === v.url) {
    return { ok: true, avisos: ["Link igual ao atual — nada mudou."], status: produto.status };
  }
  if (anterior) {
    await db.from("ml_affiliate_links").update({ active: false, deactivated_at: new Date().toISOString() }).eq("id", (anterior as { id: string }).id);
  }
  const { data: novo, error } = await db
    .from("ml_affiliate_links")
    .insert({
      product_id: p.productId,
      original_url: produto.permalink,
      affiliate_url: v.url,
      label: p.label ?? null,
      source: "manual",
      active: true,
      validated_at: new Date().toISOString(),
      validation: { tipo: v.tipo, avisos: v.avisos, destino: v.destino ?? null },
      created_by: p.userId,
    })
    .select("id")
    .single();
  if (error) {
    // corrida: outro clique já ativou um link → reativa o anterior para não ficar sem nenhum
    if (anterior) await db.from("ml_affiliate_links").update({ active: true, deactivated_at: null }).eq("id", (anterior as { id: string }).id);
    return { ok: false, erros: [`Não foi possível salvar: ${error.message}`] };
  }
  const linkId = (novo as { id: string }).id;
  try {
    await validarRedirectLink(linkId);
  } catch {
    /* validação de redirect é complementar; o formato já foi validado */
  }

  // Pins ainda não publicados passam a usar o link novo.
  await db
    .from("ml_pins")
    .update({ affiliate_link_id: linkId, link_url: v.url })
    .eq("product_id", p.productId)
    .in("status", ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"]);

  await auditar({
    acao: anterior ? "afiliado.atualizar" : "afiliado.adicionar",
    entidade: "product",
    entidadeId: p.productId,
    antes: anterior ? { affiliate_url: (anterior as { affiliate_url: string }).affiliate_url } : null,
    depois: { affiliate_url: v.url, label: p.label ?? null },
    actorId: p.userId,
  });
  const status = await recalcularStatus(p.productId, { actorId: p.userId, actorType: "user" });
  return { ok: true, avisos: v.avisos, status };
}

export async function removerLinkAfiliado(productId: string, userId: string | null): Promise<void> {
  await mlDb()
    .from("ml_affiliate_links")
    .update({ active: false, deactivated_at: new Date().toISOString() })
    .eq("product_id", productId)
    .eq("active", true);
  await auditar({ acao: "afiliado.remover", entidade: "product", entidadeId: productId, actorId: userId });
  await recalcularStatus(productId, { actorId: userId, actorType: "user" });
}

export async function linkAtivo(productId: string): Promise<{ id: string; affiliate_url: string } | null> {
  const { data } = await mlDb().from("ml_affiliate_links").select("id, affiliate_url").eq("product_id", productId).eq("active", true).maybeSingle();
  return (data as { id: string; affiliate_url: string } | null) ?? null;
}


/** VALIDATE_AFFILIATE_REDIRECT para um link: grava destino final, host, status e data. */
export async function validarRedirectLink(linkId: string): Promise<{ status: string; host: string | null }> {
  const db = mlDb();
  const { data } = await db.from("ml_affiliate_links").select("id, product_id, affiliate_url").eq("id", linkId).maybeSingle();
  const l = data as { id: string; product_id: string; affiliate_url: string } | null;
  if (!l) throw new Error("Link não encontrado.");
  const p = await lerProduto(l.product_id);
  const r = await verificarRedirecionamento(l.affiliate_url);
  const status = classificarRedirect(r, [p.external_id, p.item_id ?? ""]);
  let host: string | null = null;
  try {
    host = r.destino ? new URL(r.destino).hostname : null;
  } catch {
    host = null;
  }
  await db
    .from("ml_affiliate_links")
    .update({ final_url: r.destino, final_host: host, redirect_status: status, last_checked_at: new Date().toISOString(), validated_at: status === "inconsistent" ? null : new Date().toISOString() })
    .eq("id", linkId);
  if (status === "inconsistent") {
    await auditar({ acao: "link.redirect_inconsistente", entidade: "product", entidadeId: l.product_id, actorType: "automation", metadata: { evento: "link_redirect_inconsistente", destino: r.destino, detalhe: r.detalhe } });
    const { abrirPendencia } = await import("./pendencias");
    await abrirPendencia({
      tipo: "publish_blocked",
      titulo: "Link de afiliado com destino inconsistente",
      detalhe: `${r.detalhe} Gere um novo link no painel de afiliados.`,
      entidade: { tipo: "product", id: l.product_id },
      dedupeKey: `redirect:${l.id}`,
      prioridade: 12,
    });
  }
  // pacotes das variantes dependem do link
  const { data: cr } = await db.from("ml_creatives").select("id").eq("product_id", l.product_id).not("family_id", "is", null).not("status", "in", "(archived,published)");
  if ((cr ?? []).length) {
    const { revalidarPacote } = await import("./variantes");
    for (const { id } of (cr ?? []) as { id: string }[]) await revalidarPacote(id);
  }
  return { status, host };
}

/** Lote: links de produtos com publicação próxima ou não conferidos há 7 dias. */
export async function validarRedirectsLote(lote: number): Promise<Record<string, unknown>> {
  const db = mlDb();
  const em48h = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const { data: pins } = await db.from("ml_pins").select("affiliate_link_id").eq("status", "scheduled").lte("scheduled_at", em48h).not("affiliate_link_id", "is", null).limit(lote);
  const prioritarios = new Set(((pins ?? []) as { affiliate_link_id: string }[]).map((p) => p.affiliate_link_id));
  const semana = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: velhos } = await db.from("ml_affiliate_links").select("id").eq("active", true).or(`last_checked_at.is.null,last_checked_at.lt.${semana}`).limit(lote);
  const ids = Array.from(new Set([...prioritarios, ...((velhos ?? []) as { id: string }[]).map((v) => v.id)])).slice(0, lote);
  const contagem: Record<string, number> = {};
  for (const id of ids) {
    try {
      const r = await validarRedirectLink(id);
      contagem[r.status] = (contagem[r.status] ?? 0) + 1;
    } catch {
      contagem.falha = (contagem.falha ?? 0) + 1;
    }
  }
  return { links: ids.length, ...contagem };
}
