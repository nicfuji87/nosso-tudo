import { describe, expect, it } from "vitest";
import { lerDesempenho, type Desempenho, type PinDesempenho } from "./desempenho";

const pin = (o: Partial<PinDesempenho>): PinDesempenho => ({
  id: Math.random().toString(36),
  external_pin_id: "1",
  titulo: "Pin",
  imagem: null,
  link: "https://meli.la/x",
  publicado_em: new Date().toISOString(),
  origem: "importado",
  board: "A",
  produto: null,
  impressoes: 0,
  saves: 0,
  cliques: 0,
  saidas: 0,
  ...o,
});
const base = (pins: PinDesempenho[], porBoard: Desempenho["por_board"]): Desempenho => ({
  dias: 30,
  totais: {
    pins: pins.length,
    impressoes: pins.reduce((a, p) => a + p.impressoes, 0),
    saves: pins.reduce((a, p) => a + p.saves, 0),
    cliques: pins.reduce((a, p) => a + p.cliques, 0),
    saidas: pins.reduce((a, p) => a + p.saidas, 0),
    pins_com_metrica: pins.filter((p) => p.impressoes > 0).length,
  },
  por_board: porBoard,
  pins,
});

describe("leituras do desempenho", () => {
  it("sem Pins ou sem métricas, diz isso", () => {
    expect(lerDesempenho(base([], []))[0]!.texto).toMatch(/Ainda não há Pins/);
    expect(lerDesempenho(base([pin({})], []))[0]!.texto).toMatch(/ainda não têm métricas/);
  });
  it("não elogia board com engajamento zero", () => {
    const pins = [pin({ board: "A", impressoes: 55 }), pin({ board: "B", impressoes: 49 })];
    const l = lerDesempenho(base(pins, [
      { board: "A", board_id: null, pins: 1, impressoes: 55, saves: 0, cliques: 0, saidas: 0 },
      { board: "B", board_id: null, pins: 1, impressoes: 49, saves: 0, cliques: 0, saidas: 0 },
    ]));
    expect(l.some((x) => x.texto.includes("engaja mais"))).toBe(false);
    expect(l.some((x) => x.texto.includes("Maior alcance"))).toBe(true);
  });
  it("aponta o board e o Pin que levam ao link", () => {
    const pins = [pin({ board: "A", impressoes: 100, saidas: 5, titulo: "Potes" }), pin({ board: "B", impressoes: 100, cliques: 1 })];
    const l = lerDesempenho(base(pins, [
      { board: "A", board_id: null, pins: 1, impressoes: 100, saves: 0, cliques: 0, saidas: 5 },
      { board: "B", board_id: null, pins: 1, impressoes: 100, saves: 0, cliques: 1, saidas: 0 },
    ]));
    expect(l.find((x) => x.texto.includes("engaja mais"))!.texto).toMatch(/^“A”/);
    expect(l.some((x) => x.texto.includes("“Potes”") && x.texto.includes("5 cliques no link"))).toBe(true);
  });
});
