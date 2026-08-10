import { afterEach, describe, expect, it, vi } from "vitest";
import { resolverMes } from "./periodo";

/**
 * `resolverMes` lê "hoje" de `hojeISO()` (America/Sao_Paulo). Fixamos o relógio
 * às 18h UTC para que o fuso de São Paulo (UTC-3) ainda esteja no mesmo dia.
 */
function fixarHoje(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T18:00:00Z`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("resolverMes", () => {
  it("sem parâmetro, cai no mês corrente e não oferece próximo", () => {
    fixarHoje("2026-08-10");
    const mes = resolverMes(undefined);
    expect(mes.param).toBe("2026-08");
    expect(mes.mesRef).toBe("2026-08-01");
    expect(mes.label).toBe("Agosto de 2026");
    expect(mes.ehMesAtual).toBe(true);
    expect(mes.anterior).toBe("2026-07");
    expect(mes.proximo).toBeNull();
  });

  it("no mês corrente, compara com o mesmo trecho do mês passado", () => {
    fixarHoje("2026-08-10");
    const mes = resolverMes(undefined);
    expect(mes.inicio).toBe("2026-08-01");
    expect(mes.fim).toBe("2026-08-11"); // exclusivo, inclui hoje
    expect(mes.compInicio).toBe("2026-07-01");
    expect(mes.compFim).toBe("2026-07-11");
    expect(mes.rotuloAnterior).toBe("No mês passado, até o dia 10");
  });

  it("mês fechado usa a janela de calendário cheia", () => {
    fixarHoje("2026-08-10");
    const mes = resolverMes("2026-06");
    expect(mes.ehMesAtual).toBe(false);
    expect(mes.inicio).toBe("2026-06-01");
    expect(mes.fim).toBe("2026-07-01");
    expect(mes.fimMes).toBe("2026-07-01");
    expect(mes.compInicio).toBe("2026-05-01");
    expect(mes.compFim).toBe("2026-06-01");
    expect(mes.proximo).toBe("2026-07");
    expect(mes.titulo).toBe("Mês × anterior");
  });

  it("atravessa a virada de ano nos dois sentidos", () => {
    fixarHoje("2026-08-10");
    expect(resolverMes("2026-01").anterior).toBe("2025-12");
    expect(resolverMes("2025-12").proximo).toBe("2026-01");
    expect(resolverMes("2025-12").fimMes).toBe("2026-01-01");
  });

  it("mês no futuro ou malformado volta para o corrente", () => {
    fixarHoje("2026-08-10");
    expect(resolverMes("2026-12").param).toBe("2026-08");
    expect(resolverMes("2026-13").param).toBe("2026-08");
    expect(resolverMes("agosto").param).toBe("2026-08");
    expect(resolverMes("2026-8").param).toBe("2026-08");
    expect(resolverMes("").param).toBe("2026-08");
  });

  it("no dia 31, o corte do mês passado não vaza para o mês corrente", () => {
    fixarHoje("2026-08-31");
    const mes = resolverMes(undefined);
    // 31/07 + 1 = 01/08, que é o início do mês atual — o clamp segura aí.
    expect(mes.compFim).toBe("2026-08-01");
    expect(mes.compFim <= mes.inicio).toBe(true);
  });
});
