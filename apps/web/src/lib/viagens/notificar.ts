import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsappConfig } from "@/lib/admin/settings";
import { nomeAeroporto } from "@/lib/viagens/aeroportos";
import { nomeFonte } from "@/lib/viagens/milheiro";
import { formatBRL, formatNumber } from "@/lib/format";

/**
 * Resumo diário no WhatsApp, pelo mesmo canal da Nia (uazapi) e para os
 * números verificados do workspace (`whatsapp_routing`). No máximo 1 por dia,
 * e só quando há algo novo que vale a pena — sem "nada hoje".
 */

export interface ItemAvisoPromo {
  id: string;
  tipo: "milhas" | "dinheiro";
  origem: string;
  destino: string;
  destinoNome: string | null;
  programa: string;
  dataVoo: string | null;
  milhas: number | null;
  custoCents: number | null;
  precoCents: number | null;
  descontoPct: number | null;
}

export interface ItemAvisoRota {
  nome: string;
  texto: string;
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesAno(iso: string | null): string {
  if (!iso) return "";
  return `${MES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

function milhasCurto(m: number): string {
  return m >= 1000 ? `${formatNumber(Math.round(m / 100) / 10, m % 1000 === 0 ? 0 : 1)} mil` : String(m);
}

export function montarMensagem(p: {
  hoje: string;
  promos: ItemAvisoPromo[];
  rotas: ItemAvisoRota[];
  appUrl: string | null;
}): string {
  const linhas: string[] = [`✈️ *Radar de viagens* — ${p.hoje.slice(8, 10)}/${p.hoje.slice(5, 7)}`];

  const milhas = p.promos.filter((x) => x.tipo === "milhas");
  if (milhas.length) {
    linhas.push("", "*Promoções em milhas* (vs. preço normal da rota):");
    for (const x of milhas) {
      const custo = x.custoCents ? ` · ≈ ${formatBRL(x.custoCents / 100)}/pessoa` : "";
      const desc = x.descontoPct != null ? ` (−${Math.round(x.descontoPct)}%)` : "";
      linhas.push(
        `• ${x.origem} → ${x.destinoNome ?? nomeAeroporto(x.destino)} · ${nomeFonte(x.programa)} · ` +
          `${milhasCurto(x.milhas ?? 0)}${desc} · ${mesAno(x.dataVoo)}${custo}`,
      );
    }
  }

  const dinheiro = p.promos.filter((x) => x.tipo === "dinheiro");
  if (dinheiro.length) {
    linhas.push("", "*Promoções em dinheiro* (ida e volta, por pessoa):");
    for (const x of dinheiro) {
      const desc = x.descontoPct != null ? ` (−${Math.round(x.descontoPct)}%)` : "";
      linhas.push(
        `• ${x.origem} → ${x.destinoNome ?? nomeAeroporto(x.destino)} · ${formatBRL((x.precoCents ?? 0) / 100)}${desc} · ${mesAno(x.dataVoo)}`,
      );
    }
  }

  if (p.rotas.length) {
    linhas.push("", "*Seu radar bateu a meta:*");
    for (const r of p.rotas) linhas.push(`• ${r.nome}: ${r.texto}`);
  }

  if (p.appUrl) linhas.push("", `Ver tudo: ${p.appUrl.replace(/\/+$/, "")}/app/viagens/promocoes`);
  linhas.push("_Dado em cache do seats.aero/Google — confira no site antes de transferir pontos._");
  return linhas.join("\n");
}

async function enviar(url: string, token: string, telefone: string, texto: string): Promise<string | null> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, text: texto }),
    });
    return res.ok ? null : `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
  } catch (e) {
    return String(e).slice(0, 160);
  }
}

/** Envia para todos os números verificados do workspace. Devolve quantos receberam e os erros. */
export async function enviarResumoWhatsapp(workspaceId: string, texto: string): Promise<{ enviados: number; erros: string[] }> {
  const cfg = await getWhatsappConfig();
  if (!cfg.uazapiUrl || !cfg.uazapiToken) return { enviados: 0, erros: ["WhatsApp (uazapi) não configurado no admin."] };
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_routing")
    .select("telefone")
    .eq("workspace_id", workspaceId)
    .eq("verificado", true);
  const telefones = [...new Set(((data as { telefone: string }[] | null) ?? []).map((r) => r.telefone.replace(/\D/g, "")))].filter(
    Boolean,
  );
  if (telefones.length === 0) return { enviados: 0, erros: ["Nenhum número de WhatsApp verificado neste workspace."] };
  let enviados = 0;
  const erros: string[] = [];
  for (const t of telefones) {
    const erro = await enviar(cfg.uazapiUrl, cfg.uazapiToken, t, texto);
    if (erro) erros.push(erro);
    else enviados++;
  }
  return { enviados, erros };
}
