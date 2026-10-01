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
