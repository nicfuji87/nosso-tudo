/**
 * Payload de criação de Pin (puro — testado em oauth.test.ts). Só campos do
 * schema PinCreate da API v5 (OpenAPI 5.28.0): board_id, board_section_id, title,
 * description, link, alt_text, media_source, ai_disclosures. Interesses/tags NÃO
 * existem na escrita — ficam só no app (V2 §9).
 */
export const LIMITES = { titulo: 100, descricao: 800, link: 2048, altText: 500 } as const;

export interface NovoPin {
  board_id: string;
  title: string;
  description: string;
  link: string;
  alt_text?: string;
  media_url: string;
  board_section_id?: string | null;
  /** V2 §9.3: criativo gerado/modificado por IA → ai_disclosures AI_MODIFIED (PinCreate, OpenAPI v5.28). */
  ai_modified?: boolean;
  /** false quando a conta já recusou o campo — mantém só o flag interno. */
  enviar_ai_disclosure?: boolean;
}

export function montarPayloadPin(p: NovoPin): Record<string, unknown> {
  if (!p.board_id) throw new Error("Pin sem board.");
  if (!/^https:\/\//.test(p.media_url)) throw new Error("A imagem do Pin precisa de URL https pública.");
  if (p.link.length > LIMITES.link) throw new Error("Link acima de 2048 caracteres.");
  return {
    board_id: p.board_id,
    title: p.title.slice(0, LIMITES.titulo),
    description: p.description.slice(0, LIMITES.descricao),
    link: p.link,
    ...(p.alt_text ? { alt_text: p.alt_text.slice(0, LIMITES.altText) } : {}),
    ...(p.board_section_id && /^\d+$/.test(p.board_section_id) ? { board_section_id: p.board_section_id } : {}),
    ...(p.ai_modified && p.enviar_ai_disclosure !== false ? { ai_disclosures: { values: ["AI_MODIFIED"] } } : {}),
    media_source: { source_type: "image_url", url: p.media_url },
  };
}
