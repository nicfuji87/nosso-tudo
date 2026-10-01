import "server-only";
import { ImageResponse } from "next/og";
import { ALTURA, LARGURA, carregarFontes, dataUri, tamanhoFonte } from "./composicao";

/**
 * Layouts da V2: composição exata (produto real sobre o cenário), overlay de
 * texto programático, editorial e cenário estilizado sem IA. Todos 1000×1500.
 */

export interface ImagemComDim {
  bytes: Buffer;
  mime: string;
  largura: number;
  altura: number;
}

async function png(el: React.ReactElement): Promise<Buffer> {
  const resp = new ImageResponse(el, { width: LARGURA, height: ALTURA, fonts: await carregarFontes() });
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Composição exata (V2 §5.1 A): cenário em tela cheia + PRODUTO REAL por cima,
 * sem alteração de pixels (só escala uniforme) e com sombra de contato.
 * `recortado=false` ⇒ foto inteira do anúncio emoldurada (fundo não removível).
 */
export async function renderizarCenaExata(p: {
  fundo: { bytes: Buffer; mime: string };
  produto: ImagemComDim;
  recortado: boolean;
  posicao: "top" | "bottom" | "center"; // onde o PRODUTO fica (oposto da área de texto)
  escala?: number;
}): Promise<Buffer> {
  const escala = Math.max(0.3, Math.min(p.escala ?? (p.recortado ? 0.62 : 0.7), 0.9));
  const f = Math.min((LARGURA * escala) / p.produto.largura, (ALTURA * 0.55) / p.produto.altura);
  const w = Math.round(p.produto.largura * f);
  const h = Math.round(p.produto.altura * f);
  const left = Math.round((LARGURA - w) / 2);
  const top = p.posicao === "top" ? 170 : p.posicao === "center" ? Math.round((ALTURA - h) / 2) : ALTURA - h - 170;
  return png(
    <div style={{ width: LARGURA, height: ALTURA, display: "flex", position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={dataUri(p.fundo)} width={LARGURA} height={ALTURA} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
      {p.recortado ? (
        <div
          style={{
            position: "absolute",
            left: Math.round(left + w * 0.08),
            top: Math.round(top + h - h * 0.06),
            width: Math.round(w * 0.84),
            height: Math.max(24, Math.round(h * 0.1)),
            borderRadius: 9999,
            backgroundImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: p.recortado ? left : left - 18,
          top: p.recortado ? top : top - 18,
          display: "flex",
          // satori não entende boxShadow "none"/background "transparent" (vira bloco preto na origem): só define quando há moldura
          ...(p.recortado ? {} : { padding: 18, borderRadius: 36, background: "#FFFFFF", boxShadow: "0 24px 60px rgba(0,0,0,0.28)" }),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={dataUri(p.produto)} width={w} height={h} style={p.recortado ? {} : { borderRadius: 22 }} />
      </div>
    </div>,
  );
}

/** Overlay programático (V2 §8.2): headline aplicada pelo app, com contraste garantido. */
export async function renderizarOverlay(p: {
  base: { bytes: Buffer; mime: string };
  headline: string;
  subtitulo?: string | null;
  area: "top" | "bottom";
  corDestaque: string;
}): Promise<Buffer> {
  const topo = p.area === "top";
  return png(
    <div style={{ width: LARGURA, height: ALTURA, display: "flex", position: "relative", fontFamily: "Geist" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={dataUri(p.base)} width={LARGURA} height={ALTURA} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          width: LARGURA,
          height: 600,
          ...(topo ? { top: 0 } : { bottom: 0 }),
          display: "flex",
          flexDirection: "column",
          justifyContent: topo ? "flex-start" : "flex-end",
          padding: "80px 70px",
          backgroundImage: topo
            ? "linear-gradient(180deg, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0) 100%)"
            : "linear-gradient(0deg, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div style={{ display: "flex", color: "#FFFFFF", fontSize: tamanhoFonte(p.headline), fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
          {p.headline}
        </div>
        {p.subtitulo ? (
          <div style={{ display: "flex", marginTop: 18, color: "rgba(255,255,255,0.9)", fontSize: 34, lineHeight: 1.25 }}>{p.subtitulo}</div>
        ) : null}
        <div style={{ display: "flex", marginTop: 26, width: 90, height: 8, borderRadius: 8, background: p.corDestaque }} />
      </div>
    </div>,
  );
}

/** Editorial (V2 §6.3): título + lista curta + imagem; informativo, não agressivo. */
export async function renderizarEditorial(p: {
  imagem: { bytes: Buffer; mime: string };
  titulo: string;
  pontos: string[];
  corFundo: string;
  corDestaque: string;
}): Promise<Buffer> {
  const pontos = p.pontos.filter(Boolean).slice(0, 4);
  return png(
    <div style={{ width: LARGURA, height: ALTURA, display: "flex", flexDirection: "column", background: p.corFundo, padding: "80px 70px 70px", fontFamily: "Geist" }}>
      <div style={{ display: "flex", color: "#111315", fontSize: tamanhoFonte(p.titulo) - 6, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.2 }}>
        {p.titulo}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
        {pontos.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                width: 46,
                height: 46,
                marginRight: 18,
                borderRadius: 999,
                background: p.corDestaque,
                color: "#FFFFFF",
                fontSize: 26,
                fontWeight: 700,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {String(i + 1)}
            </div>
            <div style={{ display: "flex", flex: 1, color: "#2A2E33", fontSize: 32, lineHeight: 1.3 }}>{t}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 30, flex: 1, display: "flex", borderRadius: 40, overflow: "hidden", background: "#FFFFFF" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={dataUri(p.imagem)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </div>,
  );
}

const PALETA: [RegExp, string][] = [
  [/terracota/i, "#C9876A"],
  [/areia|bege/i, "#E6D8C3"],
  [/madeira/i, "#B98B5E"],
  [/off-?white|branco/i, "#F4F1EA"],
  [/cinza claro/i, "#D9DCDD"],
  [/cinza/i, "#9EA3A6"],
  [/grafite/i, "#3B3F44"],
  [/preto/i, "#1E1F22"],
  [/dourado/i, "#C2A15A"],
  [/s[aá]lvia|verde/i, "#A9BCA8"],
  [/azul/i, "#BFD3E0"],
  [/inox/i, "#C8CDD1"],
];

/** Cores do preset a partir da descrição da paleta (fallback sem IA). */
export function coresDaPaleta(paleta: string | null | undefined): [string, string, string] {
  const texto = paleta ?? "";
  const cores = PALETA.filter(([re]) => re.test(texto)).map(([, c]) => c);
  const lista = [...cores, "#F4F1EA", "#D9DCDD", "#C8CDD1"];
  return [lista[0]!, lista[1]!, lista[2]!];
}

/** Cenário estilizado sem IA (parede + bancada) — a composição exata funciona sem OpenAI. */
export async function renderizarFundoProgramatico(p: { paleta: string | null | undefined }): Promise<Buffer> {
  const [c1, c2, c3] = coresDaPaleta(p.paleta);
  return png(
    <div style={{ width: LARGURA, height: ALTURA, display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ display: "flex", flex: 1, backgroundImage: `linear-gradient(180deg, ${c1} 0%, ${c2} 100%)` }} />
      <div style={{ display: "flex", height: 360, backgroundImage: `linear-gradient(180deg, ${c3} 0%, ${c2} 100%)` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: LARGURA,
          height: ALTURA,
          backgroundImage: "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 60%)",
        }}
      />
    </div>,
  );
}
