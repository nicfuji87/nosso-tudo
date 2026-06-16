import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Nia proativa — disparo de alertas por WhatsApp (uazapi).
// Chamada de hora em hora pelo pg_cron (via pg_net) com header x-cron-secret.
// Avalia regras determinísticas por workspace, deduplica por bucket de tempo
// e envia via uazapi POST {url}/send/text (header `token`, body {number,text}).
//
// Modos (corpo opcional):
//   {}                                  -> ciclo normal do cron
//   { "forcar": true }                  -> ignora a janela de horário (respeita dedup)
//   { "alertaId": "<uuid>", "forcar": true } -> avalia só esse alerta
//   { "teste": { "telefone": "...", "mensagem": "..." } } -> só testa o envio
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

const TZ = "America/Sao_Paulo";
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const primeiroNome = (nome: string | null) => (nome ?? "").trim().split(/\s+/)[0] || "Olá";

// ---- Tempo (America/Sao_Paulo) --------------------------------------------
interface AgoraLocal {
  hoje: string; // YYYY-MM-DD
  hora: number; // 0..23
  dow: number; // 0=domingo
  domMes: number; // 1..31
  isoWeek: string; // YYYY-Www
  mesStr: string; // YYYY-MM
  primeiroDiaMes: string; // YYYY-MM-01
  inicioSemana: string; // YYYY-MM-DD (hoje - 7d)
}
function agoraLocal(): AgoraLocal {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const mo = get("month");
  const da = get("day");
  const hoje = `${y}-${mo}-${da}`;
  const hora = Number(get("hour")) % 24;
  const domMes = Number(da);
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();

  // ISO week
  const base = new Date(`${hoje}T00:00:00Z`);
  const dayNr = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(base.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((base.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  const isoWeek = `${base.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;

  const inicio = new Date(`${hoje}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 7);
  const inicioSemana = inicio.toISOString().slice(0, 10);

  return {
    hoje,
    hora,
    dow,
    domMes,
    isoWeek,
    mesStr: `${y}-${mo}`,
    primeiroDiaMes: `${y}-${mo}-01`,
    inicioSemana,
  };
}

// ---- Tipos -----------------------------------------------------------------
interface Alerta {
  id: string;
  nome: string;
  tipo: string;
  parametros: Record<string, unknown>;
  template: string | null;
  frequencia: string;
  dia_semana: number | null;
  dia_mes: number | null;
  hora: number;
  publico_alvo: string;
}
interface Alvo {
  workspaceId: string;
  workspaceNome: string;
  profileId: string | null; // null = todos do workspace
}
interface Destinatario {
  profileId: string;
  nome: string | null;
  telefone: string;
}
interface MensagemRegra {
  disc: string; // discriminador p/ dedup (ex.: orc:<categoriaId>)
  vars: Record<string, string>;
}

// ---- Templates padrão ------------------------------------------------------
const TEMPLATES: Record<string, string> = {
  saldo_negativo:
    "⚠️ {nome}, o saldo do mês em *{espaco}* está negativo: {saldo}. Bora ajustar? 💪",
  orcamento_estourado:
    "🚨 {nome}, o orçamento de *{categoria}* estourou: {gasto} de {planejado} ({pct}%).",
  orcamento_perto:
    "🔔 {nome}, atenção: o orçamento de *{categoria}* já está em {pct}% ({gasto} de {planejado}).",
  cartao_limite:
    "💳 {nome}, o cartão *{cartao}* está em {pct}% do limite ({gasto} de {limite}).",
  resumo_semanal:
    "📊 {nome}, resumo da semana em *{espaco}*: {despesas} em despesas e {receitas} em receitas. Saldo: {saldo}.",
  resumo_mensal:
    "📅 {nome}, resumo do mês em *{espaco}*: {despesas} em despesas e {receitas} em receitas. Saldo: {saldo}.",
  personalizado: "{mensagem}",
};

function render(alerta: Alerta, dest: Destinatario, alvo: Alvo, vars: Record<string, string>): string {
  const base = (alerta.template && alerta.template.trim().length > 0
    ? alerta.template
    : TEMPLATES[alerta.tipo]) ?? "";
  const ctx: Record<string, string> = {
    nome: primeiroNome(dest.nome),
    espaco: alvo.workspaceNome,
    ...vars,
  };
  return base.replace(/\{(\w+)\}/g, (_m, k) => ctx[k] ?? "");
}

// ---- Janela de horário -----------------------------------------------------
function naJanela(a: Alerta, t: AgoraLocal): boolean {
  switch (a.frequencia) {
    case "imediato":
      return true;
    case "diario":
      return t.hora === a.hora;
    case "semanal":
      return t.hora === a.hora && t.dow === (a.dia_semana ?? 1);
    case "mensal":
      return t.hora === a.hora && t.domMes === (a.dia_mes ?? 1);
    default:
      return false;
  }
}
function bucket(a: Alerta, t: AgoraLocal): string {
  if (a.frequencia === "semanal") return t.isoWeek;
  if (a.frequencia === "mensal") return t.mesStr;
  return t.hoje; // imediato/diario -> 1x/dia
}

// ---- Público alvo ----------------------------------------------------------
async function resolverAlvos(admin: SupabaseClient, a: Alerta): Promise<Alvo[]> {
  if (a.publico_alvo === "todos_pro") {
    const { data } = await admin
      .from("workspaces")
      .select("id, nome, subscription_status, plans!inner(features)")
      .in("subscription_status", ["active", "trial"]);
    const rows =
      (data as
        | { id: string; nome: string; plans: { features: Record<string, unknown> } | null }[]
        | null) ?? [];
    return rows
      .filter((w) => w.plans?.features?.["whatsapp"] === true)
      .map((w) => ({ workspaceId: w.id, workspaceNome: w.nome, profileId: null }));
  }
  // especificos
  const { data } = await admin
    .from("nia_alertas_alvos")
    .select("workspace_id, profile_id, workspaces(nome)")
    .eq("alerta_id", a.id);
  const rows =
    (data as
      | { workspace_id: string; profile_id: string | null; workspaces: { nome: string } | null }[]
      | null) ?? [];
  return rows.map((r) => ({
    workspaceId: r.workspace_id,
    workspaceNome: r.workspaces?.nome ?? "seu espaço",
    profileId: r.profile_id,
  }));
}

async function destinatarios(admin: SupabaseClient, alvo: Alvo): Promise<Destinatario[]> {
  let q = admin
    .from("whatsapp_routing")
    .select("telefone, profile_id, profiles(nome)")
    .eq("workspace_id", alvo.workspaceId)
    .eq("verificado", true);
  if (alvo.profileId) q = q.eq("profile_id", alvo.profileId);
  const { data } = await q;
  const rows =
    (data as
      | { telefone: string; profile_id: string; profiles: { nome: string } | null }[]
      | null) ?? [];
  // dedup por telefone
  const vistos = new Set<string>();
  const out: Destinatario[] = [];
  for (const r of rows) {
    if (!r.telefone || vistos.has(r.telefone)) continue;
    vistos.add(r.telefone);
    out.push({ profileId: r.profile_id, nome: r.profiles?.nome ?? null, telefone: r.telefone });
  }
  return out;
}

// ---- Avaliação das regras (determinística) ---------------------------------
async function avaliarRegra(
  admin: SupabaseClient,
  a: Alerta,
  t: AgoraLocal,
  workspaceId: string,
): Promise<MensagemRegra[]> {
  switch (a.tipo) {
    case "saldo_negativo": {
      const { data } = await admin.rpc("resumo_mes", { p_workspace_id: workspaceId });
      const row = (data as { saldo: number }[] | null)?.[0];
      const saldo = Number(row?.saldo ?? 0);
      if (saldo < 0) return [{ disc: "saldo", vars: { saldo: moeda(saldo) } }];
      return [];
    }
    case "orcamento_estourado":
    case "orcamento_perto": {
      const limiar = Number((a.parametros?.["limiar_pct"] as number) ?? 80);
      const { data: orcs } = await admin
        .from("orcamentos")
        .select("valor_planejado, categoria_id, categorias(nome)")
        .eq("workspace_id", workspaceId)
        .eq("mes_referencia", t.primeiroDiaMes);
      const lista =
        (orcs as
          | { valor_planejado: number; categoria_id: string; categorias: { nome: string } | null }[]
          | null) ?? [];
      if (lista.length === 0) return [];
      const { data: gastos } = await admin.rpc("gastos_por_categoria", {
        p_workspace_id: workspaceId,
      });
      const porCat = new Map<string, number>();
      for (const g of (gastos as { categoria_id: string; total: number }[] | null) ?? []) {
        porCat.set(g.categoria_id, Number(g.total));
      }
      const out: MensagemRegra[] = [];
      for (const o of lista) {
        const planejado = Number(o.valor_planejado);
        if (planejado <= 0) continue;
        const gasto = porCat.get(o.categoria_id) ?? 0;
        const pct = Math.round((gasto / planejado) * 100);
        const vars = {
          categoria: o.categorias?.nome ?? "categoria",
          gasto: moeda(gasto),
          planejado: moeda(planejado),
          pct: String(pct),
        };
        if (a.tipo === "orcamento_estourado" && gasto > planejado) {
          out.push({ disc: `orc:${o.categoria_id}`, vars });
        } else if (a.tipo === "orcamento_perto" && pct >= limiar && gasto <= planejado) {
          out.push({ disc: `orc:${o.categoria_id}`, vars });
        }
      }
      return out;
    }
    case "cartao_limite": {
      const limiar = Number((a.parametros?.["limiar_pct"] as number) ?? 80);
      const { data: cartoes } = await admin
        .from("cartoes")
        .select("id, apelido, limite")
        .eq("workspace_id", workspaceId)
        .eq("ativo", true)
        .not("limite", "is", null);
      const lista =
        (cartoes as { id: string; apelido: string; limite: number | null }[] | null)?.filter(
          (c) => c.limite && c.limite > 0,
        ) ?? [];
      if (lista.length === 0) return [];
      const { data: tx } = await admin
        .from("transacoes")
        .select("cartao_id, valor")
        .eq("workspace_id", workspaceId)
        .eq("tipo", "despesa")
        .gte("data_transacao", t.primeiroDiaMes)
        .not("cartao_id", "is", null);
      const uso = new Map<string, number>();
      for (const r of (tx as { cartao_id: string; valor: number }[] | null) ?? []) {
        uso.set(r.cartao_id, (uso.get(r.cartao_id) ?? 0) + Number(r.valor));
      }
      const out: MensagemRegra[] = [];
      for (const c of lista) {
        const limite = c.limite as number;
        const usado = uso.get(c.id) ?? 0;
        const pct = Math.round((usado / limite) * 100);
        if (pct >= limiar) {
          out.push({
            disc: `card:${c.id}`,
            vars: { cartao: c.apelido, gasto: moeda(usado), limite: moeda(limite), pct: String(pct) },
          });
        }
      }
      return out;
    }
    case "resumo_semanal":
    case "resumo_mensal": {
      const inicio = a.tipo === "resumo_semanal" ? t.inicioSemana : t.primeiroDiaMes;
      const { data: tx } = await admin
        .from("transacoes")
        .select("tipo, valor")
        .eq("workspace_id", workspaceId)
        .gte("data_transacao", inicio)
        .lte("data_transacao", t.hoje);
      let receitas = 0;
      let despesas = 0;
      for (const r of (tx as { tipo: string; valor: number }[] | null) ?? []) {
        const v = Number(r.valor);
        if (r.tipo === "receita") receitas += v;
        else if (r.tipo === "despesa") despesas += v;
      }
      // só envia se houve movimento no período
      if (receitas === 0 && despesas === 0) return [];
      const saldo = receitas - despesas;
      return [
        {
          disc: "resumo",
          vars: {
            receitas: moeda(receitas),
            despesas: moeda(despesas),
            saldo: moeda(saldo),
            periodo: a.tipo === "resumo_semanal" ? "últimos 7 dias" : "mês",
          },
        },
      ];
    }
    case "personalizado": {
      const mensagem = (a.parametros?.["mensagem"] as string) ?? a.template ?? "";
      if (!mensagem.trim()) return [];
      return [{ disc: "msg", vars: { mensagem } }];
    }
    default:
      return [];
  }
}

// ---- Envio uazapi ----------------------------------------------------------
async function enviarWhatsapp(
  url: string,
  token: string,
  telefone: string,
  texto: string,
): Promise<{ ok: boolean; status: number; detalhe: string | null }> {
  const base = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: telefone, text: texto }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, detalhe: body.slice(0, 300) };
    }
    return { ok: true, status: res.status, detalhe: null };
  } catch (e) {
    return { ok: false, status: 0, detalhe: String(e).slice(0, 300) };
  }
}

