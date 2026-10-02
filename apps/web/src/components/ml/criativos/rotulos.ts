/**
 * Tipos e rótulos da área de criativos — puros, usáveis no client e no server.
 */

export const MODO_IMAGEM_LABEL: Record<string, string> = {
  composition: "Composição",
  api: "IA",
  manual_chatgpt: "ChatGPT manual",
  upload: "Upload",
};

export const MODOS_IMAGEM = ["composition", "api", "manual_chatgpt", "upload"] as const;

export function labelModo(modo: string): string {
  return MODO_IMAGEM_LABEL[modo] ?? modo;
}

/** Colunas do Kanban (spec §10) — "Arquivado" fica fora (filtro de status). */
export const COLUNAS_KANBAN = [
  { status: "to_generate", label: "A gerar" },
  { status: "generating", label: "Em geração" },
  { status: "waiting_manual_image", label: "Aguardando imagem" },
  { status: "review", label: "Revisão" },
  { status: "approved", label: "Aprovado" },
  { status: "rejected", label: "Rejeitado" },
  { status: "published", label: "Publicado" },
] as const;

export const REVISAO_LABEL: Record<string, string> = {
  edit: "Edição manual",
  regenerate_copy: "Textos regenerados",
  regenerate_image: "Imagem regenerada",
  replace_image: "Imagem substituída",
  generated: "Geração inicial",
};

/** Motivos rápidos de rejeição (o texto livre continua disponível). */
export const MOTIVOS_REJEICAO = ["Imagem ruim", "Texto fraco", "Não combina com o produto", "Repetido", "Fora do tom"] as const;

export interface AssetView {
  id: string;
  public_url: string;
  width: number | null;
  height: number | null;
}

export interface BoardOpcao {
  id: string;
  name: string;
  is_default: boolean;
}

/** Criativo "achatado" para a UI (serializável para Client Components). */
export interface CriativoView {
  id: string;
  product_id: string;
  status: string;
  image_mode: string;
  format: string;
  headline: string | null;
  title: string | null;
  description: string | null;
  alt_text: string | null;
  cta: string | null;
  keywords: string[];
  board_id: string | null;
  quality_score: number | null;
  quality_notes: string[];
  rejection_reason: string | null;
  last_error: string | null;
  image_prompt: string | null;
  reference_image_url: string | null;
  created_at: string;
  updated_at: string;
  asset: AssetView | null;
  produto: { id: string; title: string; thumbnail: string | null } | null;
  angulo: string | null;
  board: string | null;
  // --- V2 (famílias de criativos). Em criativos legados (family_id null) só os defaults do banco.
  family_id: string | null;
  visual_type: string;
  scene_preset_id: string | null;
  /** Nome do preset de cena. */
  cena: string | null;
  fidelity_mode: string;
  fidelity_status: string;
  fidelity_score: number | null;
  fidelity_ia: FidelidadeIAView | null;
  fidelity_humano: { nota: string | null; em: string | null; checklist: Record<string, boolean> } | null;
  has_text_overlay: boolean;
  ai_modified: boolean;
  package_status: string;
  package_errors: ErroPacote[];
  board_section_id: string | null;
  interests: string[];
  source_media_ids: string[];
  approved_at: string | null;
  /** Pins (qualquer status) ligados ao criativo. */
  pins: number;
  /** Soma das métricas diárias dos Pins publicados (null = sem dados). */
  metricas: MetricasView | null;
}

export interface FidelidadeIAView {
  score: number | null;
  resumo: string | null;
  problemas: string[];
  itens: Record<string, boolean>;
}

export interface ErroPacote {
  campo: string;
  mensagem: string;
}

export interface MetricasView {
  impressoes: number;
  saves: number;
  cliques: number;
  outbound: number;
}

/** Cena de preset ativa (para "Adicionar variante"). */
export interface PresetOpcao {
  id: string;
  name: string;
  environment: string;
}

// ---------------------------------------------------------------------------
// V2 — rótulos de família, fidelidade e pacote
// ---------------------------------------------------------------------------

export const FIDELIDADE_LABEL: Record<string, string> = {
  not_required: "Produto preservado",
  pending: "Fidelidade pendente",
  ok: "Fiel (IA)",
  warning: "Alerta de fidelidade",
  failed: "Fidelidade reprovada",
  human_ok: "Fiel (confirmado)",
};

