import { describe, expect, it } from "vitest";
import { desafioPkce, gerarPkce, gerarState } from "./pkce";
import { LIMITES, montarPayloadPin } from "./pinterest-payload";

describe("PKCE / state", () => {
  it("bate com o vetor de teste da RFC 7636", () => {
    expect(desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("gera verifier válido (43–128 chars, base64url) e challenge correspondente", () => {
    const { verifier, challenge } = gerarPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(desafioPkce(verifier));
  });
  it("state é aleatório e url-safe", () => {
    const a = gerarState();
    const b = gerarState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("payload do Pin", () => {
  const base = {
    board_id: "123",
    title: "T".repeat(150),
    description: "D".repeat(900),
    link: "https://mercadolivre.com/sec/abc",
    alt_text: "A".repeat(600),
    media_url: "https://x.supabase.co/storage/v1/object/public/ml-media/creatives/1.png",
  };
  it("respeita limites oficiais e usa image_url com o link de afiliado", () => {
    const p = montarPayloadPin(base);
    expect((p.title as string).length).toBe(LIMITES.titulo);
    expect((p.description as string).length).toBe(LIMITES.descricao);
    expect((p.alt_text as string).length).toBe(LIMITES.altText);
    expect(p.link).toBe(base.link);
    expect(p.media_source).toEqual({ source_type: "image_url", url: base.media_url });
  });
  it("envia ai_disclosures e board_section_id só quando aplicável", () => {
    const comIa = montarPayloadPin({ ...base, ai_modified: true, board_section_id: "987" });
    expect(comIa.ai_disclosures).toEqual({ values: ["AI_MODIFIED"] });
    expect(comIa.board_section_id).toBe("987");
    expect(montarPayloadPin({ ...base, ai_modified: false })).not.toHaveProperty("ai_disclosures");
    expect(montarPayloadPin({ ...base, ai_modified: true, enviar_ai_disclosure: false })).not.toHaveProperty("ai_disclosures");
    expect(montarPayloadPin({ ...base, board_section_id: "abc" })).not.toHaveProperty("board_section_id");
    // nenhum campo fora do schema PinCreate
    const permitidos = ["board_id", "board_section_id", "title", "description", "link", "alt_text", "media_source", "ai_disclosures"];
    expect(Object.keys(comIa).every((k) => permitidos.includes(k))).toBe(true);
  });
  it("omite alt_text vazio", () => {
    expect(montarPayloadPin({ ...base, alt_text: "" })).not.toHaveProperty("alt_text");
  });
  it("recusa imagem sem https e sem board", () => {
    expect(() => montarPayloadPin({ ...base, media_url: "http://x/1.png" })).toThrow();
    expect(() => montarPayloadPin({ ...base, board_id: "" })).toThrow();
  });
});
