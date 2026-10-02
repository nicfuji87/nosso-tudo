import { describe, expect, it } from "vitest";
import { aplicarGuardrails, comDisclosure, problemasDeTexto, sanitizarTexto, similaridade } from "./guardrails";

describe("guardrails de copy", () => {
  it("remove promessas não sustentadas e preço", () => {
    const r = sanitizarTexto("O melhor do mundo por R$ 49,90 com frete grátis", { max: 100, permitirPreco: false });
    expect(r.texto).not.toMatch(/melhor do mundo/i);
    expect(r.texto).not.toMatch(/R\$/);
    expect(r.texto).not.toMatch(/frete/i);
    expect(r.alteracoes.length).toBe(3);
  });
  it("mantém preço quando permitido", () => {
    expect(sanitizarTexto("Só R$ 49,90", { max: 100, permitirPreco: true }).texto).toBe("Só R$ 49,90");
  });
  it("corta respeitando palavras", () => {
    const r = sanitizarTexto("uma frase bem comprida que passa do limite", { max: 20, permitirPreco: false });
    expect(r.texto.length).toBeLessThanOrEqual(20);
    expect(r.texto.endsWith("…")).toBe(true);
  });
  it("disclosure entra no fim e respeita o limite total", () => {
    const longa = "x ".repeat(500);
    const d = comDisclosure(longa, "Contém link de afiliado.");
    expect(d.length).toBeLessThanOrEqual(800);
    expect(d.endsWith("Contém link de afiliado.")).toBe(true);
    expect(comDisclosure("Texto. Contém link de afiliado.", "contém link de afiliado.")).toBe("Texto. Contém link de afiliado.");
  });
  it("aplicarGuardrails normaliza palavras-chave e garante título", () => {
    const r = aplicarGuardrails(
      { headline: "Cozinha organizada", titulo: "", descricao: "Desc", alt_text: "Foto", palavras_chave: ["Cozinha", "cozinha", " x ", "organização"] },
      { disclosure: "#publi", exigirDisclosure: true, permitirPreco: false },
    );
    expect(r.titulo).toBe("Cozinha organizada");
    expect(r.palavras_chave).toEqual(["cozinha", "organização"]);
    expect(r.descricao).toContain("#publi");
  });
  it("problemasDeTexto bloqueia sem disclosure", () => {
    expect(problemasDeTexto({ titulo: "T", descricao: "D", disclosure: "#publi", exigirDisclosure: true })).toEqual([
      "Descrição sem o aviso de link de afiliado (disclosure).",
    ]);
    expect(problemasDeTexto({ titulo: "T", descricao: "D #publi", disclosure: "#publi", exigirDisclosure: true })).toEqual([]);
  });
  it("similaridade", () => {
    expect(similaridade("Organize sua geladeira hoje", "organize a geladeira hoje")).toBeGreaterThan(0.6);
    expect(similaridade("Organize sua geladeira", "Luminária de mesa")).toBe(0);
  });
});
