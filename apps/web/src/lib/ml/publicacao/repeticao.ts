import { similaridade } from "../conteudo/guardrails";
import { distanciaHash } from "../media/pixels";

/**
 * Anti-repetição (V2 §16) — pura e testada. Avalia se publicar a variante em
 * `quando` repete demais o mesmo produto/imagem/headline ou lota o board.
 */
export interface PinExistente {
  id: string;
  productId: string;
  boardId: string | null;
  quando: Date; // published_at ?? scheduled_at
  imageHash: string | null;
  headline: string | null;
  creativeId: string;
}

export interface RegrasRepeticao {
  maxPinsProdutoSemana: number;
  cooldownHoras: number;
  janelaDuplicacaoDias: number;
  limiteBoardDia: number;
  similaridadeVisualMax: number; // distância de Hamming ≤ isto = quase idêntica
  similaridadeHeadlineMax: number; // Jaccard ≥ isto = quase idêntica
  diaNoFuso: (d: Date) => string;
}

export interface Candidato {
  productId: string;
  boardId: string | null;
  quando: Date;
  imageHash: string | null;
  headline: string | null;
  creativeId: string;
}

export interface Conflito {
  codigo: "limite_produto" | "cooldown" | "board_dia" | "board_duplicado" | "imagem_repetida" | "headline_repetida";
  mensagem: string;
}

const H = 3_600_000;
const D = 86_400_000;

export function avaliarRepeticao(c: Candidato, pins: PinExistente[], r: RegrasRepeticao): Conflito[] {
  const out: Conflito[] = [];
  const t = c.quando.getTime();
  const doProduto = pins.filter((p) => p.productId === c.productId);

  const antes = doProduto.filter((p) => p.quando.getTime() <= t && p.quando.getTime() > t - 7 * D).length;
  const depois = doProduto.filter((p) => p.quando.getTime() >= t && p.quando.getTime() < t + 7 * D).length;
  if (Math.max(antes, depois) + 1 > r.maxPinsProdutoSemana) {
    out.push({ codigo: "limite_produto", mensagem: `Produto já tem ${Math.max(antes, depois)} Pin(s) numa janela de 7 dias (limite ${r.maxPinsProdutoSemana}).` });
  }

  if (r.cooldownHoras > 0) {
    const perto = doProduto
      .map((p) => Math.abs(p.quando.getTime() - t))
      .filter((d) => d < r.cooldownHoras * H)
      .sort((a, b) => a - b)[0];
    if (perto != null) {
      const faltam = Math.ceil((r.cooldownHoras * H - perto) / H);
      out.push({ codigo: "cooldown", mensagem: `Cooldown entre variantes do mesmo produto: faltam ~${faltam} h (regra: ${r.cooldownHoras} h).` });
    }
  }

  if (c.boardId) {
    const dia = r.diaNoFuso(c.quando);
    const noBoardDia = pins.filter((p) => p.boardId === c.boardId && r.diaNoFuso(p.quando) === dia).length;
    if (noBoardDia + 1 > r.limiteBoardDia) out.push({ codigo: "board_dia", mensagem: `Board já tem ${noBoardDia} Pin(s) neste dia (limite ${r.limiteBoardDia}).` });
    if (r.janelaDuplicacaoDias > 0 && doProduto.some((p) => p.boardId === c.boardId && Math.abs(p.quando.getTime() - t) < r.janelaDuplicacaoDias * D)) {
      out.push({ codigo: "board_duplicado", mensagem: `Mesmo produto no mesmo board há menos de ${r.janelaDuplicacaoDias} dias.` });
    }
  }

  const recentes = doProduto.filter((p) => p.creativeId !== c.creativeId && Math.abs(p.quando.getTime() - t) < Math.max(r.janelaDuplicacaoDias, 1) * D);
  if (c.imageHash && recentes.some((p) => p.imageHash && distanciaHash(p.imageHash, c.imageHash!) <= r.similaridadeVisualMax)) {
    out.push({ codigo: "imagem_repetida", mensagem: "Imagem quase idêntica a outro Pin recente do mesmo produto." });
  }
  if (c.headline && recentes.some((p) => p.headline && similaridade(p.headline, c.headline!) >= r.similaridadeHeadlineMax)) {
    out.push({ codigo: "headline_repetida", mensagem: "Headline quase idêntica a outro Pin recente do mesmo produto." });
  }
  return out;
}

/** Primeiro instante ≥ `desde` que respeita o cooldown do produto (para o agendamento automático). */
export function inicioAposCooldown(desde: Date, pinsDoProduto: { quando: Date }[], cooldownHoras: number): Date {
  if (cooldownHoras <= 0) return desde;
  let t = desde.getTime();
  const ordenados = pinsDoProduto.map((p) => p.quando.getTime()).sort((a, b) => a - b);
  for (let i = 0; i < 50; i++) {
    const conflito = ordenados.find((q) => Math.abs(q - t) < cooldownHoras * H);
    if (conflito == null) break;
    t = conflito + cooldownHoras * H;
  }
  return new Date(t);
}

/** Escolhe a próxima variante da piscina: diferente (tipo/cena) do último publicado e melhor qualidade. */
export function escolherVariante<T extends { id: string; visualType: string; sceneKey: string | null; qualidade: number | null; criadoEm: string }>(
  candidatas: T[],
  ultimosPublicados: { visualType: string; sceneKey: string | null }[],
): T | null {
  if (!candidatas.length) return null;
  const ult = ultimosPublicados[0];
  const pontuar = (v: T) => {
    let s = v.qualidade ?? 50;
    if (ult) {
      if (v.visualType !== ult.visualType) s += 30;
      if (v.sceneKey && v.sceneKey !== ult.sceneKey) s += 15;
    }
    // nunca publicada a mesma combinação tipo+cena ainda: bônus
    if (!ultimosPublicados.some((u) => u.visualType === v.visualType && u.sceneKey === v.sceneKey)) s += 10;
    return s;
  };
  return [...candidatas].sort((a, b) => pontuar(b) - pontuar(a) || a.criadoEm.localeCompare(b.criadoEm))[0] ?? null;
}
