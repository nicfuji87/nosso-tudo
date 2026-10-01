/** Payload de criação de Pin (puro — testado em oauth.test.ts). Limites oficiais da API v5. */
export const LIMITES = { titulo: 100, descricao: 800, link: 2048, altText: 500 } as const;

export interface NovoPin {
  board_id: string;
  title: string;
  description: string;
  link: string;
  alt_text?: string;
  media_url: string;
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
    media_source: { source_type: "image_url", url: p.media_url },
  };
}
