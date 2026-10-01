import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { detectarMime } from "./imagem";

/**
 * Operações de pixel em JS puro (sem binário nativo): decodificar PNG/JPEG,
 * recortar o fundo do produto e calcular hash perceptual. Testado em pixels.test.ts.
 *
 * O recorte NÃO altera nenhum pixel do produto (V2 §5.1 A): só torna
 * transparente o fundo uniforme conectado às bordas (fotos de catálogo do ML
 * costumam ter fundo branco). Se o fundo não for uniforme, devolve "não possível"
 * — e a composição exata usa a foto inteira emoldurada, sem inventar nada.
 */

export interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

export function decodificar(bytes: Uint8Array): Bitmap {
  const mime = detectarMime(bytes);
  if (mime === "image/png") {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (mime === "image/jpeg") {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  }
  throw new Error(mime ? `Formato ${mime} não suportado para processamento (use PNG ou JPG).` : "Imagem em formato desconhecido.");
}

export function codificarPng(b: Bitmap): Buffer {
  const png = new PNG({ width: b.width, height: b.height });
  png.data = Buffer.from(b.data);
  return PNG.sync.write(png);
}

/** Redução por média de área (boa para hash e para limitar tamanho de processamento). */
export function reduzir(b: Bitmap, largura: number, altura: number): Bitmap {
  const out = new Uint8Array(largura * altura * 4);
  const sx = b.width / largura;
  const sy = b.height / altura;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0, g = 0, bl = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < b.height; yy++) {
        for (let xx = x0; xx < x1 && xx < b.width; xx++) {
          const i = (yy * b.width + xx) * 4;
          r += b.data[i]!;
          g += b.data[i + 1]!;
          bl += b.data[i + 2]!;
          a += b.data[i + 3]!;
          n++;
        }
      }
      const o = (y * largura + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = bl / n;
      out[o + 3] = a / n;
    }
  }
  return { width: largura, height: altura, data: out };
}

/** Limita o maior lado (processamento previsível em função serverless). */
export function limitarLado(b: Bitmap, maximo: number): Bitmap {
  const maior = Math.max(b.width, b.height);
  if (maior <= maximo) return b;
  const f = maximo / maior;
  return reduzir(b, Math.max(1, Math.round(b.width * f)), Math.max(1, Math.round(b.height * f)));
}

/** dHash 64 bits (hex) — imagens quase idênticas têm distância de Hamming pequena. */
export function dhash(b: Bitmap): string {
  const r = reduzir(b, 9, 8);
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4;
      const j = (y * 9 + x + 1) * 4;
      const l1 = r.data[i]! * 0.299 + r.data[i + 1]! * 0.587 + r.data[i + 2]! * 0.114;
      const l2 = r.data[j]! * 0.299 + r.data[j + 1]! * 0.587 + r.data[j + 2]! * 0.114;
      bits += l1 > l2 ? "1" : "0";
    }
  }
  let hex = "";
  for (let k = 0; k < 64; k += 4) hex += parseInt(bits.slice(k, k + 4), 2).toString(16);
  return hex;
}

export function distanciaHash(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let k = 0; k < a.length; k++) {
    let x = parseInt(a[k]!, 16) ^ parseInt(b[k]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export interface ResultadoRecorte {
  possivel: boolean;
  motivo: string;
  bitmap?: Bitmap; // RGBA com fundo transparente, já cortado no contorno do produto
  cobertura?: number; // fração da imagem ocupada pelo produto
}

/**
 * Remove o fundo uniforme conectado às bordas. Critérios de segurança:
 * - a borda precisa ser quase toda da mesma cor (fundo de estúdio);
 * - o produto restante precisa ocupar entre 3% e 97% da imagem.
 */
export function recortarFundo(b: Bitmap, opts: { tolerancia?: number } = {}): ResultadoRecorte {
  const tol = opts.tolerancia ?? 28;
  const { width: w, height: h, data } = b;
  // cor de fundo = mediana aproximada da borda
  const borda: number[][] = [];
  const amostra = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    borda.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  };
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 200))) {
    amostra(x, 0);
    amostra(x, h - 1);
  }
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 200))) {
    amostra(0, y);
    amostra(w - 1, y);
  }
  const med = (k: number) => borda.map((p) => p[k]!).sort((x, y) => x - y)[Math.floor(borda.length / 2)]!;
  const fundo = [med(0), med(1), med(2)] as const;
  const perto = (i: number) =>
    Math.abs(data[i]! - fundo[0]) <= tol && Math.abs(data[i + 1]! - fundo[1]) <= tol && Math.abs(data[i + 2]! - fundo[2]) <= tol;
  const uniformes = borda.filter((p) => Math.abs(p[0]! - fundo[0]) <= tol && Math.abs(p[1]! - fundo[1]) <= tol && Math.abs(p[2]! - fundo[2]) <= tol).length;
  if (uniformes / borda.length < 0.9) {
    return { possivel: false, motivo: "Fundo da foto não é uniforme — recorte automático não é seguro." };
  }

  // flood fill a partir de todas as bordas
  const fundoMask = new Uint8Array(w * h);
  const pilha: number[] = [];
  const empurrar = (x: number, y: number) => {
    const p = y * w + x;
    if (fundoMask[p]) return;
    if (!perto(p * 4)) return;
    fundoMask[p] = 1;
    pilha.push(p);
  };
  for (let x = 0; x < w; x++) {
    empurrar(x, 0);
    empurrar(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    empurrar(0, y);
    empurrar(w - 1, y);
  }
  while (pilha.length) {
    const p = pilha.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) empurrar(x - 1, y);
    if (x < w - 1) empurrar(x + 1, y);
    if (y > 0) empurrar(x, y - 1);
    if (y < h - 1) empurrar(x, y + 1);
  }

  // caixa do produto
  let minX = w, minY = h, maxX = -1, maxY = -1, produto = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!fundoMask[y * w + x]) {
        produto++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cobertura = produto / (w * h);
  if (maxX < 0 || cobertura < 0.03) return { possivel: false, motivo: "Produto muito pequeno na foto.", cobertura };
  if (cobertura > 0.97) return { possivel: false, motivo: "Produto ocupa a foto inteira — não há fundo para remover.", cobertura };

  // copia o recorte; alfa suave (1 px) só na fronteira com o fundo — pixels internos intocados
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = x + minX;
      const sy = y + minY;
      const sp = sy * w + sx;
      const si = sp * 4;
      const oi = (y * cw + x) * 4;
      if (fundoMask[sp]) {
        out[oi + 3] = 0;
        continue;
      }
      out[oi] = data[si]!;
      out[oi + 1] = data[si + 1]!;
      out[oi + 2] = data[si + 2]!;
      const vizinhoFundo =
        (sx > 0 && fundoMask[sp - 1]) || (sx < w - 1 && fundoMask[sp + 1]) || (sy > 0 && fundoMask[sp - w]) || (sy < h - 1 && fundoMask[sp + w]);
      out[oi + 3] = vizinhoFundo ? Math.round(data[si + 3]! * 0.6) : data[si + 3]!;
    }
  }
  return { possivel: true, motivo: "Fundo uniforme removido.", bitmap: { width: cw, height: ch, data: out }, cobertura };
}
