import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Composição programática (modo "sem IA generativa", ADR-ML-011): foto real +
 * layout + texto → PNG 1000×1500 com next/og (satori), sem custo e sem IA.
 * Dois layouts: "produto" (foto do anúncio sobre fundo limpo) e "cena"
 * (imagem gerada em tela cheia + faixa com a headline).
 */

const LARGURA = 1000;
const ALTURA = 1500;

let fontes: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | null = null;

async function carregarFontes() {
  if (fontes) return fontes;
  const base = path.join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans");
  const [bold, regular] = await Promise.all([readFile(path.join(base, "Geist-Bold.ttf")), readFile(path.join(base, "Geist-Regular.ttf"))]);
  const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  fontes = [
    { name: "Geist", data: ab(bold), weight: 700, style: "normal" },
    { name: "Geist", data: ab(regular), weight: 400, style: "normal" },
  ];
  return fontes;
}

export interface Composicao {
  layout: "produto" | "cena";
  imagem: { bytes: Buffer; mime: string };
  headline: string;
  cta?: string | null;
  selo?: string | null; // ex.: "-25%" ou preço quando permitido
  corFundo: string;
  corDestaque: string;
}

function dataUri(img: { bytes: Buffer; mime: string }): string {
  return `data:${img.mime};base64,${img.bytes.toString("base64")}`;
}

function tamanhoFonte(texto: string): number {
  const n = texto.length;
  if (n <= 22) return 88;
  if (n <= 36) return 74;
  if (n <= 50) return 62;
  return 54;
}

export async function renderizarComposicao(c: Composicao): Promise<Buffer> {
  const src = dataUri(c.imagem);
  const fs = tamanhoFonte(c.headline);
  const el =
    c.layout === "cena" ? (
      <div style={{ width: LARGURA, height: ALTURA, display: "flex", position: "relative", fontFamily: "Geist" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={src} width={LARGURA} height={ALTURA} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: LARGURA,
            height: 560,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            padding: "80px 70px",
            backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.0) 100%)",
          }}
        >
          <div style={{ display: "flex", color: "#FFFFFF", fontSize: fs, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
            {c.headline}
          </div>
        </div>
        {c.cta ? (
          <div
            style={{
              position: "absolute",
              bottom: 70,
              left: 70,
              display: "flex",
              padding: "22px 40px",
              borderRadius: 999,
              background: c.corDestaque,
              color: "#FFFFFF",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {c.cta}
          </div>
        ) : null}
      </div>
    ) : (
      <div
        style={{
          width: LARGURA,
          height: ALTURA,
          display: "flex",
          flexDirection: "column",
          background: c.corFundo,
          padding: "90px 70px 70px",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", color: "#111315", fontSize: fs, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
          {c.headline}
        </div>
        <div
          style={{
            marginTop: 50,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#FFFFFF",
            borderRadius: 48,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={src} style={{ maxWidth: 780, maxHeight: 820, objectFit: "contain" }} />
          {c.selo ? (
            <div
              style={{
                position: "absolute",
                top: 36,
                right: 36,
                display: "flex",
                padding: "14px 26px",
                borderRadius: 999,
                background: c.corDestaque,
                color: "#FFFFFF",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              {c.selo}
            </div>
          ) : null}
        </div>
        {c.cta ? (
          <div style={{ marginTop: 44, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                display: "flex",
                padding: "24px 48px",
                borderRadius: 999,
                background: c.corDestaque,
                color: "#FFFFFF",
                fontSize: 36,
                fontWeight: 700,
              }}
            >
              {c.cta}
            </div>
          </div>
        ) : null}
      </div>
    );

  const resp = new ImageResponse(el, { width: LARGURA, height: ALTURA, fonts: await carregarFontes() });
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Recorte 2:3 por ponto focal (crop do editor — spec §10): enquadra a imagem
 * em 1000×1500 com "cover", deslocando pelo foco (0–1) e com zoom ≥ 1.
 */
export async function renderizarRecorte(
  imagem: { bytes: Buffer; mime: string; largura: number; altura: number },
  foco: { x: number; y: number; zoom: number },
): Promise<Buffer> {
  const zoom = Math.max(1, Math.min(foco.zoom, 4));
  const escala = Math.max(LARGURA / imagem.largura, ALTURA / imagem.altura) * zoom;
  const w = Math.round(imagem.largura * escala);
  const h = Math.round(imagem.altura * escala);
  const fx = Math.max(0, Math.min(1, foco.x));
  const fy = Math.max(0, Math.min(1, foco.y));
  const left = -Math.round((w - LARGURA) * fx);
  const top = -Math.round((h - ALTURA) * fy);
  const el = (
    <div style={{ width: LARGURA, height: ALTURA, display: "flex", position: "relative", overflow: "hidden", background: "#FFFFFF" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={dataUri(imagem)} width={w} height={h} style={{ position: "absolute", left, top, width: w, height: h }} />
    </div>
  );
  const resp = new ImageResponse(el, { width: LARGURA, height: ALTURA, fonts: await carregarFontes() });
  return Buffer.from(await resp.arrayBuffer());
}
