/** Leituras automáticas do desempenho (regras puras) — o que fazer no próximo Pin. */

export interface PinDesempenho {
  id: string;
  external_pin_id: string | null;
  titulo: string | null;
  imagem: string | null;
  link: string | null;
  publicado_em: string | null;
  origem: "app" | "importado";
  board: string | null;
  produto: string | null;
  impressoes: number;
  saves: number;
  cliques: number;
  saidas: number;
}

export interface BoardDesempenho {
  board: string;
  board_id: string | null;
  pins: number;
  impressoes: number;
  saves: number;
  cliques: number;
  saidas: number;
}

export interface Desempenho {
  dias: number;
  totais: { pins: number; impressoes: number | null; saves: number | null; cliques: number | null; saidas: number | null; pins_com_metrica: number };
  por_board: BoardDesempenho[];
  pins: PinDesempenho[];
}

export const taxa = (parte: number, total: number) => (total > 0 ? parte / total : 0);
export const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export interface Leitura {
  tipo: "positivo" | "atencao" | "info";
  texto: string;
}

/** Até 5 leituras objetivas, com número. Pouco dado → diz isso em vez de inventar tendência. */
export function lerDesempenho(d: Desempenho): Leitura[] {
  const out: Leitura[] = [];
  const imp = d.totais.impressoes ?? 0;
  if (!d.totais.pins) return [{ tipo: "info", texto: "Ainda não há Pins publicados. Crie o primeiro em Criar Pin." }];
  if (d.totais.pins_com_metrica === 0)
    return [{ tipo: "info", texto: "Os Pins ainda não têm métricas. O Pinterest leva até 48 h para consolidar; clique em “Atualizar dados” amanhã." }];

  // Engajamento = saves + cliques no Pin + cliques no link, sobre as impressões.
  const eng = (b: { saves: number; cliques: number; saidas: number }) => b.saves + b.cliques + b.saidas;
  const comVolume = d.por_board.filter((b) => b.impressoes >= 30);
  if (comVolume.length >= 2) {
    const melhor = [...comVolume].sort((a, b) => taxa(eng(b), b.impressoes) - taxa(eng(a), a.impressoes))[0]!;
    if (eng(melhor) > 0)
      out.push({ tipo: "positivo", texto: `“${melhor.board}” engaja mais: ${pct(taxa(eng(melhor), melhor.impressoes))} das impressões viram save ou clique (${melhor.pins} Pins). Bom lugar para o próximo Pin.` });
  }
  const topAlcance = [...d.pins].sort((a, b) => b.impressoes - a.impressoes)[0];
  if (topAlcance && topAlcance.impressoes > 0)
    out.push({ tipo: "info", texto: `Maior alcance: “${(topAlcance.titulo ?? "sem título").slice(0, 60)}” (${topAlcance.impressoes} impressões). O tema e o título dele estão sendo encontrados.` });
  const topSaida = d.pins.filter((p) => p.saidas > 0).sort((a, b) => b.saidas - a.saidas)[0];
  if (topSaida) out.push({ tipo: "positivo", texto: `O Pin que mais leva ao Mercado Livre é “${(topSaida.titulo ?? "sem título").slice(0, 60)}” (${topSaida.saidas} cliques no link). Faça variações do mesmo tema.` });
  const topSave = d.pins.filter((p) => p.saves > 0).sort((a, b) => b.saves - a.saves)[0];
  if (topSave && topSave.id !== topSaida?.id) out.push({ tipo: "info", texto: `“${(topSave.titulo ?? "sem título").slice(0, 60)}” é o mais salvo (${topSave.saves}). Saves espalham o Pin: vale repetir o estilo da imagem.` });
  const parados = d.pins.filter((p) => p.impressoes === 0 && p.publicado_em && Date.now() - new Date(p.publicado_em).getTime() > 7 * 86_400_000).length;
  if (parados >= 3) out.push({ tipo: "atencao", texto: `${parados} Pins com mais de 7 dias não tiveram nenhuma impressão. Títulos com a palavra-chave que as pessoas buscam ajudam a aparecer.` });
  const semLink = d.pins.filter((p) => !p.link).length;
  if (semLink >= 2) out.push({ tipo: "atencao", texto: `${semLink} Pins estão sem link — eles não geram clique para o Mercado Livre.` });
  if (imp > 0 && (d.totais.saidas ?? 0) === 0) out.push({ tipo: "atencao", texto: "Ainda nenhum clique no link. Teste títulos que prometam o benefício (ex.: “organiza a geladeira em 5 min”) e imagens do produto em uso." });
  if (!out.length) out.push({ tipo: "info", texto: "Ainda há pouco volume para tirar conclusões. Publique alguns Pins por semana em boards diferentes e compare." });
  return out.slice(0, 5);
}
