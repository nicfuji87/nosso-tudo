import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Ponte relógio (apps/saude-android) → Nosso Tudo.
 *
 * verify_jwt = false: o relógio não tem login. Ele se autentica com um SEGREDO
 * que nasceu nele; aqui só comparamos o sha256. Ações (POST JSON, campo `acao`):
 *
 *   anunciar { codigo, segredo, modelo }  → cria pareamento pendente (30 min)
 *   status   { segredo }                  → { vinculado, nome? }
 *   enviar   { segredo, bpm[], vfc[], temp[], registros[], ecgs[], estado? } → grava (idempotente)
 *            e devolve `radar` da noite de hoje (nível + sinais), para o relógio avisar de manhã.
 *            estado = { versao, bateria, carregando, no_pulso, ultima_leitura, ts? } — opcional (v0.4+);
 *            transicoes = [{ ts, tipo: carregando|desconectado|no_pulso|fora_do_pulso, bateria }] (v0.6+)
 *            samsung = [{ uid, tipo: sono|spo2|temp_pele|exercicio|energia|passos|corpo|ritmo_irregular|apneia, inicio, fim?, dados }]
 *            (app do celular; treinos viram treinos do diário sozinhos — saude_importar_treinos)
 *            diag = { versao, ultima_sync, erro?, tipos? } — diagnóstico do app do celular (v0.5+)
 *            resposta: radar da noite + prontidao (nota do dia) para o Tile do relógio
 *            um `enviar` só com `estado` funciona como batida de vida.
 *   hoje     { segredo } → resumo do dia para o app do celular (prontidão, radar, noite, Samsung, treinos a confirmar)
 *   evento   { segredo, tipo, inicio, nota?, detalhes? } → diário (sintoma, remédio, álcool…)
 *   treino   { segredo, inicio, fim, modalidade?, esforco?, descartar?, manual? } → confirma/descarta um treino
 *            detectado; com manual=true é um treino cronometrado no app do celular (origem "manual")
 *   treinos  { segredo } → aba Treinos do celular: treinos de 35 dias (zonas pela FC máx. pessoal, carga,
 *            recuperação cardíaca), semana × semana anterior, minutos OMS, tempo de recuperação, prontidão
 *   treino_editar { segredo, id, modalidade?, esforco?, descartar? } → troca modalidade/esforço ou exclui
 *   tendencias { segredo } → aba Saúde do celular: 30 noites, normais do radar, passos, Energy Score, corpo
 *
 * Escrita com service_role; isolamento por workspace vem do dispositivo.
 */

