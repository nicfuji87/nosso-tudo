import { describe, expect, it } from "vitest";
import { avaliarRepeticao, escolherVariante, inicioAposCooldown, type PinExistente, type RegrasRepeticao } from "./repeticao";

const regras: RegrasRepeticao = {
  maxPinsProdutoSemana: 2,
  cooldownHoras: 72,
  janelaDuplicacaoDias: 30,
  limiteBoardDia: 3,
  similaridadeVisualMax: 6,
  similaridadeHeadlineMax: 0.85,
  diaNoFuso: (d) => d.toISOString().slice(0, 10),
};
const t0 = new Date("2026-10-10T12:00:00Z");
const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);
const pin = (o: Partial<PinExistente>): PinExistente => ({
  id: Math.random().toString(36),
  productId: "p1",
  boardId: "b1",
  quando: t0,
  imageHash: "0000000000000000",
  headline: "Organize o box sem reforma",
  creativeId: "c-outro",
  ...o,
});
const cand = { productId: "p1", boardId: "b2", quando: t0, imageHash: "ffffffffffffffff", headline: "Ganhe espaço no banheiro", creativeId: "c1" };

describe("anti-repetição", () => {
  it("sem pins anteriores não há conflito", () => {
    expect(avaliarRepeticao(cand, [], regras)).toEqual([]);
  });
  it("cooldown entre variantes do mesmo produto", () => {
    const r = avaliarRepeticao(cand, [pin({ quando: h(-24), boardId: "b9" })], regras);
    expect(r.map((x) => x.codigo)).toContain("cooldown");
    expect(r.find((x) => x.codigo === "cooldown")!.mensagem).toMatch(/48 h/);
  });
  it("limite por produto em 7 dias", () => {
    const pins = [pin({ quando: h(-100), boardId: "b8" }), pin({ quando: h(-160), boardId: "b7" })];
    expect(avaliarRepeticao(cand, pins, { ...regras, cooldownHoras: 0 }).map((x) => x.codigo)).toContain("limite_produto");
  });
  it("limite do board no dia (inclui outros produtos)", () => {
    const pins = [1, 2, 3].map((i) => pin({ productId: `px${i}`, boardId: "b2", quando: h(-i) }));
    expect(avaliarRepeticao(cand, pins, regras).map((x) => x.codigo)).toEqual(["board_dia"]);
  });
  it("imagem e headline quase idênticas", () => {
    const pins = [pin({ quando: h(-24 * 20), boardId: "b5", imageHash: "fffffffffffffffe", headline: "Ganhe espaço no banheiro" })];
    const cods = avaliarRepeticao(cand, pins, { ...regras, cooldownHoras: 0 }).map((x) => x.codigo);
    expect(cods).toEqual(expect.arrayContaining(["imagem_repetida", "headline_repetida"]));
  });
  it("inicioAposCooldown empurra para depois do último Pin do produto", () => {
    expect(inicioAposCooldown(t0, [{ quando: h(-10) }], 72).toISOString()).toBe(h(62).toISOString());
    expect(inicioAposCooldown(t0, [], 72).toISOString()).toBe(t0.toISOString());
  });
  it("escolherVariante prefere tipo/cena diferentes do último publicado", () => {
    const vs = [
      { id: "a", visualType: "lifestyle_no_text", sceneKey: "banheiro_claro", qualidade: 90, criadoEm: "1" },
      { id: "b", visualType: "editorial", sceneKey: "banheiro_escuro", qualidade: 70, criadoEm: "2" },
    ];
    expect(escolherVariante(vs, [{ visualType: "lifestyle_no_text", sceneKey: "banheiro_claro" }])!.id).toBe("b");
    expect(escolherVariante(vs, [])!.id).toBe("a");
    expect(escolherVariante([], [])).toBeNull();
  });
});
