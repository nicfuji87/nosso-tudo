/**
 * Tipos "achatados" e rótulos da V2 (imagens do anúncio, famílias, variantes) —
 * puros e serializáveis, usados no server (páginas) e no client (componentes).
 */
import { MODO_FIDELIDADE_LABEL, TIPO_VISUAL_LABEL, type Mix } from "@/lib/ml/familias/plano";

export const ORIGEM_MIDIA_LABEL: Record<string, string> = {
  ml_api: "API do ML",
  discovery: "Descoberta",
  apify: "Apify",
  manual_url: "URL manual",
  upload: "Upload",
};

export const PAPEL_MIDIA_LABEL: Record<string, string> = {
  primary_reference: "Referência principal",
  complementary: "Complementar",
  do_not_use: "Não usar",
  consult_only: "Somente consulta",
};

export const PAPEIS_MIDIA = ["primary_reference", "complementary", "do_not_use", "consult_only"] as const;
export type PapelMidia = (typeof PAPEIS_MIDIA)[number];

export const METODO_LABEL: Record<string, string> = {
  auto: "Automático",
  manual_chatgpt: "Manual via ChatGPT",
  upload: "Upload próprio",
};

export const FAMILIA_STATUS_LABEL: Record<string, string> = {
  planning: "Planejando",
  generating: "Gerando",
  active: "Ativa",
  archived: "Arquivada",
};

export const FIDELIDADE_STATUS_LABEL: Record<string, string> = {
  not_required: "Fidelidade: não exigida",
  pending: "Fidelidade: pendente",
  ok: "Fidelidade: ok",
  warning: "Fidelidade: alerta",
  failed: "Fidelidade: reprovada",
  human_ok: "Fidelidade: revisada",
};

export const PACOTE_STATUS_LABEL: Record<string, string> = {
  missing: "Pacote: ausente",
  incomplete: "Pacote: incompleto",
  ready: "Pacote: pronto",
  invalid: "Pacote: inválido",
};

export const RECORTE_STATUS_LABEL: Record<string, string> = {
  none: "Sem recorte",
  ready: "Recorte pronto",
  not_possible: "Recorte não possível",
  failed: "Recorte falhou",
};

export const MIDIA_STATUS_LABEL: Record<string, string> = {
  pending: "Importando",
  ready: "Pronta",
  failed: "Falhou",
};

export function labelTipoVisual(t: string): string {
  return (TIPO_VISUAL_LABEL as Record<string, string>)[t] ?? t;
}

export function labelModoFidelidade(m: string): string {
  return (MODO_FIDELIDADE_LABEL as Record<string, string>)[m] ?? m;
}

/** Imagem do anúncio (ml_product_media) pronta para a UI. */
export interface MidiaView {
  id: string;
  url: string | null; // public_url ou, na falta, source_url
  public_url: string | null;
  source_url: string | null;
  source_type: string;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  media_role: string;
  role_source: string;
  status: string;
  error: string | null;
  cutout_status: string;
  cutout_url: string | null;
  cutout_note: string | null;
  captured_at: string;
  sort_order: number;
}

export interface PresetOpcao {
  id: string;
  key: string;
  name: string;
  environment: string;
  palette: string | null;
  text_area: string;
  category_hint: string | null;
}

export interface BoardOpcaoV2 {
  id: string;
  name: string;
  is_default: boolean;
}

export interface AnguloOpcao {
  id: string;
  hook: string;
  type: string;
}

export interface DefaultsLote {
  mix: Mix;
  modo: string;
  limiteUsd: number;
  maxVariantes: number;
}

export interface VarianteView {
  id: string;
  status: string;
  visual_type: string;
  cena: string | null;
  fidelity_status: string;
  package_status: string;
  ai_modified: boolean;
  headline: string | null;
  has_text_overlay: boolean;
  img: string | null;
}

export interface FamiliaView {
  id: string;
  name: string;
  hypothesis: string | null;
  objective: string | null;
  status: string;
  created_at: string;
  batch_job_id: string | null;
  cost_estimated_usd: number | null;
  board: string | null;
  mix: Partial<Mix> | null;
  modo: string | null;
  metodo: string | null;
  variantes: VarianteView[];
}

/** Lê o `plan` jsonb da família sem confiar no formato. */
export function lerPlano(plan: unknown): { mix: Partial<Mix> | null; modo: string | null; metodo: string | null } {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { mix: null, modo: null, metodo: null };
  const p = plan as { mix?: unknown; modo?: unknown; metodo?: unknown };
  let mix: Partial<Mix> | null = null;
  if (p.mix && typeof p.mix === "object" && !Array.isArray(p.mix)) {
    mix = {};
    for (const [k, v] of Object.entries(p.mix as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) (mix as Record<string, number>)[k] = n;
    }
  }
  return {
    mix,
    modo: typeof p.modo === "string" ? p.modo : null,
    metodo: typeof p.metodo === "string" ? p.metodo : null,
  };
}

export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `US$ ${v.toFixed(2).replace(".", ",")}`;
}
