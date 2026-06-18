import { createClient } from "@/lib/supabase/server";
import type { FrequenciaRecorrencia } from "@/lib/types/db";

/**
 * Engine de DESCOBERTAS (determinística, sem LLM).
 *
 * Roda regras simples sobre o dado que já temos e devolve uma lista tipada de
 * achados acionáveis — o coração do "Início inteligente" (ver PLANO-RELATORIOS.md).
 * Reaproveitável pela Nia proativa (nia-alertas-cron) no futuro.
 */

export type SeveridadeDescoberta = "oportunidade" | "atencao" | "risco";

export interface Descoberta {
  /** chave estável (tipo) — uma descoberta por regra */
  tipo: "assinatura_fantasma" | "gastos_invisiveis";
  severidade: SeveridadeDescoberta;
  emoji: string;
  titulo: string;
  detalhe: string | null;
  /** valor em destaque (R$); null quando não se aplica */
  valor: number | null;
  href: string;
}

/** Quantas vezes por ano cada frequência cobra — p/ anualizar recorrências. */
const FATOR_ANUAL: Record<FrequenciaRecorrencia, number> = {
  diaria: 365,
  semanal: 52,
  quinzenal: 26,
  mensal: 12,
  bimestral: 6,
  trimestral: 4,
  semestral: 2,
  anual: 1,
};

/** Compras "miúdas" abaixo deste valor entram no radar de gastos invisíveis. */
const LIMITE_INVISIVEL = 35;

function inicioDoMes(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

/**
 * Recorrências ativas cuja categoria é de baixa prioridade (supérfluo) —
 * candidatas a corte. Não afirmamos "parada há X meses" (não rastreamos uso);
 * sinalizamos o custo anual do que é supérfluo e recorrente.
 */
async function assinaturasFantasma(workspaceId: string): Promise<Descoberta | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("recorrencias")
    .select("descricao, valor_previsto, frequencia, categoria:categorias(essencialidade_padrao)")
    .eq("workspace_id", workspaceId)
    .eq("ativa", true)
    .eq("tipo", "despesa");
  const rows =
    (data as
      | {
          descricao: string;
          valor_previsto: number;
          frequencia: FrequenciaRecorrencia;
          categoria: { essencialidade_padrao: string | null } | null;
        }[]
      | null) ?? [];

  const fantasmas = rows.filter((r) => r.categoria?.essencialidade_padrao === "superfluo");
  if (fantasmas.length === 0) return null;

  const totalAnual = fantasmas.reduce(
    (s, r) => s + Number(r.valor_previsto) * (FATOR_ANUAL[r.frequencia] ?? 12),
    0,
  );
  const nomes = fantasmas.slice(0, 3).map((r) => r.descricao).join(", ");

  return {
    tipo: "assinatura_fantasma",
    severidade: "oportunidade",
    emoji: "👻",
    titulo:
      fantasmas.length === 1
        ? "1 assinatura de baixa prioridade"
        : `${fantasmas.length} assinaturas de baixa prioridade`,
    detalhe: `${nomes}${fantasmas.length > 3 ? "…" : ""} — vale rever`,
    valor: totalAnual,
    href: "/app/cadastros",
  };
}

/**
 * Soma das compras pequenas (< R$ 35) confirmadas no mês — os "vazamentos" que
 * não quebram numa compra só, mas somados pesam.
 */
async function gastosInvisiveis(workspaceId: string): Promise<Descoberta | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transacoes")
    .select("valor")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", inicioDoMes())
    .gt("valor", 0)
    .lt("valor", LIMITE_INVISIVEL);
  const rows = (data as { valor: number }[] | null) ?? [];
  if (rows.length < 3) return null; // poucas compras: ainda não é um padrão

  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  return {
    tipo: "gastos_invisiveis",
    severidade: "atencao",
    emoji: "💧",
    titulo: "Gastos invisíveis somam",
    detalhe: `${rows.length} compras abaixo de ${LIMITE_INVISIVEL.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })} este mês`,
    valor: total,
    href: "/app/transacoes",
  };
}

/** Roda todas as regras em paralelo e devolve as descobertas encontradas. */
export async function getDescobertas(workspaceId: string): Promise<Descoberta[]> {
  const resultados = await Promise.all([
    assinaturasFantasma(workspaceId),
    gastosInvisiveis(workspaceId),
  ]);
  return resultados.filter((d): d is Descoberta => d !== null);
}
