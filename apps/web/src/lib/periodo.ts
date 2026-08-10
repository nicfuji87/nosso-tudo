/**
 * Resolução do filtro de tempo dos relatórios. A partir dos parâmetros de URL
 * (`?periodo=` e, no modo custom, `?de=&ate=`) devolve a janela `[inicio, fim)`,
 * a janela de comparação (período imediatamente anterior, de mesma natureza) e
 * os rótulos para a UI. Lógica pura de datas — usada no servidor.
 *
 * `resolverMes` (no fim do arquivo) atende o Início, que é uma tela de UM mês:
 * navega mês a mês em vez de presets.
 */

import { hojeISO } from "@/lib/format";

export const PERIODO_PRESETS = ["mes-atual", "mes-anterior", "3-meses", "6-meses", "ano", "custom"] as const;
export type PeriodoPreset = (typeof PERIODO_PRESETS)[number];

export interface PeriodoResolvido {
  preset: PeriodoPreset;
  /** janela atual — datas YYYY-MM-DD; `fim` é exclusivo */
  inicio: string;
  fim: string;
  /** ecoa as datas custom (YYYY-MM-DD), p/ preencher os inputs */
  de: string | null;
  ate: string | null;
  /** rótulo curto do período (chip) */
  label: string;
  /** janela de comparação (período anterior de mesma duração/natureza) */
  compInicio: string;
  compFim: string;
  titulo: string;
  rotuloAtual: string;
  rotuloAnterior: string;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rotuloMes(d: Date) {
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function rotuloDia(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolverPeriodo(params: { periodo?: string; de?: string; ate?: string }): PeriodoResolvido {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();
  const inicioMesAtual = new Date(ano, mes, 1);
  const amanha = new Date(ano, mes, dia + 1); // fim exclusivo que inclui hoje

  // Custom tem prioridade quando as duas datas são válidas.
  if (params.periodo === "custom" && DATE_RE.test(params.de ?? "") && DATE_RE.test(params.ate ?? "")) {
    const a = new Date(`${params.de}T00:00:00`);
    const b = new Date(`${params.ate}T00:00:00`);
    const inicio = a <= b ? a : b;
    const fimIncl = a <= b ? b : a;
    const fim = new Date(fimIncl.getFullYear(), fimIncl.getMonth(), fimIncl.getDate() + 1);
    const compInicio = new Date(inicio.getTime() - (fim.getTime() - inicio.getTime()));
    return {
      preset: "custom",
      inicio: fmt(inicio),
      fim: fmt(fim),
      de: fmt(inicio),
      ate: fmt(fimIncl),
      label: `${rotuloDia(inicio)} – ${rotuloDia(fimIncl)}`,
      compInicio: fmt(compInicio),
      compFim: fmt(inicio),
      titulo: "Período × anterior",
      rotuloAtual: "Despesas no período",
      rotuloAnterior: "No período anterior",
    };
  }

  const preset: PeriodoPreset = (PERIODO_PRESETS as readonly string[]).includes(params.periodo ?? "")
    ? (params.periodo as PeriodoPreset)
    : "mes-atual";

  switch (preset) {
    case "mes-anterior": {
      const inicio = new Date(ano, mes - 1, 1);
      return {
        preset,
        inicio: fmt(inicio),
        fim: fmt(inicioMesAtual),
        de: null,
        ate: null,
        label: rotuloMes(inicio),
        compInicio: fmt(new Date(ano, mes - 2, 1)),
        compFim: fmt(inicio),
        titulo: "Mês × anterior",
        rotuloAtual: "Despesas no mês",
        rotuloAnterior: "No mês anterior",
      };
    }
    case "3-meses":
    case "6-meses": {
      const n = preset === "3-meses" ? 3 : 6;
      const inicio = new Date(ano, mes - (n - 1), 1);
      return {
        preset,
        inicio: fmt(inicio),
        fim: fmt(amanha),
        de: null,
        ate: null,
        label: `Últimos ${n} meses`,
        compInicio: fmt(new Date(ano, mes - (2 * n - 1), 1)),
        compFim: fmt(inicio),
        titulo: `Últimos ${n} meses × anteriores`,
        rotuloAtual: "Despesas no período",
        rotuloAnterior: `Nos ${n} meses anteriores`,
      };
    }
    case "ano": {
      const inicio = new Date(ano, 0, 1);
      return {
        preset,
        inicio: fmt(inicio),
        fim: fmt(amanha),
        de: null,
        ate: null,
        label: String(ano),
        compInicio: fmt(new Date(ano - 1, 0, 1)),
        compFim: fmt(new Date(ano - 1, mes, dia + 1)), // mesmo ponto do ano passado
        titulo: "Este ano × ano passado",
        rotuloAtual: "Despesas no ano",
        rotuloAnterior: "No ano passado, até hoje",
      };
    }
    case "mes-atual":
    default: {
      let compFim = new Date(ano, mes - 1, dia + 1); // mesmo dia-corte do mês passado
      if (compFim > inicioMesAtual) compFim = inicioMesAtual;
      return {
        preset: "mes-atual",
        inicio: fmt(inicioMesAtual),
        fim: fmt(amanha),
        de: null,
        ate: null,
        label: "Este mês",
        compInicio: fmt(new Date(ano, mes - 1, 1)),
        compFim: fmt(compFim),
        titulo: "Este mês × anterior",
        rotuloAtual: "Despesas até agora",
        rotuloAnterior: `No mês passado, até o dia ${dia}`,
      };
    }
  }
}

/* ------------------------------------------------------------------ *
 * Navegação mês a mês (tela Início)
 * ------------------------------------------------------------------ */

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface MesResolvido {
  /** chave YYYY-MM — o que vai no `?mes=` da URL */
  param: string;
  /** 1º dia do mês (YYYY-MM-DD) — o `p_mes` das RPCs mensais */
  mesRef: string;
  /** "Agosto de 2026" */
  label: string;
  ehMesAtual: boolean;
  /** YYYY-MM do mês anterior */
  anterior: string;
  /** YYYY-MM do mês seguinte; null no mês corrente (não se navega pro futuro) */
  proximo: string | null;
  /**
   * Janela `[inicio, fim)`. No mês corrente `fim` é amanhã: só o já decorrido
   * entra, para o comparativo confrontar períodos de mesmo tamanho.
   */
  inicio: string;
  fim: string;
  /** 1º dia do mês seguinte — janela de calendário cheia, independente de hoje */
  fimMes: string;
  compInicio: string;
  compFim: string;
  titulo: string;
  rotuloAtual: string;
  rotuloAnterior: string;
}

/** Soma `delta` meses a uma chave YYYY-MM. */
function somarMeses(mesKey: string, delta: number): string {
  const [ano, mes] = mesKey.split("-").map(Number) as [number, number];
  const total = ano * 12 + (mes - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Resolve o mês exibido no Início a partir do `?mes=YYYY-MM`.
 * Ausente, malformado ou no futuro → mês corrente.
 *
 * A "hoje" vem de `hojeISO()` (America/Sao_Paulo): na Vercel o processo roda em
 * UTC, e `new Date()` cru viraria o mês três horas cedo demais.
 */
export function resolverMes(mes?: string | null): MesResolvido {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const dia = Number(hoje.slice(8, 10));

  const pedido = MES_RE.test(mes ?? "") ? (mes as string) : mesAtual;
  const param = pedido > mesAtual ? mesAtual : pedido;
  const ehMesAtual = param === mesAtual;

  const anterior = somarMeses(param, -1);
  const proximo = ehMesAtual ? null : somarMeses(param, 1);
  const mesRef = `${param}-01`;
  const fimMes = `${somarMeses(param, 1)}-01`;

  const [ano, numMes] = param.split("-").map(Number) as [number, number];
  const label = rotuloMes(new Date(ano, numMes - 1, 1));

  if (!ehMesAtual) {
    return {
      param,
      mesRef,
      label,
      ehMesAtual,
      anterior,
      proximo,
      inicio: mesRef,
      fim: fimMes,
      fimMes,
      compInicio: `${anterior}-01`,
      compFim: mesRef,
      titulo: "Mês × anterior",
      rotuloAtual: "Despesas no mês",
      rotuloAnterior: "No mês anterior",
    };
  }

  // Mês corrente: confronta com o mesmo trecho do mês passado (até o dia de
  // hoje), senão o mês em andamento sempre pareceria mais barato.
  const inicioMesAtual = new Date(ano, numMes - 1, 1);
  let compFim = new Date(ano, numMes - 2, dia + 1);
  if (compFim > inicioMesAtual) compFim = inicioMesAtual;

  return {
    param,
    mesRef,
    label,
    ehMesAtual,
    anterior,
    proximo,
    inicio: mesRef,
    fim: fmt(new Date(ano, numMes - 1, dia + 1)), // fim exclusivo que inclui hoje
    fimMes,
    compInicio: `${anterior}-01`,
    compFim: fmt(compFim),
    titulo: "Este mês × anterior",
    rotuloAtual: "Despesas até agora",
    rotuloAnterior: `No mês passado, até o dia ${dia}`,
  };
}
