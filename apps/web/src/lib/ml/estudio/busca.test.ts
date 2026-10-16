import { describe, expect, it } from "vitest";
import { filtrarResultados, formatarVendidos, normalizarItem, normalizarResultados, numeroBr, termoDoTitulo } from "./busca";

const item = (o: Record<string, unknown> = {}) => ({
  eTituloProduto: "Kit 10 Potes Herméticos De Vidro 400ml 4 Travas",
  imagemLink: "https://http2.mlstatic.com/D_NQ_NP_696177-O.webp",
  zProdutoLink: "https://www.mercadolivre.com.br/kit/p/MLB72921856",
  novoPreco: "92,05",
  precoAnterior: "103,86",
  precoDiscount: "11% OFF",
  quantidadeVendida: 1000,
  freteGratis: true,
  idPublicacao: "MLB6943367456",
  idProdutoCatalogo: "MLB72921856",
  eCompraInternacional: false,
  lojaOficial: true,
  produtoReviews: 4.8,
  numeroAvaliacoes: 320,
  tipoResultado: "ORGANIC",
  ...o,
});

describe("estúdio — busca", () => {
  it("lê números no formato brasileiro", () => {
    expect(numeroBr("92,05")).toBe(92.05);
    expect(numeroBr("1.299,90")).toBe(1299.9);
    expect(numeroBr("103.86")).toBe(103.86);
    expect(numeroBr("11% OFF")).toBe(11);
    expect(numeroBr("")).toBeNull();
  });

  it("normaliza o item do actor", () => {
    const r = normalizarItem(item())!;
    expect(r).toMatchObject({ id: "MLB72921856", preco: 92.05, precoAnterior: 103.86, descontoPct: 11, vendidos: 1000, avaliacao: 4.8, freteGratis: true, lojaOficial: true, patrocinado: false });
    expect(normalizarItem(item({ imagemLink: "https://evil.com/a.jpg", zProdutoLink: "https://evil.com" }))).toMatchObject({ imagem: null, link: null });
    expect(normalizarItem(item({ idProdutoCatalogo: "", idPublicacao: "x" }))).toBeNull();
    expect(normalizarItem(item({ idProdutoCatalogo: "" }))!.id).toBe("MLB6943367456");
  });

  it("junta duplicados ficando com o que mais vendeu", () => {
    const l = normalizarResultados([item({ quantidadeVendida: 50 }), item({ quantidadeVendida: 5000 }), item({ idProdutoCatalogo: "MLB111111", quantidadeVendida: 10 })]);
    expect(l).toHaveLength(2);
    expect(l.find((x) => x.id === "MLB72921856")!.vendidos).toBe(5000);
  });

  it("filtra e ordena", () => {
    const l = normalizarResultados([
      item({ idProdutoCatalogo: "MLB1001", quantidadeVendida: 100000, novoPreco: "75,77", eTituloProduto: "Kit Pote Vidro 370ml" }),
      item({ idProdutoCatalogo: "MLB1002", quantidadeVendida: 25, eCompraInternacional: true, eTituloProduto: "Pote Fermentação Vidro" }),
      item({ idProdutoCatalogo: "MLB1003", quantidadeVendida: 5000, novoPreco: "150,00", lojaOficial: false, eTituloProduto: "Pote Plástico Hermético" }),
    ]);
    expect(filtrarResultados(l, {}).map((r) => r.id)).toEqual(["MLB1001", "MLB1003", "MLB1002"]);
    expect(filtrarResultados(l, { semInternacional: true, vendidosMin: 1000, precoMax: 100 }).map((r) => r.id)).toEqual(["MLB1001"]);
    expect(filtrarResultados(l, { incluir: ["vidro"], excluir: ["fermentacao"] }).map((r) => r.id)).toEqual(["MLB1001"]);
    expect(filtrarResultados(l, { lojaOficial: true, ordem: "menor_preco" }).map((r) => r.id)).toEqual(["MLB1001", "MLB1002"]);
  });

  it("monta o termo de busca a partir do título", () => {
    expect(termoDoTitulo("Kit 10 Potes De Vidro Hermético 640ml Freezer")).toBe("Potes Vidro Hermético Freezer");
    expect(formatarVendidos(100000)).toBe("+100 mil vendidos");
    expect(formatarVendidos(25)).toBe("+25 vendidos");
  });
});
