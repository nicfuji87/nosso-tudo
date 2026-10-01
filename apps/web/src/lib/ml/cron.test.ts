import { describe, expect, it } from "vitest";
import {
  type AgendaSimples,
  cronParaSimples,
  descreverCron,
  proximasExecucoes,
  simplesParaCron,
  validarCron,
} from "./cron";

describe("validarCron", () => {
  it("aceita expressões de 5 campos", () => {
    expect(validarCron("0 6 * * *", "America/Sao_Paulo").ok).toBe(true);
    expect(validarCron("*/15 * * * *").ok).toBe(true);
  });
  it("recusa campos a mais/menos e valores inválidos", () => {
    expect(validarCron("0 6 * *").ok).toBe(false);
    expect(validarCron("0 0 6 * * *").ok).toBe(false);
    expect(validarCron("61 6 * * *").ok).toBe(false);
    expect(validarCron("0 6 * * *", "Mars/Olympus").ok).toBe(false);
  });
});

describe("proximasExecucoes", () => {
  it("respeita o timezone (06:00 em São Paulo = 09:00 UTC)", () => {
    const desde = new Date("2026-10-01T12:00:00Z");
    const [a, b] = proximasExecucoes("0 6 * * *", "America/Sao_Paulo", 2, desde);
    expect(a!.toISOString()).toBe("2026-10-02T09:00:00.000Z");
    expect(b!.toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });
  it("devolve 5 execuções por padrão, em ordem", () => {
    const r = proximasExecucoes("*/15 * * * *", "UTC", undefined, new Date("2026-10-01T00:07:00Z"));
    expect(r).toHaveLength(5);
    expect(r[0]!.toISOString()).toBe("2026-10-01T00:15:00.000Z");
    expect(r[4]!.toISOString()).toBe("2026-10-01T01:15:00.000Z");
  });
  it("semanal na segunda", () => {
    const [a] = proximasExecucoes("30 6 * * 1", "America/Sao_Paulo", 1, new Date("2026-10-01T12:00:00Z"));
    // 01/10/2026 é quinta → próxima segunda 05/10 06:30 BRT = 09:30 UTC
    expect(a!.toISOString()).toBe("2026-10-05T09:30:00.000Z");
  });
});

describe("modo simples ↔ cron", () => {
  it("ida e volta", () => {
    const casos: AgendaSimples[] = [
      { tipo: "intervalo", minutos: 15 },
      { tipo: "horas", aCada: 1, minuto: 0 },
      { tipo: "horas", aCada: 6, minuto: 30 },
      { tipo: "diario", hora: 6, minuto: 0, dias: [] },
      { tipo: "diario", hora: 9, minuto: 5, dias: [1, 3, 5] },
      { tipo: "mensal", dia: 1, hora: 8, minuto: 0 },
    ];
    for (const c of casos) {
      expect(cronParaSimples(simplesParaCron(c))).toEqual(c);
    }
  });
  it("dias da semana são ordenados e deduplicados", () => {
    expect(simplesParaCron({ tipo: "diario", hora: 6, minuto: 0, dias: [5, 1, 1] })).toBe("0 6 * * 1,5");
  });
  it("cron complexo não cabe no modo simples", () => {
    expect(cronParaSimples("0 6-18/2 * * 1-5")).toBeNull();
    expect(cronParaSimples("0 6 1 1 *")).toBeNull();
  });
  it("descreve em português", () => {
    expect(descreverCron("0 6 * * *")).toBe("Diário às 06:00");
    expect(descreverCron("*/5 * * * *")).toBe("A cada 5 min");
    expect(descreverCron("30 6 * * 1")).toBe("seg às 06:30");
  });
});
