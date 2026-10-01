/**
 * Validação de imagem por conteúdo (magic bytes) — nunca confiar na extensão
 * ou no Content-Type enviado (spec §24). Pura, testada em imagem.test.ts.
 */
export type MimeImagem = "image/png" | "image/jpeg" | "image/webp";

export const TAMANHO_MAXIMO = 15 * 1024 * 1024;
export const LADO_MINIMO = 500;

export function detectarMime(b: Uint8Array): MimeImagem | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  )
    return "image/webp";
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

export function dimensoes(b: Uint8Array, mime: MimeImagem): { largura: number; altura: number } | null {
  try {
    if (mime === "image/png") return { largura: u32be(b, 16), altura: u32be(b, 20) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marcador = b[i + 1]!;
        const tam = u16be(b, i + 2);
        // SOF0..SOF15 (exceto DHT/JPG/DAC)
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
          return { altura: u16be(b, i + 5), largura: u16be(b, i + 7) };
        }
        i += 2 + tam;
      }
      return null;
    }
    // WEBP
    const tipo = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (tipo === "VP8X") return { largura: u24le(b, 24) + 1, altura: u24le(b, 27) + 1 };
    if (tipo === "VP8 ") return { largura: u16le(b, 26) & 0x3fff, altura: u16le(b, 28) & 0x3fff };
    if (tipo === "VP8L") {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { largura: (bits & 0x3fff) + 1, altura: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  } catch {
    return null;
  }
}

export interface ImagemValidada {
  mime: MimeImagem;
  largura: number | null;
  altura: number | null;
  bytes: number;
  avisos: string[];
}

export function validarImagem(b: Uint8Array): { ok: true; imagem: ImagemValidada } | { ok: false; erro: string } {
  if (b.length === 0) return { ok: false, erro: "Arquivo vazio." };
  if (b.length > TAMANHO_MAXIMO) return { ok: false, erro: "Imagem acima de 15 MB." };
  const mime = detectarMime(b);
  if (!mime) return { ok: false, erro: "Formato não suportado. Envie PNG, JPG ou WEBP." };
  const d = dimensoes(b, mime);
  const avisos: string[] = [];
  if (d && Math.min(d.largura, d.altura) < LADO_MINIMO) {
    return { ok: false, erro: `Imagem pequena demais (${d.largura}×${d.altura}). Mínimo ${LADO_MINIMO}px no menor lado.` };
  }
  if (d) {
    const proporcao = d.altura / d.largura;
    if (proporcao < 1.2) avisos.push("O Pinterest favorece imagens verticais (2:3). Esta é horizontal/quadrada.");
  }
  return { ok: true, imagem: { mime, largura: d?.largura ?? null, altura: d?.altura ?? null, bytes: b.length, avisos } };
}

export function extensao(mime: MimeImagem): string {
  return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
}
