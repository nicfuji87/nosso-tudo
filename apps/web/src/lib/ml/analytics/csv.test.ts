import { describe, expect, it } from "vitest";
import { dataIso, numeroBr, parseCsvComissoes } from "./csv";

describe("csv de comissões", () => {
  it("lê CSV com ; e valores em BRL", () => {
    const csv = "Data;Produto;Cliques;Vendas;Valor vendido;Comissão\n01/10/2026;https://produto.mercadolivre.com.br/MLB-123456789-x;40;2;R$ 1.299,80;R$ 64,99";
    const r = parseCsvComissoes(csv);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-01", codigo_ml: "MLB123456789", cliques: 40, pedidos: 2, gmv: 1299.8, comissao: 64.99 });
    expect(r.linhas[0]!.referencia).toMatch(/^csv:/);
  });
  it("aceita período e separador vírgula com aspas", () => {
    const csv = 'inicio,fim,comissao,id do pedido\n2026-09-01,2026-09-30,"1,234.50",PED-9';
    const r = parseCsvComissoes(csv);
    expect(r.linhas[0]).toMatchObject({ inicio: "2026-09-01", fim: "2026-09-30", comissao: 1234.5, referencia: "PED-9" });
  });
  it("referência sintética é estável (reimportar não duplica)", () => {
    const csv = "data;comissao\n01/10/2026;10,00";
    expect(parseCsvComissoes(csv).linhas[0]!.referencia).toBe(parseCsvComissoes(csv).linhas[0]!.referencia);
  });
  it("reporta linhas inválidas e cabeçalho sem comissão", () => {
    expect(parseCsvComissoes("data;valor\n01/10/2026;10").erros[0]).toMatch(/comissão/);
    const r = parseCsvComissoes("data;comissao\nontem;10\n02/10/2026;5");
    expect(r.linhas).toHaveLength(1);
    expect(r.erros).toHaveLength(1);
  });
  it("helpers", () => {
    expect(numeroBr("R$ 10,5")).toBe(10.5);
    expect(numeroBr("")).toBeNull();
    expect(dataIso("5/3/2026")).toBe("2026-03-05");
  });
});
