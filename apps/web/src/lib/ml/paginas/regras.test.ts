import { describe, expect, it } from "vitest";
import { destaquesDosAtributos, ehUrlPagina, extrairIdMl, extrairIdsMl, gerarSlug, imagemPermitida, slugValido, tituloDoLink, urlPagina } from "./regras";

describe("páginas de produto — regras", () => {
  it("gera slug legível, sem acento e com sufixo", () => {
    const s = gerarSlug("Kit 10 Potes de Vidro Hermético 640ml — Marmita Fitness!", "a7k2");
    expect(s).toBe("kit-10-potes-de-vidro-hermetico-640ml-marmita-fitness-a7k2");
    expect(slugValido(s)).toBe(true);
    expect(gerarSlug("!!!", "zz")).toBe("achado-zz");
    expect(gerarSlug("a".repeat(200), "q1").length).toBeLessThanOrEqual(90);
  });

  it("extrai o ID de catálogo, item e user product", () => {
    expect(extrairIdMl("https://www.mercadolivre.com.br/p/MLB63904966")).toEqual({ id: "MLB63904966", tipo: "PRODUCT" });
    expect(extrairIdMl("https://www.mercadolivre.com.br/kit-potes/p/MLB63904966?pdp_filters=x")).toEqual({ id: "MLB63904966", tipo: "PRODUCT" });
    expect(extrairIdMl("https://produto.mercadolivre.com.br/MLB-3456789012-kit-potes-_JM")).toEqual({ id: "MLB3456789012", tipo: "ITEM" });
    expect(extrairIdMl("https://www.mercadolivre.com.br/p/MLB1?wid=MLB3456789012")).toEqual({ id: "MLB3456789012", tipo: "ITEM" });
    expect(extrairIdMl("https://www.mercadolivre.com.br/up/MLBU123456789")).toEqual({ id: "MLBU123456789", tipo: "USER_PRODUCT" });
  });

  it("link curto e vitrine de afiliado não têm ID", () => {
    expect(extrairIdMl("https://meli.la/1qgTR1J")).toBeNull();
    expect(extrairIdMl("https://www.mercadolivre.com.br/social/nicolasfujimoto?matt_tool=1")).toBeNull();
    expect(extrairIdMl("lixo")).toBeNull();
  });

  it("destaques vêm dos atributos úteis, sem valores vazios", () => {
    const d = destaquesDosAtributos([
      { name: "Marca", value: "Starhouse" },
      { name: "Material", value: "Vidro" },
      { name: "Cor", value: "Não aplica" },
      { name: "Capacidade", value: "640 mL" },
      { name: "Quantidade de unidades", value: "10" },
      { name: "Cor principal", value: "Azul" },
      { name: "Cor", value: "Azul-escuro" },
    ]);
    expect(d).toEqual(["Material: Vidro", "Cor principal: Azul", "Quantidade de unidades: 10", "Capacidade: 640 mL"]);
  });

  it("imagem só de host conhecido e https", () => {
    expect(imagemPermitida("https://http2.mlstatic.com/D_NQ_NP_1.webp")).toBe(true);
    expect(imagemPermitida("http://http2.mlstatic.com/a.jpg")).toBe(false);
    expect(imagemPermitida("https://evil.com/mlstatic.com.jpg")).toBe(false);
    expect(imagemPermitida("https://x.supabase.co/storage/v1/object/public/ml-media/a.png", ["x.supabase.co"])).toBe(true);
  });

  it("reconhece só as nossas URLs de página", () => {
    const base = "https://nossotudo.com.br";
    const u = urlPagina(base + "/", "kit-potes-a7k2");
    expect(u).toBe("https://nossotudo.com.br/achados/kit-potes-a7k2");
    expect(ehUrlPagina(u, base)).toBe(true);
    expect(ehUrlPagina("https://outro.com/achados/kit-potes-a7k2", base)).toBe(false);
    expect(ehUrlPagina("https://nossotudo.com.br/achados/../app", base)).toBe(false);
  });

  it("extrai todos os IDs e o título de um link de user product", () => {
    const u =
      "https://www.mercadolivre.com.br/kit-5-conjunto-acessorios-suporte-banheiro-lavabo-inox-304/up/MLBU3398761105?pdp_filters=item_id%3AMLB5664882512&matt_tool_id=1#polycard_client=x&wid=MLB5664882512&sid=recos";
    expect(extrairIdsMl(u)).toEqual({ catalogo: null, usuario: "MLBU3398761105", anuncios: ["MLB5664882512"] });
    expect(tituloDoLink(u)).toBe("kit 5 conjunto acessorios suporte banheiro lavabo inox 304");
    expect(tituloDoLink("https://produto.mercadolivre.com.br/MLB-3456789012-kit-potes-vidro-_JM")).toBe("kit potes vidro");
    expect(extrairIdsMl("https://www.mercadolivre.com.br/x/p/MLB63904966").catalogo).toBe("MLB63904966");
  });
});
