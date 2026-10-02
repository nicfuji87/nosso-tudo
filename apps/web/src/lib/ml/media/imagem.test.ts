import { describe, expect, it } from "vitest";
import { detectarMime, dimensoes, validarImagem } from "./imagem";

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

function jpeg(w: number, h: number): Uint8Array {
  // SOI, APP0 (tam 16), SOF0 (tam 17)
  const b = new Uint8Array(2 + 18 + 19 + 2);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
  const sof = 2 + 18;
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff], sof);
  return b;
}

describe("imagem", () => {
  it("detecta por magic bytes", () => {
    expect(detectarMime(png(1, 1))).toBe("image/png");
    expect(detectarMime(jpeg(1, 1))).toBe("image/jpeg");
    expect(detectarMime(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
  it("lê dimensões de PNG e JPEG", () => {
    expect(dimensoes(png(1000, 1500), "image/png")).toEqual({ largura: 1000, altura: 1500 });
    expect(dimensoes(jpeg(800, 1200), "image/jpeg")).toEqual({ largura: 800, altura: 1200 });
  });
  it("recusa formato desconhecido e imagem pequena", () => {
    expect(validarImagem(new TextEncoder().encode("GIF89a")).ok).toBe(false);
    const r = validarImagem(png(300, 400));
    expect(r.ok).toBe(false);
  });
  it("avisa quando não é vertical", () => {
    const r = validarImagem(png(1200, 1200));
    expect(r.ok && r.imagem.avisos.length).toBe(1);
    const v = validarImagem(png(1000, 1500));
    expect(v.ok && v.imagem.avisos.length).toBe(0);
  });
});
