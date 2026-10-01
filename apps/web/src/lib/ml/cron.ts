import { CronExpressionParser } from "cron-parser";

/**
 * Agendamento: expressão cron (5 campos) + timezone IANA. O modo simples da UI
 * é só uma forma amigável de gerar/ler a expressão — o banco guarda o cron.
 */

export const TIMEZONES_SUGERIDOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Cuiaba",
  "America/Noronha",
  "UTC",
] as const;

export function timezoneValido(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface CronValidacao {
  ok: boolean;
  erro?: string;
}

export function validarCron(expr: string, tz = "UTC"): CronValidacao {
  const limpo = expr.trim();
  if (limpo.split(/\s+/).length !== 5) {
    return { ok: false, erro: "Use 5 campos: minuto hora dia-do-mês mês dia-da-semana." };
  }
  if (!timezoneValido(tz)) return { ok: false, erro: `Timezone inválido: ${tz}` };
  try {
    CronExpressionParser.parse(limpo, { tz, strict: false });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Expressão inválida." };
  }
}

/** Próximas `n` execuções a partir de `desde` (exclusivo). */
export function proximasExecucoes(expr: string, tz: string, n = 5, desde: Date = new Date()): Date[] {
  const it = CronExpressionParser.parse(expr.trim(), { tz, currentDate: desde, strict: false });
  const out: Date[] = [];
  for (let i = 0; i < n; i++) out.push(it.next().toDate());
  return out;
}

export function proximaExecucao(expr: string, tz: string, desde: Date = new Date()): Date {
  return proximasExecucoes(expr, tz, 1, desde)[0]!;
}

// ---------------------------------------------------------------------------
// Modo simples
// ---------------------------------------------------------------------------

export type AgendaSimples =
  | { tipo: "intervalo"; minutos: 5 | 10 | 15 | 20 | 30 }
  | { tipo: "horas"; aCada: 1 | 2 | 3 | 4 | 6 | 8 | 12; minuto: number }
  | { tipo: "diario"; hora: number; minuto: number; dias: number[] } // dias 0=dom..6=sáb; vazio = todos
  | { tipo: "mensal"; dia: number; hora: number; minuto: number };

const pad = (n: number) => String(n);

export function simplesParaCron(a: AgendaSimples): string {
  switch (a.tipo) {
    case "intervalo":
      return `*/${a.minutos} * * * *`;
    case "horas":
      return `${pad(a.minuto)} ${a.aCada === 1 ? "*" : `*/${a.aCada}`} * * *`;
    case "diario": {
      const dias = [...new Set(a.dias)].filter((d) => d >= 0 && d <= 6).sort((x, y) => x - y);
      const dow = dias.length === 0 || dias.length === 7 ? "*" : dias.join(",");
      return `${pad(a.minuto)} ${pad(a.hora)} * * ${dow}`;
    }
    case "mensal":
      return `${pad(a.minuto)} ${pad(a.hora)} ${pad(a.dia)} * *`;
  }
}

const INT = /^\d+$/;

/** Tenta ler um cron como agenda simples; null = só cabe no modo avançado. */
export function cronParaSimples(expr: string): AgendaSimples | null {
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const [min, hora, dom, mes, dow] = p as [string, string, string, string, string];
  if (mes !== "*") return null;

  const intervalo = /^\*\/(\d+)$/.exec(min);
  if (intervalo && hora === "*" && dom === "*" && dow === "*") {
    const m = Number(intervalo[1]);
    if ([5, 10, 15, 20, 30].includes(m)) return { tipo: "intervalo", minutos: m as 5 };
    return null;
  }
  if (!INT.test(min)) return null;
  const minuto = Number(min);

  if (dom === "*" && dow === "*") {
    if (hora === "*") return { tipo: "horas", aCada: 1, minuto };
    const cada = /^\*\/(\d+)$/.exec(hora);
    if (cada) {
      const h = Number(cada[1]);
      if ([2, 3, 4, 6, 8, 12].includes(h)) return { tipo: "horas", aCada: h as 2, minuto };
      return null;
    }
  }
  if (!INT.test(hora)) return null;
  const h = Number(hora);

  if (dom === "*") {
    if (dow === "*") return { tipo: "diario", hora: h, minuto, dias: [] };
    if (/^\d(,\d)*$/.test(dow)) {
      return { tipo: "diario", hora: h, minuto, dias: dow.split(",").map((d) => Number(d) % 7) };
    }
    return null;
  }
  if (INT.test(dom) && dow === "*") return { tipo: "mensal", dia: Number(dom), hora: h, minuto };
  return null;
}

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Descrição humana ("Diário às 06:00", "A cada 15 min"). */
export function descreverCron(expr: string): string {
  const s = cronParaSimples(expr);
  if (!s) return `Cron: ${expr}`;
  switch (s.tipo) {
    case "intervalo":
      return `A cada ${s.minutos} min`;
    case "horas":
      return s.aCada === 1
        ? `De hora em hora (min ${String(s.minuto).padStart(2, "0")})`
        : `A cada ${s.aCada} h (min ${String(s.minuto).padStart(2, "0")})`;
    case "diario":
      if (s.dias.length === 0 || s.dias.length === 7) return `Diário às ${hhmm(s.hora, s.minuto)}`;
      return `${s.dias.map((d) => DIAS_CURTOS[d]).join(", ")} às ${hhmm(s.hora, s.minuto)}`;
    case "mensal":
      return `Todo dia ${s.dia} às ${hhmm(s.hora, s.minuto)}`;
  }
}
