import { describe, expect, it } from "vitest";
import { fidelidadeLiberaAprovacao, validarPacote, type EntradaPacote } from "./pacote";

const ok: EntradaPacote = {
  titulo: "Organize o box sem furar a parede",
  descricao: "Duas prateleiras adesivas que liberam o chão do box. Contém link de afiliado.",
  altText: "Banheiro claro com duas prateleiras pretas fixadas na parede do box",
  boardId: "b1",
  linkAfiliado: "https://mercadolivre.com/sec/abc123",
  redirectStatus: "ok",
  exigirLink: true,
  disclosure: "Contém link de afiliado.",
  exigirDisclosure: true,
  temImagemFinal: true,
};

describe("pacote Pinterest", () => {
  it("completo e válido → ready", () => {
    expect(validarPacote(ok)).toEqual({ status: "ready", erros: [] });
  });
  it("faltando campos → incomplete com lista", () => {
    const r = validarPacote({ ...ok, altText: "", boardId: null });
    expect(r.status).toBe("incomplete");
    expect(r.erros.map((e) => e.campo)).toEqual(["alt_text", "board_id"]);
  });
  it("sem disclosure ou link inconsistente → invalid", () => {
    expect(validarPacote({ ...ok, descricao: "Sem aviso" }).status).toBe("invalid");
    expect(validarPacote({ ...ok, redirectStatus: "inconsistent" }).status).toBe("invalid");
    expect(validarPacote({ ...ok, linkAfiliado: "https://amzn.to/x" }).status).toBe("invalid");
  });
  it("link não exigido não bloqueia", () => {
    expect(validarPacote({ ...ok, linkAfiliado: null, exigirLink: false }).status).toBe("ready");
  });
});

describe("fidelidade × aprovação", () => {
  const base = { modo: "reference_generation", imagemManualOuIa: false, exigirRevisao: true, automatico: false, nivelAutomacao: 1 };
  it("composição exata não exige checagem", () => {
    expect(fidelidadeLiberaAprovacao({ ...base, modo: "exact_composition", status: "not_required" }).ok).toBe(true);
  });
  it("geração por referência exige checagem antes da aprovação humana", () => {
    expect(fidelidadeLiberaAprovacao({ ...base, status: "pending" }).ok).toBe(false);
    expect(fidelidadeLiberaAprovacao({ ...base, status: "ok" }).ok).toBe(true);
    expect(fidelidadeLiberaAprovacao({ ...base, status: "failed" }).ok).toBe(false);
    expect(fidelidadeLiberaAprovacao({ ...base, status: "human_ok" }).ok).toBe(true);
  });
  it("automação no modo assistido não aceita só a IA", () => {
    expect(fidelidadeLiberaAprovacao({ ...base, status: "ok", automatico: true }).ok).toBe(false);
    expect(fidelidadeLiberaAprovacao({ ...base, status: "ok", automatico: true, nivelAutomacao: 3 }).ok).toBe(true);
    expect(fidelidadeLiberaAprovacao({ ...base, status: "human_ok", automatico: true }).ok).toBe(true);
  });
  it("imagem manual (ChatGPT) também exige checagem", () => {
    expect(fidelidadeLiberaAprovacao({ ...base, modo: "exact_composition", imagemManualOuIa: true, status: "pending" }).ok).toBe(false);
  });
});
