import "server-only";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { hostPermitido } from "../http";
import { HOSTS_AFILIADO, validarLinkAfiliado, type ResultadoValidacao } from "../afiliados/validacao";
import { lerProduto, recalcularStatus } from "./produtos";

/**
 * Validação server-side (HEAD com redirects manuais, só em hosts do ML —
 * proteção SSRF). Confirma que o link curto resolve para o Mercado Livre.
 */
export async function verificarRedirecionamento(url: string): Promise<{ ok: boolean; destino: string | null; detalhe: string }> {
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
      return { ok: true, destino: atual, detalhe: `Não foi possível conferir agora (${msg.slice(0, 80)}); formato válido.` };
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
