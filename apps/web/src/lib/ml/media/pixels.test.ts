import { describe, expect, it } from "vitest";
import { codificarPng, decodificar, dhash, distanciaHash, recortarFundo, reduzir, type Bitmap } from "./pixels";

function tela(w: number, h: number, fundo: [number, number, number], quadrado?: { x: number; y: number; s: number; cor: [number, number, number] }): Bitmap {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dentro = quadrado && x >= quadrado.x && x < quadrado.x + quadrado.s && y >= quadrado.y && y < quadrado.y + quadrado.s;
      const c = dentro ? quadrado!.cor : fundo;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe("pixels", () => {
  it("PNG ida e volta", () => {
    const b = tela(20, 10, [10, 20, 30]);
    const d = decodificar(codificarPng(b));
    expect(d.width).toBe(20);
    expect(d.height).toBe(10);
    expect(Array.from(d.data.slice(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it("recorta o produto do fundo branco sem alterar pixels internos", () => {
    const b = tela(100, 100, [255, 255, 255], { x: 30, y: 40, s: 20, cor: [20, 20, 20] });
    const r = recortarFundo(b);
    expect(r.possivel).toBe(true);
    expect(r.bitmap!.width).toBe(20);
    expect(r.bitmap!.height).toBe(20);
    // pixel do meio do produto intacto e opaco
    const i = (10 * 20 + 10) * 4;
    expect(Array.from(r.bitmap!.data.slice(i, i + 4))).toEqual([20, 20, 20, 255]);
    expect(r.cobertura).toBeCloseTo(0.04, 2);
  });

  it("recusa fundo não uniforme", () => {
    const b = tela(60, 60, [255, 255, 255]);
    // metade esquerda da borda escura
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 30; x++) {
        const i = (y * 60 + x) * 4;
        b.data[i] = 0;
        b.data[i + 1] = 0;
        b.data[i + 2] = 0;
      }
    }
    expect(recortarFundo(b).possivel).toBe(false);
  });

  it("recusa quando não há produto", () => {
    expect(recortarFundo(tela(50, 50, [250, 250, 250])).possivel).toBe(false);
  });

  it("dHash: imagens iguais distância 0; diferentes distância alta", () => {
    const a = tela(64, 64, [255, 255, 255], { x: 5, y: 5, s: 20, cor: [0, 0, 0] });
    const a2 = reduzir(a, 63, 63);
    const c = tela(64, 64, [255, 255, 255], { x: 40, y: 40, s: 20, cor: [0, 0, 0] });
    expect(distanciaHash(dhash(a), dhash(a))).toBe(0);
    expect(distanciaHash(dhash(a), dhash(a2))).toBeLessThanOrEqual(6);
    expect(distanciaHash(dhash(a), dhash(c))).toBeGreaterThan(6);
  });
});
