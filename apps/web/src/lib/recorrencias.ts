import type { FrequenciaRecorrencia } from "@/lib/types/db";

/** Avança uma data ISO (YYYY-MM-DD) conforme a frequência da recorrência. */
export function avancarDataRecorrencia(iso: string, freq: FrequenciaRecorrencia | string): string {
  const [y, m, dd] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y || 1970, (m || 1) - 1, dd || 1));
  switch (freq) {
    case "diaria":
      base.setUTCDate(base.getUTCDate() + 1);
      break;
    case "semanal":
      base.setUTCDate(base.getUTCDate() + 7);
      break;
    case "quinzenal":
      base.setUTCDate(base.getUTCDate() + 15);
      break;
    case "bimestral":
      base.setUTCMonth(base.getUTCMonth() + 2);
      break;
    case "trimestral":
      base.setUTCMonth(base.getUTCMonth() + 3);
      break;
    case "semestral":
      base.setUTCMonth(base.getUTCMonth() + 6);
      break;
    case "anual":
      base.setUTCFullYear(base.getUTCFullYear() + 1);
      break;
    default:
      base.setUTCMonth(base.getUTCMonth() + 1); // mensal
  }
  return base.toISOString().slice(0, 10);
}

/**
 * Decide a partir de quando o cron deve gerar a 1ª ocorrência da conta fixa.
 *
 * - `retroativo = true`: começa na própria `dataInicio` (recria o histórico — o
 *   cron/confirmação materializa tudo desde então). Só quando o usuário pedir.
 * - `retroativo = false` (padrão): mantém o dia/ciclo do vencimento ancorado em
 *   `dataInicio`, mas pula o passado — avança até a 1ª data `>= hoje`. Evita o
 *   "flood" de meses passados ao cadastrar algo que começou há tempos.
 */
export function primeiraGeracao(
  freq: FrequenciaRecorrencia | string,
  dataInicio: string,
  hoje: string,
  retroativo = false,
): string {
  if (retroativo) return dataInicio;
  let v = dataInicio;
  let guard = 0;
  while (v < hoje && guard < 600) {
    v = avancarDataRecorrencia(v, freq);
    guard++;
  }
  return v;
}