// ---- Handler ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = serviceClient();

  const { data: cfgRow } = await admin
    .from("integration_settings")
    .select("valor, secrets")
    .eq("key", "whatsapp")
    .maybeSingle();
  const cfg = (cfgRow as { valor: Record<string, any>; secrets: Record<string, any> } | null) ?? null;
  const cronSecret = cfg?.secrets?.cron_secret as string | undefined;
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return json({ ok: false, error: "secret_invalido" }, 401);
  }

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const uazUrl = cfg?.valor?.uazapi_url as string | undefined;
  const uazToken = cfg?.secrets?.uazapi_token as string | undefined;

  // Modo teste: envia uma mensagem avulsa e retorna o resultado bruto.
  if (body.teste?.telefone) {
    if (!uazUrl || !uazToken) return json({ ok: false, error: "whatsapp_nao_configurado" }, 400);
    const r = await enviarWhatsapp(
      uazUrl,
      uazToken,
      String(body.teste.telefone).replace(/\D/g, ""),
      String(body.teste.mensagem ?? "🔔 Teste de alerta do Nosso Tudo. Está funcionando!"),
    );
    return json({ ok: r.ok, status: r.status, detalhe: r.detalhe });
  }

  if (!uazUrl || !uazToken) return json({ ok: false, error: "whatsapp_nao_configurado" }, 400);

  const forcar = body.forcar === true;
  const soAlerta = typeof body.alertaId === "string" ? body.alertaId : null;
  const t = agoraLocal();

  let q = admin.from("nia_alertas").select("*").eq("ativo", true).eq("canal", "whatsapp");
  if (soAlerta) q = q.eq("id", soAlerta);
  const { data: alertasData } = await q;
  const alertas = (alertasData as Alerta[] | null) ?? [];

  let avaliados = 0;
  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  for (const a of alertas) {
    if (!forcar && !naJanela(a, t)) continue;
    avaliados++;
    const bk = bucket(a, t);
    const alvos = await resolverAlvos(admin, a);

    for (const alvo of alvos) {
      const dests = await destinatarios(admin, alvo);
      if (dests.length === 0) continue;
      const msgs = await avaliarRegra(admin, a, t, alvo.workspaceId);
      if (msgs.length === 0) continue;

      for (const m of msgs) {
        for (const d of dests) {
          const chave = `${a.id}:${alvo.workspaceId}:${d.telefone}:${m.disc}:${bk}`;
          const { data: prev } = await admin
            .from("nia_alertas_envios")
            .select("status")
            .eq("chave_dedup", chave)
            .maybeSingle();
          if ((prev as { status: string } | null)?.status === "enviado") {
            pulados++;
            continue;
          }
          const texto = render(a, d, alvo, m.vars);
          const r = await enviarWhatsapp(uazUrl, uazToken, d.telefone, texto);
          await admin.from("nia_alertas_envios").upsert(
            {
              chave_dedup: chave,
              alerta_id: a.id,
              workspace_id: alvo.workspaceId,
              profile_id: d.profileId,
              telefone: d.telefone,
              mensagem: texto,
              status: r.ok ? "enviado" : "falhou",
              erro: r.ok ? null : r.detalhe,
              enviado_em: new Date().toISOString(),
            },
            { onConflict: "chave_dedup" },
          );
          if (r.ok) enviados++;
          else falhas++;
        }
      }
    }
  }

  return json({ ok: true, avaliados, enviados, falhas, pulados, em: t.hoje });
});
