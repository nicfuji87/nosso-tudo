import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { LABEL_FREQUENCIA, type FrequenciaRecorrencia } from "@/lib/types/db";

/**
 * Engine de DESCOBERTAS (determinística, sem LLM).
 *
 * Roda regras simples sobre o dado que já temos e devolve uma lista tipada de
 * achados acionáveis — o coração do "Início inteligente" (ver PLANO-RELATORIOS.md).
 * Reaproveitável pela Nia proativa (nia-alertas-cron) no futuro.
 */

export type SeveridadeDescoberta = "oportunidade" | "atencao" | "risco";

/** Uma linha do drill da descoberta (qual gasto/assinatura entrou na conta). */
export interface DescobertaItem {
  descricao: string;
  /** apoio: estabelecimento · data, ou frequência */
  sub: string | null;
  valor: number | null;
}

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
  /** quando presente, o card abre um detalhamento (em vez de só navegar) */
  itens?: DescobertaItem[];
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

  return {
    tipo: "assinatura_fantasma",
    severidade: "oportunidade",
    emoji: "👻",
    titulo:
      fantasmas.length === 1
        ? "1 assinatura de baixa prioridade"
        : `${fantasmas.length} assinaturas de baixa prioridade`,
    detalhe: "supérfluas e recorrentes — toque para ver",
    valor: totalAnual,
    href: "/app/cadastros",
    itens: fantasmas
      .sort((a, b) => Number(b.valor_previsto) - Number(a.valor_previsto))
      .map((r) => ({
        descricao: r.descricao,
        sub: LABEL_FREQUENCIA[r.frequencia] ?? r.frequencia,
        valor: Number(r.valor_previsto),
      })),
  };
}

/**
 * Soma das compras pequenas (< R$ 35) confirmadas no mês — os "vazamentos" que
 * não quebram numa compra só, mas somados pesam.
 */
async function gastosInvisiveis(workspaceId: string): Promise<Descoberta | null> {
  const supabase = createClient();
  // Cada "compra pequena" é uma transação inteira abaixo do limite (padaria,
  // café, app…). Itens dentro de uma compra grande não contam — esses são
  // gastos planejados, não vazamentos avulsos.
  const { data } = await supabase
    .from("transacoes")
    .select("descricao, valor, data_transacao, estabelecimento:estabelecimentos(nome)")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "despesa")
    .eq("status_revisao", "confirmado")
    .gte("data_transacao", inicioDoMes())
    .gt("valor", 0)
    .lt("valor", LIMITE_INVISIVEL)
    .order("valor", { ascending: false });
  const rows =
    (data as
      | { descricao: string; valor: number; data_transacao: string; estabelecimento: { nome: string } | null }[]
      | null) ?? [];
  if (rows.length < 3) return null; // poucas compras: ainda não é um padrão

  const total = rows.reduce((s, r) => s + Number(r.valor), 0);
  const limiteFmt = LIMITE_INVISIVEL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return {
    tipo: "gastos_invisiveis",
    severidade: "atencao",
    emoji: "💧",
    titulo: "Gastos invisíveis somam",
    detalhe: `${rows.length} compras abaixo de ${limiteFmt} este mês — toque para ver`,
    valor: total,
    href: "/app/transacoes",
    itens: rows.map((r) => ({
      descricao: r.descricao || r.estabelecimento?.nome || "Compra",
      sub: [r.estabelecimento?.nome, r.data_transacao ? formatDate(r.data_transacao) : null]
        .filter(Boolean)
        .join(" · ") || null,
      valor: Number(r.valor),
    })),
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