// ---- shared (inline para deploy self-contained) ----------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const serviceClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const segredoValido = (s: unknown): s is string => typeof s === "string" && s.length >= 32 && s.length <= 128;
const iso = (ms: unknown) => {
  const n = Number(ms);
  // aceita de 2024 até 1 dia no futuro (relógio com hora errada não polui o banco)
  if (!Number.isFinite(n) || n < 1704067200000 || n > Date.now() + 86_400_000) return null;
  return new Date(n).toISOString();
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const LIMITES = { bpm: 3000, vfc: 600, temp: 600, transicoes: 500, registros: 500, ecgs: 3, samsung: 500 };
const TIPOS_SAMSUNG = new Set(["sono", "spo2", "temp_pele", "exercicio", "energia", "passos", "corpo", "ritmo_irregular", "apneia"]);
const TIPOS_ESTADO = new Set(["carregando", "desconectado", "no_pulso", "fora_do_pulso"]);
const TZ = "America/Sao_Paulo";
const hojeLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sinal = (v: number, casas = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(casas).replace(".", ",")}`;

/** Radar da noite de hoje (função SQL saude_radar, radar-v2). Só volta se houver noite de hoje. */
async function radarDeHoje(admin: SupabaseClient, workspaceId: string) {
  const { data, error } = await admin.rpc("saude_radar", { p_workspace_id: workspaceId, p_tz: TZ });
  if (error || !Array.isArray(data) || !data.length) return null;
  const r = data[0] as Record<string, number | boolean | string | null>;
  if (r.noite !== hojeLocal()) return null;
  const partes: string[] = [];
  if (r.fc_fora && typeof r.fc === "number" && typeof r.fc_normal === "number") partes.push(`repouso ${sinal(r.fc - r.fc_normal)} bpm`);
  if (r.vfc_fora && typeof r.vfc === "number" && typeof r.vfc_normal === "number") partes.push(`VFC ${sinal((r.vfc / r.vfc_normal - 1) * 100)}%`);
  if (r.temp_fora && typeof r.temp === "number" && typeof r.temp_normal === "number") partes.push(`pele ${sinal(r.temp - r.temp_normal, 1)} °C`);
  if (r.spo2_fora && typeof r.spo2 === "number" && typeof r.spo2_normal === "number") partes.push(`SpO₂ ${sinal(r.spo2 - r.spo2_normal)} pts`);
  return { noite: r.noite, nivel: r.nivel, sinais: r.sinais, resumo: partes.join(", ") };
}
/** Nota do dia (função SQL saude_prontidao, prontidao-v1): para o Tile do relógio e a tela Hoje do celular. */
async function prontidao(admin: SupabaseClient, workspaceId: string) {
  const { data, error } = await admin.rpc("saude_prontidao", { p_workspace_id: workspaceId, p_tz: TZ });
  return error ? null : (data as Record<string, unknown> | null);
}

/** Diagnóstico do app do celular: versão, última sincronização boa, último erro. */
function lerDiag(d: unknown): Record<string, unknown> | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const tipos = o.tipos && typeof o.tipos === "object" && JSON.stringify(o.tipos).length < 500 ? o.tipos : null;
  return {
    versao: txt(o.versao, 20), erro: txt(o.erro, 300), ultima_sync: iso(o.ultima_sync), tipos,
    otimizacao_bateria: typeof o.otimizacao_bateria === "boolean" ? o.otimizacao_bateria : null,
    recebido_em: new Date().toISOString(),
  };
}
// ---- treinos (aba Treinos do celular) ---------------------------------------
type TreinoP = {
  id: string; inicio: string; fim: string; modalidade?: string; minutos: number; carga?: number; zonas?: number[];
  medidos?: number; recuperacao?: { fc_fim: number; queda1: number; queda2?: number };
};

/**
 * Resumo da aba Treinos (treinos-v2 + recuperacao-tempo-v1).
 * Tempo de recuperação: os treinos com menos de 2 h entre si formam um bloco (ex.: musculação + natação + judô);
 * o bloco pede 0,12 h por ponto de carga (máx. 72 h) — +12 h se a prontidão de hoje está baixa, +6 h se moderada.
 * É estimativa para orientar treino forte × leve, não regra.
 */
function resumoTreinos(p: { fcmax?: number; zonas_bpm?: number[]; treinos?: TreinoP[] }, pront: Record<string, unknown> | null) {
  const H = 3_600_000, D = 24 * H, agora = Date.now();
  const t = p.treinos ?? [];
  const ms = (x: string) => new Date(x).getTime();
  const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
  // semana corrente: segunda 00:00 em São Paulo (UTC−3, sem horário de verão)
  const local = new Date(agora - 3 * H);
  const dow = (local.getUTCDay() + 6) % 7;
  const segunda = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) + 3 * H;
  const resumir = (de: number, ate: number) => {
    const l = t.filter((x) => ms(x.inicio) >= de && ms(x.inicio) < ate);
    const z = [0, 0, 0, 0, 0];
    l.forEach((x) => (x.zonas ?? []).forEach((v, i) => { z[i] += v; }));
    const porMod: Record<string, number> = {};
    l.forEach((x) => { const m = x.modalidade ?? "Outro"; porMod[m] = (porMod[m] ?? 0) + x.minutos; });
    return {
      treinos: l.length, minutos: soma(l.map((x) => x.minutos)), carga: soma(l.map((x) => x.carga ?? 0)), zonas: z,
      por_modalidade: porMod,
      // OMS: 150–300 min/semana de atividade moderada (1 min vigoroso vale 2): Z2–Z3 moderado, Z4–Z5 vigoroso
      minutos_oms: z[1] + z[2] + 2 * (z[3] + z[4]),
    };
  };
  const carga28 = soma(t.filter((x) => ms(x.inicio) >= agora - 28 * D).map((x) => x.carga ?? 0));

  // tempo de recuperação a partir do último bloco de treino
  const ord = [...t].sort((a, b) => ms(a.inicio) - ms(b.inicio));
  const blocos: TreinoP[][] = [];
  for (const x of ord) {
    const ult = blocos.at(-1);
    if (ult && ms(x.inicio) - ms(ult.at(-1)!.fim) < 2 * H) ult.push(x); else blocos.push([x]);
  }
  const bloco = [...blocos].reverse().find((b) => soma(b.map((x) => x.carga ?? 0)) >= 30 && agora - ms(b.at(-1)!.fim) < 4 * D) ?? null;
  let recuperacao = null;
  if (bloco) {
    const carga = soma(bloco.map((x) => x.carga ?? 0));
    const fim = ms(bloco.at(-1)!.fim);
    let horas = Math.min(72, carga * 0.12);
    const nivel = pront && typeof pront.nivel === "string" ? pront.nivel : null;
    if (nivel === "baixo") horas += 12; else if (nivel === "moderado") horas += 6;
    const restante = fim + horas * H - agora;
    recuperacao = {
      algoritmo: "recuperacao-tempo-v1", carga_bloco: carga, fim: new Date(fim).toISOString(),
      modalidades: [...new Set(bloco.map((x) => x.modalidade ?? "Treino"))],
      horas_necessarias: Math.round(horas), horas_restantes: Math.max(0, Math.round(restante / H)),
      pronto_em: new Date(fim + horas * H).toISOString(),
    };
  }

  // recuperação cardíaca: só depois de esforço de verdade (FC no fim ≥ 120)
  const hrr = ord.filter((x) => x.recuperacao && x.recuperacao.fc_fim >= 120).slice(-12)
    .map((x) => ({ inicio: x.inicio, modalidade: x.modalidade ?? null, ...x.recuperacao }));
  const media = (v: number[]) => (v.length ? Math.round(soma(v) / v.length) : null);
  return {
    algoritmo: "treinos-v2", fcmax: p.fcmax ?? null, zonas_bpm: p.zonas_bpm ?? [],
    semana: resumir(segunda, agora + 1), semana_anterior: resumir(segunda - 7 * D, segunda), ultimos7: resumir(agora - 7 * D, agora + 1),
    carga28, carga_media_semana: Math.round(carga28 / 4),
    recuperacao, hrr, hrr_media: media(hrr.map((x) => x.queda1 ?? 0)),
    prontidao: pront, treinos: t.slice(0, 40),
  };
}

const TIPOS = new Set(["checkin", "habito", "respiracao", "ecg", "malestar", "ortostatico"]);

/** Estado do relógio (v0.4+). Campos inválidos são ignorados, nunca derrubam o envio. */
function lerEstado(e: unknown): Record<string, unknown> {
  if (!e || typeof e !== "object") return {};
  const o = e as Record<string, unknown>;
  const out: Record<string, unknown> = { estado_em: new Date().toISOString() };
  if (typeof o.versao === "string") out.versao_app = o.versao.slice(0, 20);
  const b = num(o.bateria);
  if (b !== null && b >= 0 && b <= 100) out.bateria_pct = Math.round(b);
  if (typeof o.carregando === "boolean") out.carregando = o.carregando;
  if (typeof o.no_pulso === "boolean") out.no_pulso = o.no_pulso;
  const ul = iso(o.ultima_leitura);
  if (ul) out.ultima_leitura_em = ul;
  return out;
}

// ---- handler ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "json_invalido" }, 400);
  }
  const admin = serviceClient();
  const acao = corpo.acao;

  if (!segredoValido(corpo.segredo)) return json({ erro: "segredo_invalido" }, 401);
  const hash = await sha256(corpo.segredo);

  // ------------------------------------------------------------ anunciar
  if (acao === "anunciar") {
    const codigo = String(corpo.codigo ?? "").toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(codigo)) return json({ erro: "codigo_invalido" }, 400);
    // um relógio tem no máximo um pareamento pendente
    await admin.from("saude_pareamentos").delete().eq("segredo_hash", hash).is("usado_em", null);
    const { error } = await admin.from("saude_pareamentos").insert({
      codigo,
      segredo_hash: hash,
      modelo: typeof corpo.modelo === "string" ? corpo.modelo.slice(0, 60) : null,
    });
    if (error) return json({ erro: error.code === "23505" ? "codigo_em_uso" : "falha_anunciar" }, 409);
    return json({ ok: true, expira_em_min: 30 });
  }

  // dispositivo vinculado e ativo
  const { data: disp } = await admin
    .from("saude_dispositivos")
    .select("id, workspace_id, profile_id, nome")
    .eq("segredo_hash", hash)
    .is("revogado_em", null)
    .maybeSingle();

  // ------------------------------------------------------------ status
  if (acao === "status") {
    return json(disp ? { vinculado: true, nome: disp.nome } : { vinculado: false });
  }

  // ------------------------------------------------------------ hoje (app do celular)
  if (acao === "hoje") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const ws = disp.workspace_id;
    const desde = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const [radarR, noitesR, samsungR, treinosR, eventosR, prontR, extrasR] = await Promise.all([
      admin.rpc("saude_radar", { p_workspace_id: ws, p_tz: TZ }),
      admin.rpc("saude_noites", { p_workspace_id: ws, p_dias: 3, p_tz: TZ }),
      admin.from("saude_samsung").select("tipo, inicio, fim, dados").eq("workspace_id", ws).gte("inicio", desde(3))
        .order("inicio", { ascending: false }).limit(200),
      admin.rpc("saude_treinos_detectados", { p_workspace_id: ws, p_dias: 3, p_limiar: 100 }),
      admin.from("saude_eventos").select("inicio, fim").eq("workspace_id", ws).eq("tipo", "treino").gte("inicio", desde(4)),
      prontidao(admin, ws),
      admin.from("saude_samsung").select("tipo, inicio, dados").eq("workspace_id", ws).in("tipo", ["corpo", "passos"])
        .gte("inicio", desde(120)).order("inicio", { ascending: false }).limit(60),
    ]);
    type Linha = Record<string, unknown>;
    const radar = ((radarR.data ?? []) as Linha[])[0] ?? null;
    const noites = ((noitesR.data ?? []) as Linha[]).filter((n) => n.fc_repouso != null || n.sono_inicio != null);
    const sam = (samsungR.data ?? []) as { tipo: string; inicio: string; fim: string | null; dados: Linha }[];
    const sono = sam.find((r) => r.tipo === "sono" && r.fim && (Number(r.dados.duracao_min) || 0) >= 180) ?? null;
    const spo = sono ? sam.filter((r) => r.tipo === "spo2" && r.inicio >= sono.inicio && r.inicio <= (sono.fim ?? sono.inicio)) : [];
    const energia = sam.find((r) => r.tipo === "energia") ?? null;
    const ms = (x: unknown) => new Date(String(x)).getTime();
    const sobrepoe = (a1: unknown, a2: unknown, b1: unknown, b2: unknown) => ms(a1) < ms(b2) && ms(b1) < ms(a2);
    const eventos = (eventosR.data ?? []) as { inicio: string; fim: string | null }[];
    const modalidade = (t: string) =>
      /SWIMMING/.test(t) ? "Natação"
        : /WEIGHT|BENCH|SQUAT|DEADLIFT|LUNGE|LEG_|LAT_|SHOULDER|ARM_|RAISES|CIRCUIT|PULL_UPS|PUSH_UPS|CRUNCH|PLANK/.test(t) ? "Musculação" : null;
    const sugeridos = ((treinosR.data ?? []) as Linha[])
      .filter((t) => !eventos.some((e) => sobrepoe(e.inicio, e.fim ?? e.inicio, t.inicio, t.fim)))
      .map((t) => {
        // atividades que o Samsung Health registrou dentro do bloco (ex.: musculação + natação)
        const partes = sam.filter((r) => r.tipo === "exercicio" && r.fim && sobrepoe(r.inicio, r.fim, t.inicio, t.fim))
          .sort((x, y) => ms(x.inicio) - ms(y.inicio))
          .map((r) => ({ inicio: r.inicio, fim: r.fim, tipo_samsung: r.dados.tipo_samsung ?? null, modalidade: modalidade(String(r.dados.tipo_samsung ?? "")) }));
        return {
          inicio: t.inicio, fim: t.fim, minutos: t.minutos, fc_media: Math.round(Number(t.fc_media)), fc_max: t.fc_max,
          palpite: partes.find((x) => x.modalidade)?.modalidade ?? null,
          partes,
        };
      });
    const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    return json({
      ok: true,
      radar,
      noite: noites.at(-1) ?? null,
      sono: sono ? { inicio: sono.inicio, fim: sono.fim, ...sono.dados, estagios: undefined } : null,
      spo2: spo.length ? { media: media(spo.map((r) => Number(r.dados.media)).filter(Number.isFinite)), min: Math.min(...spo.map((r) => Number(r.dados.min) || 100)) } : null,
      energia: energia ? { dia: String(energia.inicio).slice(0, 10), score: energia.dados.score } : null,
      prontidao: prontR,
      passos: (() => {
        const p = ((extrasR.data ?? []) as { tipo: string; inicio: string; dados: Linha }[]).filter((r) => r.tipo === "passos");
        const hojeP = p.find((r) => String(r.inicio).slice(0, 10) === hojeLocal());
        return p.length ? { hoje: hojeP ? Number(hojeP.dados.total) : null, media7: Math.round(media(p.slice(0, 7).map((r) => Number(r.dados.total) || 0)) ?? 0) } : null;
      })(),
      corpo: (((extrasR.data ?? []) as { tipo: string; inicio: string; dados: Linha }[]).find((r) => r.tipo === "corpo") ?? null),
      treinos: sugeridos,
      agora: new Date().toISOString(),
    });
  }

  // ------------------------------------------------------------ treinos (aba Treinos do celular)
  if (acao === "treinos") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const [painelR, prontR] = await Promise.all([
      admin.rpc("saude_treinos_painel", { p_workspace_id: disp.workspace_id, p_dias: 35, p_tz: TZ }),
      prontidao(admin, disp.workspace_id),
    ]);
    if (painelR.error || !painelR.data) return json({ erro: "falha_painel" }, 500);
    return json({ ok: true, ...resumoTreinos(painelR.data as Parameters<typeof resumoTreinos>[0], prontR), agora: new Date().toISOString() });
  }

  // ------------------------------------------------------------ treino_editar (modalidade, esforço, excluir)
  if (acao === "treino_editar") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const id = String(corpo.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ erro: "id_invalido" }, 400);
    const { data: ev } = await admin.from("saude_eventos").select("id, origem, detalhes")
      .eq("id", id).eq("workspace_id", disp.workspace_id).eq("tipo", "treino").maybeSingle();
    if (!ev) return json({ erro: "nao_encontrado" }, 404);
    if (corpo.descartar === true) {
      // do Samsung Health: marca descartado (apagar faria voltar na próxima sincronização)
      const { error } = ev.origem === "samsung"
        ? await admin.from("saude_eventos").update({ descartado: true }).eq("id", id)
        : await admin.from("saude_eventos").delete().eq("id", id);
      return error ? json({ erro: "falha_gravar" }, 500) : json({ ok: true });
    }
    const detalhes = { ...((ev.detalhes as Record<string, unknown>) ?? {}) };
    if (typeof corpo.modalidade === "string" && corpo.modalidade.trim()) detalhes.modalidade = corpo.modalidade.trim().slice(0, 40);
    const esf = num(corpo.esforco);
    if (esf !== null && esf >= 0 && esf <= 10) detalhes.esforco = Math.round(esf);
    const { error } = await admin.from("saude_eventos").update({ detalhes }).eq("id", id);
    return error ? json({ erro: "falha_gravar" }, 500) : json({ ok: true });
  }

  // ------------------------------------------------------------ tendencias (aba Saúde do celular)
  if (acao === "tendencias") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const ws = disp.workspace_id;
    const [noitesR, radarR, samR, prontR] = await Promise.all([
      admin.rpc("saude_noites", { p_workspace_id: ws, p_dias: 30, p_tz: TZ }),
      admin.rpc("saude_radar", { p_workspace_id: ws, p_tz: TZ }),
      admin.from("saude_samsung").select("tipo, inicio, dados").eq("workspace_id", ws)
        .in("tipo", ["passos", "energia", "corpo", "apneia", "ritmo_irregular"])
        .gte("inicio", new Date(Date.now() - 400 * 86_400_000).toISOString()).order("inicio", { ascending: true }).limit(1000),
      prontidao(admin, ws),
    ]);
    type L = Record<string, unknown>;
    const r = ((radarR.data ?? []) as L[])[0] ?? null;
    const sam = (samR.data ?? []) as { tipo: string; inicio: string; dados: L }[];
    const de = (tipo: string) => sam.filter((x) => x.tipo === tipo);
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const corte30 = Date.now() - 31 * 86_400_000;
    return json({
      ok: true,
      noites: ((noitesR.data ?? []) as L[]).map((x) => ({
        noite: x.noite, fc: n(x.fc_repouso), vfc: n(x.vfc_noturna), spo2: n(x.spo2_media), spo2_min: n(x.spo2_min),
        pele: n(x.temp_pele), fonte_temp: x.fonte_temp ?? null,
        sono_h: x.sono_inicio && x.sono_fim ? Math.round(((new Date(String(x.sono_fim)).getTime() - new Date(String(x.sono_inicio)).getTime()) / 3_600_000) * 10) / 10 : null,
        fonte_sono: x.fonte_sono ?? null,
      })),
      normais: r ? { fc: n(r.fc_normal), vfc: n(r.vfc_normal), pele: n(r.temp_normal), spo2: n(r.spo2_normal), base: n(r.base), nivel: r.nivel } : null,
      passos: de("passos").filter((x) => new Date(x.inicio).getTime() >= corte30).map((x) => ({ dia: x.dados.dia ?? String(x.inicio).slice(0, 10), total: n(x.dados.total) })),
      energia: de("energia").filter((x) => new Date(x.inicio).getTime() >= corte30).map((x) => ({ dia: String(x.inicio).slice(0, 10), score: n(x.dados.score) })),
      corpo: de("corpo").map((x) => ({ ts: x.inicio, peso: n(x.dados.peso), gordura_pct: n(x.dados.gordura_pct), musculo_kg: n(x.dados.musculo_esq_kg) })),
      apneia: de("apneia").at(-1) ? { ts: de("apneia").at(-1)!.inicio, sinal: de("apneia").at(-1)!.dados.sinal ?? null } : null,
      ritmo_irregular: de("ritmo_irregular").filter((x) => x.dados.status === "DETECTED").length,
      prontidao: prontR,
      agora: new Date().toISOString(),
    });
  }

  // ------------------------------------------------------------ evento (diário pelo celular)
  if (acao === "evento") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const tipos = new Set(["sintoma", "malestar", "medicamento", "alcool", "cafeina", "doenca", "estresse", "sono", "nota"]);
    const inicio = iso(corpo.inicio) ?? new Date().toISOString();
    if (!tipos.has(String(corpo.tipo))) return json({ erro: "tipo_invalido" }, 400);
    const detalhes = corpo.detalhes && typeof corpo.detalhes === "object" && JSON.stringify(corpo.detalhes).length < 2000 ? corpo.detalhes : {};
    const { error } = await admin.from("saude_eventos").insert({
      workspace_id: disp.workspace_id, profile_id: disp.profile_id, tipo: String(corpo.tipo), inicio,
      nota: typeof corpo.nota === "string" && corpo.nota.trim() ? corpo.nota.trim().slice(0, 500) : null,
      detalhes, origem: "manual",
    });
    return error ? json({ erro: "falha_gravar" }, 500) : json({ ok: true });
  }

  // ------------------------------------------------------------ treino (confirmar / descartar pelo celular)
  if (acao === "treino") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const inicio = iso(corpo.inicio), fim = iso(corpo.fim);
    if (!inicio || !fim || fim <= inicio) return json({ erro: "intervalo_invalido" }, 400);
    const descartar = corpo.descartar === true;
    const mod = typeof corpo.modalidade === "string" ? corpo.modalidade.trim().slice(0, 40) : "";
    if (!descartar && !mod) return json({ erro: "modalidade_obrigatoria" }, 400);
    const esf = num(corpo.esforco);
    const manual = corpo.manual === true; // cronometrado no app do celular
    const { error } = await admin.from("saude_eventos").insert({
      workspace_id: disp.workspace_id, profile_id: disp.profile_id, tipo: "treino", inicio, fim,
      origem: manual ? "manual" : "detectado", algoritmo: manual ? null : "treino-v1", descartado: descartar,
      detalhes: descartar ? {} : { modalidade: mod, ...(esf !== null && esf >= 0 && esf <= 10 ? { esforco: Math.round(esf) } : {}) },
    });
    return error ? json({ erro: "falha_gravar" }, 500) : json({ ok: true });
  }

  // ------------------------------------------------------------ enviar
  if (acao === "enviar") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    const base = { dispositivo_id: disp.id, workspace_id: disp.workspace_id };
    const lista = (k: keyof typeof LIMITES) => {
      const v = corpo[k];
      return Array.isArray(v) ? v.slice(0, LIMITES[k]) : [];
    };

    const bpm = lista("bpm").flatMap((b: Record<string, unknown>) => {
      const minuto = iso(b.minuto), medio = num(b.medio), mn = num(b.min), mx = num(b.max);
      if (!minuto || medio === null || medio < 25 || medio > 240 || mn === null || mx === null) return [];
      return [{ ...base, minuto, bpm_medio: medio, bpm_min: Math.round(mn), bpm_max: Math.round(mx), amostras: Math.max(1, Math.round(num(b.n) ?? 1)) }];
    });
    const vfc = lista("vfc").flatMap((j: Record<string, unknown>) => {
      const inicio = iso(j.inicio), r = num(j.rmssd), c = num(j.cobertura);
      if (!inicio || r === null || r <= 0 || r >= 500 || c === null || c < 0 || c > 1.5) return [];
      return [{ ...base, inicio, rmssd_ms: r, cobertura: c }];
    });
    const temp = lista("temp").flatMap((j: Record<string, unknown>) => {
      const inicio = iso(j.inicio), p = num(j.pele), a = num(j.ambiente);
      if (!inicio || p === null || p < 20 || p > 45) return [];
      return [{ ...base, inicio, pele: p, ambiente: a !== null && a >= -20 && a <= 60 ? a : null, amostras: Math.max(1, Math.round(num(j.n) ?? 1)) }];
    });
    const transicoes = lista("transicoes").flatMap((t: Record<string, unknown>) => {
      const ts = iso(t.ts), b = num(t.bateria);
      if (!ts || !TIPOS_ESTADO.has(String(t.tipo))) return [];
      return [{ ...base, ts, tipo: String(t.tipo), bateria: b !== null && b >= 0 && b <= 100 ? Math.round(b) : null }];
    });
    // amostra de bateria a cada envio (curva de bateria e gasto por hora)
    const est = (corpo.estado ?? {}) as Record<string, unknown>;
    const bat = num(est.bateria);
    if (bat !== null && bat >= 0 && bat <= 100) {
      transicoes.push({ ...base, ts: iso(est.ts) ?? new Date().toISOString(), tipo: "amostra", bateria: Math.round(bat) });
    }
    const samsung = lista("samsung").flatMap((x: Record<string, unknown>) => {
      const inicio = iso(x.inicio);
      const dados = x.dados && typeof x.dados === "object" ? x.dados : {};
      if (!inicio || typeof x.uid !== "string" || !x.uid || !TIPOS_SAMSUNG.has(String(x.tipo)) || JSON.stringify(dados).length > 20000) return [];
      return [{ ...base, uid: x.uid.slice(0, 120), tipo: String(x.tipo), inicio, fim: iso(x.fim), dados, atualizado_em: new Date().toISOString() }];
    });
    const registros = lista("registros").flatMap((r: Record<string, unknown>) => {
      const ts = iso(r.ts);
      if (!ts || typeof r.id_local !== "string" || !TIPOS.has(String(r.tipo))) return [];
      return [{ ...base, id_local: r.id_local.slice(0, 64), ts, tipo: String(r.tipo), valor: String(r.valor ?? "").slice(0, 200) }];
    });
    const ecgs = lista("ecgs").flatMap((e: Record<string, unknown>) => {
      const ts = iso(e.ts), d = num(e.duracao_s), hz = num(e.hz);
      const amostras = Array.isArray(e.amostras) ? e.amostras.filter((x) => typeof x === "number").slice(0, 40000) : [];
      if (!ts || typeof e.id_local !== "string" || d === null || hz === null || amostras.length < 100) return [];
      return [{ ...base, id_local: e.id_local.slice(0, 64), ts, duracao_s: d, hz, amostras_mv: amostras }];
    });

    const gravar = async (tabela: string, linhas: unknown[], conflito: string) => {
      if (!linhas.length) return 0;
      const { error } = await admin.from(tabela).upsert(linhas, { onConflict: conflito, ignoreDuplicates: true });
      if (error) throw new Error(`${tabela}: ${error.message}`);
      return linhas.length;
    };

    try {
      const resultado = {
        bpm: await gravar("saude_bpm_minuto", bpm, "dispositivo_id,minuto"),
        vfc: await gravar("saude_vfc_janelas", vfc, "dispositivo_id,inicio"),
        temp: await gravar("saude_temp_janelas", temp, "dispositivo_id,inicio"),
        estado: await gravar("saude_estado_eventos", transicoes, "dispositivo_id,ts,tipo"),
        registros: await gravar("saude_registros", registros, "dispositivo_id,id_local"),
        ecgs: await gravar("saude_ecgs", ecgs, "dispositivo_id,id_local"),
        samsung: await (async () => {
          // o Samsung Health corrige registros depois: aqui o upsert ATUALIZA
          if (!samsung.length) return 0;
          const { error } = await admin.from("saude_samsung").upsert(samsung, { onConflict: "dispositivo_id,uid" });
          if (error) throw new Error(`saude_samsung: ${error.message}`);
          return samsung.length;
        })(),
      };
      const diag = lerDiag(corpo.diag);
      await admin
        .from("saude_dispositivos")
        .update({
          ultimo_envio_em: new Date().toISOString(), ...lerEstado(corpo.estado),
          ...(diag ? { diagnostico: diag, ...(diag.versao ? { versao_app: diag.versao } : {}) } : {}),
        })
        .eq("id", disp.id);
      // treinos do Samsung Health viram treinos do diário (samsung-v1)
      const importados = samsung.some((x) => x.tipo === "exercicio")
        ? await admin.rpc("saude_importar_treinos", { p_workspace_id: disp.workspace_id, p_tz: TZ }).then((r) => (r.data as number) ?? 0, () => 0)
        : 0;
      const [radar, pront] = await Promise.all([
        radarDeHoje(admin, disp.workspace_id).catch(() => null),
        prontidao(admin, disp.workspace_id).catch(() => null),
      ]);
      return json({ ok: true, ...resultado, importados, radar, prontidao: pront });
    } catch (e) {
      console.error("saude-relogio enviar", e);
      return json({ erro: "falha_gravar" }, 500);
    }
  }

  return json({ erro: "acao_desconhecida" }, 400);
});
