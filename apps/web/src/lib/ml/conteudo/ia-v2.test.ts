import { describe, expect, it } from "vitest";
import { statusFidelidade, type FidelidadeIA } from "./ia-v2";

const tudoOk: FidelidadeIA = {
  quantidade_ok: true,
  cor_acabamento_ok: true,
  geometria_ok: true,
  instalacao_ok: true,
  sem_acessorios_extras: true,
  sem_texto_preco_claim: true,
  funcoes_ok: true,
  escala_ok: true,
  score: 90,
  problemas: [],
  resumo: "Fiel",
};

describe("statusFidelidade", () => {
  it("tudo ok e score alto → ok", () => expect(statusFidelidade(tudoOk)).toBe("ok"));
  it("score alto mas 1 item falho → warning", () => expect(statusFidelidade({ ...tudoOk, geometria_ok: false })).toBe("warning"));
  it("quantidade errada + estrutura errada → failed", () =>
    expect(statusFidelidade({ ...tudoOk, quantidade_ok: false, geometria_ok: false })).toBe("failed"));
  it("score baixo → failed mesmo com itens ok", () => expect(statusFidelidade({ ...tudoOk, score: 40 })).toBe("failed"));
});
