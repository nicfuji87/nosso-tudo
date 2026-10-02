import "server-only";
import { mlDb } from "../db";
import { auditar } from "../auditoria";
import { renderizarTemplate, AREA_TEXTO_LABEL, POSICAO_PRODUTO_LABEL } from "../familias/templates";
import type { Database } from "../database.types";

/** Templates de prompt versionados (V2 §8) e presets de cena (V2 §7), administráveis pelo painel. */
export type TemplateRow = Database["public"]["Tables"]["ml_prompt_templates"]["Row"];
export type PresetRow = Database["public"]["Tables"]["ml_scene_presets"]["Row"];
export type ChaveTemplate = TemplateRow["key"];

export const CHAVES_TEMPLATE = [
  "lifestyle_no_text",
  "lifestyle_text",
  "editorial",
  "reference_generation",
  "exact_background",
  "manual_chatgpt",
  "pinterest_copy",
  "fidelity_check",
] as const;

export async function templateAtivo(key: string): Promise<TemplateRow> {
  const { data } = await mlDb().from("ml_prompt_templates").select("*").eq("key", key).eq("active", true).maybeSingle();
  if (!data) throw new Error(`Template de prompt "${key}" sem versão ativa.`);
  return data as TemplateRow;
}

export async function montarPrompt(key: string, vars: Record<string, string | null | undefined>): Promise<{ texto: string; versao: string; faltando: string[] }> {
  const t = await templateAtivo(key);
  const r = renderizarTemplate(t.body, vars);
  return { texto: r.texto, versao: `${key}@v${t.version}`, faltando: r.faltando };
}

export function varsDoPreset(p: PresetRow | null): Record<string, string> {
  if (!p) return { scene_environment: "ambiente neutro e iluminado", scene_style: "clean", scene_palette: "tons neutros", scene_lighting: "luz natural", scene_restrictions: "sem pessoas" };
  const area = p.text_area as "top" | "bottom" | "none";
  return {
    scene_name: p.name,
    scene_environment: p.environment,
    scene_style: p.style ?? "",
    scene_palette: p.palette ?? "",
    scene_lighting: p.lighting ?? "",
    scene_realism: p.realism,
    scene_restrictions: p.restrictions ?? "sem pessoas",
    text_area_label: AREA_TEXTO_LABEL[area],
    placement_label: POSICAO_PRODUTO_LABEL[area],
  };
}

/** Nova versão de um template — a anterior fica no histórico (desativada). */
export async function salvarNovaVersao(key: string, corpo: string, notas: string | null, userId: string | null): Promise<number> {
  const db = mlDb();
  const { data: ult } = await db.from("ml_prompt_templates").select("version").eq("key", key).order("version", { ascending: false }).limit(1).maybeSingle();
  const versao = ((ult as { version: number } | null)?.version ?? 0) + 1;
  await db.from("ml_prompt_templates").update({ active: false }).eq("key", key).eq("active", true);
  const { error } = await db.from("ml_prompt_templates").insert({ key, version: versao, body: corpo, notes: notas, active: true, created_by: userId });
  if (error) throw new Error(error.message);
  await auditar({ acao: "template.nova_versao", entidade: "prompt_template", entidadeId: `${key}@v${versao}`, actorId: userId, depois: { corpo } });
  return versao;
}

export async function ativarVersao(key: string, versao: number, userId: string | null): Promise<void> {
  const db = mlDb();
  const { data } = await db.from("ml_prompt_templates").select("id").eq("key", key).eq("version", versao).maybeSingle();
  if (!data) throw new Error("Versão inexistente.");
  await db.from("ml_prompt_templates").update({ active: false }).eq("key", key).eq("active", true);
  await db.from("ml_prompt_templates").update({ active: true }).eq("id", (data as { id: string }).id);
  await auditar({ acao: "template.ativar", entidade: "prompt_template", entidadeId: `${key}@v${versao}`, actorId: userId });
}

export async function lerPreset(id: string | null): Promise<PresetRow | null> {
  if (!id) return null;
  const { data } = await mlDb().from("ml_scene_presets").select("*").eq("id", id).maybeSingle();
  return (data as PresetRow | null) ?? null;
}

export interface EdicaoPreset {
  name: string;
  environment: string;
  palette?: string | null;
  lighting?: string | null;
  style?: string | null;
  realism?: string;
  text_area?: "top" | "bottom" | "none";
  restrictions?: string | null;
  category_hint?: string | null;
  active?: boolean;
  sort?: number;
}

export async function salvarPreset(id: string | null, e: EdicaoPreset, userId: string | null): Promise<string> {
  const db = mlDb();
  if (id) {
    const { error } = await db.from("ml_scene_presets").update(e).eq("id", id);
    if (error) throw new Error(error.message);
    await auditar({ acao: "preset.editar", entidade: "scene_preset", entidadeId: id, actorId: userId, depois: e });
    return id;
  }
  const key = e.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  const { data, error } = await db
    .from("ml_scene_presets")
    .insert({ ...e, key: `${key}_${Date.now().toString(36)}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const novo = (data as { id: string }).id;
  await auditar({ acao: "preset.criar", entidade: "scene_preset", entidadeId: novo, actorId: userId, depois: e });
  return novo;
}
