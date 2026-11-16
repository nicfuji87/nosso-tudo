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
 *   enviar   { segredo, bpm[], vfc[], registros[], ecgs[] } → grava (idempotente)
 *
 * Escrita com service_role; isolamento por workspace vem do dispositivo.
 *
 * >>> VERSÃO DE DESENVOLVIMENTO (saude-relogio-dev) <<<
 * Roda no mesmo projeto da produção, mas SÓ aceita relógios vinculados a um workspace
 * marcado como de teste (workspaces.settings.saude_ambiente = "development").
 * Relógio vinculado a um workspace real recebe 403 e volta a pedir pareamento.
 * A função de produção (saude-relogio) não é tocada; mudanças da v0.4 nascem aqui.
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

async function workspaceDeTeste(admin: SupabaseClient, workspaceId: string): Promise<boolean> {
  const { data } = await admin.from("workspaces").select("settings").eq("id", workspaceId).maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return settings.saude_ambiente === "development";
}

const LIMITES = { bpm: 3000, vfc: 600, registros: 500, ecgs: 3 };
const TIPOS = new Set(["checkin", "habito", "respiracao", "ecg"]);

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
    .select("id, workspace_id, nome")
    .eq("segredo_hash", hash)
    .is("revogado_em", null)
    .maybeSingle();

  // Trava de ambiente: dispositivo só vale aqui se o workspace for de teste.
  const deTeste = disp ? await workspaceDeTeste(admin, disp.workspace_id) : false;

  // ------------------------------------------------------------ status
  if (acao === "status") {
    if (disp && !deTeste) return json({ vinculado: false, erro: "workspace_nao_e_de_teste" });
    return json(disp ? { vinculado: true, nome: disp.nome } : { vinculado: false });
  }

  // ------------------------------------------------------------ enviar
  if (acao === "enviar") {
    if (!disp) return json({ erro: "nao_vinculado" }, 403);
    if (!deTeste) return json({ erro: "workspace_nao_e_de_teste" }, 403);
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
        registros: await gravar("saude_registros", registros, "dispositivo_id,id_local"),
        ecgs: await gravar("saude_ecgs", ecgs, "dispositivo_id,id_local"),
      };
      await admin.from("saude_dispositivos").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", disp.id);
      return json({ ok: true, ...resultado });
    } catch (e) {
      console.error("saude-relogio-dev enviar", e);
      return json({ erro: "falha_gravar" }, 500);
    }
  }

  return json({ erro: "acao_desconhecida" }, 400);
});
