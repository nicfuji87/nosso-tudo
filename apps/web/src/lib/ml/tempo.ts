/**
 * Utilitários de fuso horário sem dependência: a Vercel roda em UTC e o painel
 * mostra tudo no timezone configurado (spec §25).
 */

export interface PartesData {
  ano: number;
  mes: number; // 1–12
  dia: number;
  hora: number;
  minuto: number;
  diaSemana: number; // 0=dom
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partesNoFuso(data: Date, tz: string): PartesData {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(data)) p[part.type] = part.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: DOW[p.weekday ?? "Sun"] ?? 0,
  };
}

/** Offset (ms) do fuso em relação ao UTC naquele instante. */
function offsetMs(data: Date, tz: string): number {
  const p = partesNoFuso(data, tz);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  const semSegundos = Math.floor(data.getTime() / 60000) * 60000;
  return comoUtc - semSegundos;
}

/** Converte "hora de parede" no fuso para o instante UTC correspondente. */
export function deFusoParaUtc(ano: number, mes: number, dia: number, hora: number, minuto: number, tz: string): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let off = offsetMs(new Date(palpite), tz);
  let utc = palpite - off;
  // Segunda passada resolve virada de horário de verão.
  const off2 = offsetMs(new Date(utc), tz);
  if (off2 !== off) {
    off = off2;
    utc = palpite - off;
  }
  return new Date(utc);
}

export function formatarNoFuso(
  data: Date | string | null | undefined,
  tz: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  if (!data) return "—";
  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts }).format(d);
}

/** "YYYY-MM-DD" do dia no fuso. */
export function diaNoFuso(data: Date, tz: string): string {
  const p = partesNoFuso(data, tz);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** "HH:MM" → minutos desde 00:00. */
export function hhmmParaMinutos(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Horário inválido: ${hhmm}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Horário inválido: ${hhmm}`);
  return h * 60 + mi;
}

/** Segunda-feira (UTC date) da semana ISO de uma data "YYYY-MM-DD". */
export function inicioDaSemana(diaIso: string): string {
  const d = new Date(`${diaIso}T00:00:00Z`);
  const dow = d.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
