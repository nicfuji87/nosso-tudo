import { describe, expect, it } from "vitest";
import {
  assertTransicao,
  derivarStatusProduto,
  podeTransicionar,
  TransicaoInvalidaError,
  type SinaisDerivacao,
} from "./estados";

const vazio: SinaisDerivacao = {
  exigeLink: true,
  temLinkAtivo: false,
  pinsAgendados: 0,
  pinsPublicados: 0,
  criativosAprovadosSemPin: 0,
  criativosEmAndamento: 0,
};

describe("transições", () => {
  it("permite o fluxo feliz do produto", () => {
    const fluxo = [
      "discovered",
      "enriching",
      "analyzed",
      "approved",
      "waiting_affiliate_link",
      "ready_for_creative",
      "creative_draft",
      "ready_to_schedule",
      "scheduled",
      "published",
    ];
    for (let i = 1; i < fluxo.length; i++) {
      expect(podeTransicionar("product", fluxo[i - 1]!, fluxo[i]!)).toBe(true);
    }
  });

  it("bloqueia atalhos indevidos", () => {
    expect(podeTransicionar("product", "discovered", "published")).toBe(false);
    expect(podeTransicionar("product", "rejected", "approved")).toBe(false);
    expect(podeTransicionar("pin", "published", "scheduled")).toBe(false);
    expect(podeTransicionar("creative", "to_generate", "approved")).toBe(false);
    expect(() => assertTransicao("pin", "canceled", "published")).toThrow(TransicaoInvalidaError);
  });

  it("mesmo status é sempre permitido (idempotência)", () => {
    expect(podeTransicionar("pin", "published", "published")).toBe(true);
  });

  it("pin falho pode ser reprocessado; publicado é terminal", () => {
    expect(podeTransicionar("pin", "failed", "publishing")).toBe(true);
    expect(podeTransicionar("pin", "published", "canceled")).toBe(false);
  });
});

describe("derivarStatusProduto", () => {
  it("sem link obrigatório → aguardando link", () => {
    expect(derivarStatusProduto(vazio)).toBe("waiting_affiliate_link");
  });
  it("link presente e nada produzido → pronto p/ criativo", () => {
    expect(derivarStatusProduto({ ...vazio, temLinkAtivo: true })).toBe("ready_for_creative");
  });
  it("link não exigido não trava", () => {
    expect(derivarStatusProduto({ ...vazio, exigeLink: false })).toBe("ready_for_creative");
  });
  it("precedência: agendado > pronto p/ agendar > em produção > publicado", () => {
    const comLink = { ...vazio, temLinkAtivo: true };
    expect(derivarStatusProduto({ ...comLink, pinsAgendados: 1, criativosAprovadosSemPin: 2 })).toBe("scheduled");
    expect(derivarStatusProduto({ ...comLink, criativosAprovadosSemPin: 1, criativosEmAndamento: 1 })).toBe("ready_to_schedule");
    expect(derivarStatusProduto({ ...comLink, criativosEmAndamento: 1, pinsPublicados: 3 })).toBe("creative_draft");
    expect(derivarStatusProduto({ ...comLink, pinsPublicados: 3 })).toBe("published");
  });
  it("link removido volta a travar mesmo com Pins publicados", () => {
    expect(derivarStatusProduto({ ...vazio, pinsPublicados: 2 })).toBe("waiting_affiliate_link");
  });
});
