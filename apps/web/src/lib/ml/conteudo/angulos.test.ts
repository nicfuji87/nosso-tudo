import { describe, expect, it } from "vitest";
import { angulosPorRegra, copyPorTemplate, nomeCurto, nomeGancho, type DadosProdutoConteudo } from "./angulos";

const produto: DadosProdutoConteudo = {
  titulo: "Kit 6 Organizadores De Geladeira Acrílico Transparente (MLB123)",
  categoria: ["Casa, Móveis e Decoração", "Cozinha", "Organizadores"],
  atributos: [
    { name: "Material", value: "Acrílico" },
    { name: "GTIN", value: "7891234567890" },
    { name: "Quantidade", value: "6" },
  ],
  marca: "OrganizaJá",
  preco: 89.9,
  rating: 4.7,
  avaliacoes: 1520,
  descricao: null,
};

describe("ângulos por regra", () => {
  it("prioriza organização para organizadores e não repete tipos", () => {
    const a = angulosPorRegra(produto, 4);
    expect(a).toHaveLength(4);
    expect(a[0]!.type).toBe("organizacao");
    expect(new Set(a.map((x) => x.type)).size).toBe(4);
  });
  it("nomeCurto tira códigos e parênteses", () => {
    expect(nomeCurto(produto.titulo)).toBe("Kit 6 Organizadores De Geladeira");
  });
  it("nomeGancho tira kit/quantidade e fica curto", () => {
    expect(nomeGancho(produto.titulo)).toBe("organizadores de geladeira acrílico");
    expect(nomeGancho("Luminária De Mesa Led Articulada 10w")).toBe("luminária de mesa led");
  });
  it("título não repete o nome quando o gancho já o contém", () => {
    const [a] = angulosPorRegra(produto, 1);
    const c = copyPorTemplate(produto, a!, "Veja");
    expect(c.titulo).toBe(`${a!.hook} | OrganizaJá`);
  });
});

describe("copy por template", () => {
  it("usa só fatos do anúncio e ignora GTIN", () => {
    const c = copyPorTemplate(produto, { type: "organizacao", hook: "Organização fácil", keyword: "organizador" }, "Veja no Mercado Livre");
    expect(c.descricao).toContain("Material: Acrílico");
    expect(c.descricao).not.toContain("7891234567890");
    expect(c.descricao).toContain("1.520 avaliações");
    expect(c.titulo.length).toBeLessThanOrEqual(100);
  });
  it("não cita avaliações quando são poucas", () => {
    const c = copyPorTemplate({ ...produto, avaliacoes: 3 }, { type: "dica_pratica", hook: "Dica" }, "Confira");
    expect(c.descricao).not.toMatch(/avaliações/);
  });
});
