import { describe, expect, it } from "vitest";
import { dentroDeJanela, proximoHorarioLivre, type RegrasPublicacao } from "./janelas";
import { deFusoParaUtc, formatarNoFuso, inicioDaSemana } from "../tempo";

const TZ = "America/Sao_Paulo";
const regras: RegrasPublicacao = {
  timezone: TZ,
  limiteDiario: 3,
  intervaloMinimoMin: 60,
  janelas: [{ dias: [], inicio: "09:00", fim: "21:00" }],
};
const brt = (iso: string) => formatarNoFuso(new Date(iso), TZ, { dateStyle: "short", timeStyle: "short" });

describe("deFusoParaUtc", () => {
  it("09:00 em São Paulo = 12:00 UTC", () => {
    expect(deFusoParaUtc(2026, 10, 2, 9, 0, TZ).toISOString()).toBe("2026-10-02T12:00:00.000Z");
  });
});

describe("proximoHorarioLivre", () => {
  it("antes da janela pula para a abertura", () => {
    const r = proximoHorarioLivre(regras, [], new Date("2026-10-02T09:00:00Z")); // 06:00 BRT
    expect(r!.toISOString()).toBe("2026-10-02T12:00:00.000Z");
  });

  it("respeita o intervalo mínimo entre publicações", () => {
    const ocupado = new Date("2026-10-02T12:00:00Z");
    const r = proximoHorarioLivre(regras, [ocupado], new Date("2026-10-02T12:10:00Z"));
    expect(r!.toISOString()).toBe("2026-10-02T13:00:00.000Z");
  });

  it("limite diário empurra para o dia seguinte", () => {
    const ocupados = ["12:00", "14:00", "16:00"].map((h) => new Date(`2026-10-02T${h}:00Z`));
    const r = proximoHorarioLivre(regras, ocupados, new Date("2026-10-02T17:00:00Z"));
    expect(brt(r!.toISOString())).toBe("03/10/2026, 09:00");
  });

  it("depois do fim da janela vai para o dia seguinte", () => {
    const r = proximoHorarioLivre(regras, [], new Date("2026-10-03T01:00:00Z")); // 22:00 BRT do dia 2
    expect(brt(r!.toISOString())).toBe("03/10/2026, 09:00");
  });

  it("respeita dias da semana da janela", () => {
    const soUteis = { ...regras, janelas: [{ dias: [1, 2, 3, 4, 5], inicio: "10:00", fim: "12:00" }] };
    // sábado 03/10/2026 → segunda 05/10 10:00
    const r = proximoHorarioLivre(soUteis, [], new Date("2026-10-03T15:00:00Z"));
    expect(brt(r!.toISOString())).toBe("05/10/2026, 10:00");
  });

  it("sem janelas ou limite zero não agenda", () => {
    expect(proximoHorarioLivre({ ...regras, janelas: [] }, [], new Date())).toBeNull();
    expect(proximoHorarioLivre({ ...regras, limiteDiario: 0 }, [], new Date())).toBeNull();
  });

  it("dentroDeJanela", () => {
    expect(dentroDeJanela(regras, new Date("2026-10-02T13:00:00Z"))).toBe(true);
    expect(dentroDeJanela(regras, new Date("2026-10-02T02:00:00Z"))).toBe(false);
  });
});

describe("inicioDaSemana", () => {
  it("segunda da semana", () => {
    expect(inicioDaSemana("2026-10-01")).toBe("2026-09-28");
    expect(inicioDaSemana("2026-10-04")).toBe("2026-09-28");
    expect(inicioDaSemana("2026-10-05")).toBe("2026-10-05");
  });
});