export const PACOTE_LABEL: Record<string, string> = {
  missing: "Pacote ausente",
  incomplete: "Pacote incompleto",
  ready: "Pacote pronto",
  invalid: "Pacote inválido",
};

export const FAMILIA_STATUS_LABEL: Record<string, string> = {
  planning: "Planejando",
  generating: "Gerando",
  active: "Ativa",
  archived: "Arquivada",
};

export const ASSET_KIND_LABEL: Record<string, string> = {
  base: "Sem texto",
  final: "Final",
  background: "Cenário",
};

export const METODOS_IMAGEM_V2 = [
  { valor: "auto", label: "Automático (IA ou composição)" },
  { valor: "manual_chatgpt", label: "Manual no ChatGPT" },
  { valor: "upload", label: "Upload próprio" },
] as const;

/** Status de criativo que bloqueiam "Excluir rascunho" (espelha servicos/variantes.excluirRascunho). */
const RASCUNHO = ["to_generate", "generating", "waiting_manual_image", "review", "rejected"];

export function podeExcluirRascunho(c: Pick<CriativoView, "status" | "approved_at" | "pins">): boolean {
  return RASCUNHO.includes(c.status) && !c.approved_at && c.pins === 0;
}

/** Fidelidade que ainda pede olho humano. */
export function fidelidadePendenteHumano(status: string): boolean {
  return status === "pending" || status === "warning" || status === "failed";
}

/** CTR de saída (outbound ÷ impressões), em %. */
export function ctrSaida(m: MetricasView | null): number | null {
  if (!m || !m.impressoes) return null;
  return (m.outbound / m.impressoes) * 100;
}

/** Status em que o criativo ainda pode ser editado/regenerado. */
export function editavel(status: string): boolean {
  return !["published", "archived"].includes(status);
}

export function podeRejeitar(status: string): boolean {
  return ["to_generate", "generating", "waiting_manual_image", "review", "approved"].includes(status);
}

/** Nome de arquivo amigável para downloads. */
export function nomeArquivo(base: string, url: string): string {
  const ext = /\.(png|jpe?g|webp)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? "png";
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "imagem"}.${ext}`;
}

/**
 * Baixa um arquivo de outra origem. O atributo `download` é ignorado em URLs
 * cross-origin, então buscamos como blob (Storage do Supabase libera CORS);
 * se o host não permitir, abrimos em nova aba como alternativa.
 */
export async function baixarArquivo(url: string, nome: string): Promise<"baixado" | "aberto"> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "baixado";
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return "aberto";
  }
}

/** Família de criativos "achatada" para a UI (§11.5). */
export interface FamiliaView {
  id: string;
  name: string;
  hypothesis: string | null;
  objective: string | null;
  status: string;
  created_at: string;
  product_id: string;
  produto: { id: string; title: string; thumbnail: string | null } | null;
  /** Imagem de referência principal do produto (ml_product_media primary_reference). */
  referencia: string | null;
  default_board_id: string | null;
  board: string | null;
  totais: { variantes: number; aprovadas: number; publicadas: number; revisao: number };
}

export interface FamiliaOpcao {
  id: string;
  name: string;
}

/** Diálogos V2 da variante (também abríveis via `?criativo=<id>&acao=<dialogo>`). */
export const DIALOGOS_V2 = ["lado", "fidelidade", "problema", "referencia"] as const;
export type DialogoV2 = (typeof DIALOGOS_V2)[number];

/**
 * Referências de uma variante na ordem de `source_media_ids` (a principal primeiro);
 * sem ids gravados, cai para a principal + complementares do produto.
 */
export function ordenarReferencias<T extends { id: string; media_role: string; reference_priority: number | null }>(sourceIds: string[], midias: T[]): T[] {
  const porId = new Map(midias.map((m) => [m.id, m]));
  const daVariante = sourceIds.map((id) => porId.get(id)).filter((m): m is T => Boolean(m));
  if (daVariante.length) return daVariante;
  const principal = midias.filter((m) => m.media_role === "primary_reference");
  const comp = midias.filter((m) => m.media_role === "complementary").sort((a, b) => (a.reference_priority ?? 99) - (b.reference_priority ?? 99));
  return [...principal, ...comp];
}
