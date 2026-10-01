import { describe, expect, it } from "vitest";
import { validarLinkAfiliado } from "./validacao";
import { descontoPct, tendenciasQueCasam } from "../scoring/sinais";

describe("validarLinkAfiliado", () => {
  it("aceita o link curto oficial", () => {
    const r = validarLinkAfiliado("https://mercadolivre.com/sec/2ab3XyZ");
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe("curto_oficial");
  });
  it("extrai a URL de texto colado e completa o protocolo", () => {
    const r = validarLinkAfiliado("Olha esse: mercadolivre.com/sec/1a2b3c obrigado");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://mercadolivre.com/sec/1a2b3c");
  });
  it("aceita meli.la e URL com rastreio", () => {
    expect(validarLinkAfiliado("https://meli.la/abc123").tipo).toBe("curto");
    expect(validarLinkAfiliado("https://www.mercadolivre.com.br/p/MLB123?matt_tool=1234&matt_word=x").tipo).toBe("rastreado");
  });
  it("recusa domínio de fora", () => {
    const r = validarLinkAfiliado("https://amzn.to/xyz");
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/Domínio não reconhecido/);
  });
  it("recusa host parecido (sufixo malicioso)", () => {
    expect(validarLinkAfiliado("https://mercadolivre.com.evil.io/sec/abc").ok).toBe(false);
  });
  it("recusa colar o próprio link original do produto", () => {
    const original = "https://www.mercadolivre.com.br/p/MLB19698466";
    const r = validarLinkAfiliado(`${original}?foo=bar`, { urlOriginal: original });
    expect(r.ok).toBe(false);
  });
  it("URL simples sem rastreio passa com aviso", () => {
    const r = validarLinkAfiliado("https://produto.mercadolivre.com.br/MLB-123-x");
    expect(r.ok).toBe(true);
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  it("vazio e lixo", () => {
    expect(validarLinkAfiliado("   ").ok).toBe(false);
    expect(validarLinkAfiliado("não é link").ok).toBe(false);
  });
});

describe("sinais", () => {
  it("tendência casa por todos os termos, tolerando plural e acento", () => {
    const titulo = "Kit 6 Organizadores De Geladeira Acrílico Transparente";
    expect(tendenciasQueCasam(titulo, ["organizador geladeira", "airfryer", "geladeira"])).toEqual([
      "organizador geladeira",
      "geladeira",
    ]);
    expect(tendenciasQueCasam("Cafeteira Elétrica", ["cafe"])).toEqual([]); // 1 termo curto ignorado
  });
  it("desconto", () => {
    expect(descontoPct(75, 100)).toBe(25);
    expect(descontoPct(100, 90)).toBe(0);
    expect(descontoPct(null, 100)).toBeNull();
  });
});
