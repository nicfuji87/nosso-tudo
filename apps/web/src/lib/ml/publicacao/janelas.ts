import { deFusoParaUtc, diaNoFuso, hhmmParaMinutos, partesNoFuso } from "../tempo";

/**
 * Distribuição de publicações nas janelas permitidas (spec §13/§15: limite
 * diário, intervalo mínimo, janelas). Função pura — testada em janelas.test.ts.
 */

export interface Janela {
  dias: number[]; // 0=dom..6=sáb; vazio = todos
  inicio: string; // "09:00"
  fim: string; // "21:00"
}

export interface RegrasPublicacao {
  timezone: string;
  limiteDiario: number;
  intervaloMinimoMin: number;
  janelas: Janela[];
}

/**
 * Próximo horário livre ≥ `desde`, respeitando janelas, limite diário (no fuso)
 * e intervalo mínimo em relação a `ocupados` (agendados/publicados).
 * Retorna null se nada couber em `horizonteDias`.
 */
export function proximoHorarioLivre(
  regras: RegrasPublicacao,
  ocupados: Date[],
  desde: Date,
  horizonteDias = 30,
): Date | null {
  if (regras.limiteDiario <= 0 || regras.janelas.length === 0) return null;
  const passoMin = Math.max(5, Math.min(regras.intervaloMinimoMin || 5, 60));
  const intervaloMs = Math.max(0, regras.intervaloMinimoMin) * 60_000;
  const ord = [...ocupados].sort((a, b) => a.getTime() - b.getTime());

  const porDia = new Map<string, number>();
  for (const o of ord) {
    const k = diaNoFuso(o, regras.timezone);
    porDia.set(k, (porDia.get(k) ?? 0) + 1);
  }

  // arredonda para cima ao próximo minuto
  let cursor = new Date(Math.ceil(desde.getTime() / 60_000) * 60_000);
  const limite = desde.getTime() + horizonteDias * 86_400_000;

  while (cursor.getTime() <= limite) {
    const p = partesNoFuso(cursor, regras.timezone);
    const diaKey = diaNoFuso(cursor, regras.timezone);
    const minutoDia = p.hora * 60 + p.minuto;

    if ((porDia.get(diaKey) ?? 0) >= regras.limiteDiario) {
      cursor = inicioDoProximoDia(p, regras.timezone);
      continue;
    }

    const janelasHoje = regras.janelas
      .filter((j) => j.dias.length === 0 || j.dias.includes(p.diaSemana))
      .map((j) => ({ ini: hhmmParaMinutos(j.inicio), fim: hhmmParaMinutos(j.fim) }))
      .filter((j) => j.fim > j.ini)
      .sort((a, b) => a.ini - b.ini);

    const dentro = janelasHoje.find((j) => minutoDia >= j.ini && minutoDia < j.fim);
    if (!dentro) {
      const proxima = janelasHoje.find((j) => j.ini > minutoDia);
      cursor = proxima
        ? deFusoParaUtc(p.ano, p.mes, p.dia, Math.floor(proxima.ini / 60), proxima.ini % 60, regras.timezone)
        : inicioDoProximoDia(p, regras.timezone);
      continue;
    }

    const conflito = ord.find((o) => Math.abs(o.getTime() - cursor.getTime()) < intervaloMs);
    if (conflito) {
      const fimConflito = conflito.getTime() + intervaloMs;
      cursor = new Date(fimConflito > cursor.getTime() ? fimConflito : cursor.getTime() + passoMin * 60_000);
      continue;
    }
    return cursor;
  }
  return null;
}

function inicioDoProximoDia(p: { ano: number; mes: number; dia: number }, tz: string): Date {
  const amanha = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + 1));
  return deFusoParaUtc(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), 0, 0, tz);
}

/** Está dentro de alguma janela? (para "publicar agora" respeitar janelas quando exigido) */
export function dentroDeJanela(regras: RegrasPublicacao, quando: Date): boolean {
  const p = partesNoFuso(quando, regras.timezone);
  const m = p.hora * 60 + p.minuto;
  return regras.janelas.some(
    (j) =>
      (j.dias.length === 0 || j.dias.includes(p.diaSemana)) &&
      m >= hhmmParaMinutos(j.inicio) &&
      m < hhmmParaMinutos(j.fim),
  );
}
