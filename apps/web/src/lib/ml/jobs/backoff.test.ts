import { describe, expect, it } from "vitest";
import { calcularBackoffMs, decidirFalha } from "./backoff";

const meio = () => 0.5; // jitter zero

describe("backoff", () => {
  it("cresce exponencialmente a partir de 30s", () => {
    expect(calcularBackoffMs(1, null, meio)).toBe(30_000);
    expect(calcularBackoffMs(2, null, meio)).toBe(60_000);
    expect(calcularBackoffMs(4, null, meio)).toBe(240_000);
  });
  it("tem teto de 1h", () => {
    expect(calcularBackoffMs(20, null, meio)).toBe(3_600_000);
  });
  it("respeita Retry-After maior que o exponencial", () => {
    expect(calcularBackoffMs(1, 120_000, meio)).toBe(120_000);
    expect(calcularBackoffMs(3, 1_000, meio)).toBe(120_000);
  });
  it("jitter fica em ±20%", () => {
    expect(calcularBackoffMs(1, null, () => 0)).toBe(24_000);
    expect(calcularBackoffMs(1, null, () => 1)).toBe(36_000);
  });
});

describe("decidirFalha", () => {
  it("erro não retentável vai direto para dead-letter", () => {
    expect(decidirFalha({ tentativa: 1, maxTentativas: 5, retentavel: false })).toEqual({ acao: "dead" });
  });
  it("esgotou tentativas → dead", () => {
    expect(decidirFalha({ tentativa: 5, maxTentativas: 5, retentavel: true })).toEqual({ acao: "dead" });
  });
  it("retentável dentro do limite → retry", () => {
    expect(decidirFalha({ tentativa: 2, maxTentativas: 5, retentavel: true, aleatorio: meio })).toEqual({
      acao: "retry",
      emMs: 60_000,
    });
  });
});
