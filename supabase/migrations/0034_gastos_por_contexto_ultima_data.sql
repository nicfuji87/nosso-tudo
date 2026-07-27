-- gastos_por_contexto passa a devolver a janela de atividade do evento
-- (primeira_data / ultima_data) além do total all-time.
--
-- Motivo: o dashboard é uma tela DO MÊS ("Julho de 2026" no cabeçalho, resumo e
-- categorias todos do mês), mas a lista de Eventos era all-time. Resultado: a
-- "Viagem à Argentina", que terminou em maio, continuava ocupando espaço em
-- julho, e os eventos só se acumulavam.
--
-- A soma continua all-time de propósito — a graça de um evento é "quanto custou a
-- viagem inteira". O que muda é só o critério de EXIBIR: quem filtra por
-- movimentação no mês é a tela, com a ultima_data em mãos. Relatórios e a Nia
-- seguem enxergando tudo.

DROP FUNCTION IF EXISTS public.gastos_por_contexto(uuid);

CREATE FUNCTION public.gastos_por_contexto(p_workspace_id uuid)
RETURNS TABLE(
  contexto_id uuid,
  nome text,
  tipo text,
  cor text,
  icone text,
  data_referencia date,
  total numeric,
  n_transacoes bigint,
  primeira_data date,
  ultima_data date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH despesas AS (
    SELECT t.id, t.valor, t.contexto_id, t.data_transacao
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
      AND t.status_revisao = 'confirmado'
  ),
  itens AS (
    SELECT i.transacao_id, COALESCE(i.contexto_id, d.contexto_id) AS contexto_id, COALESCE(i.valor_total, 0) AS valor
    FROM itens_transacao i JOIN despesas d ON d.id = i.transacao_id
    WHERE i.workspace_id = p_workspace_id
  ),
  soma_itens AS (SELECT transacao_id, SUM(valor) AS total_itens FROM itens GROUP BY transacao_id),
  contrib AS (
    SELECT transacao_id, contexto_id, valor FROM itens
    UNION ALL
    SELECT d.id, d.contexto_id, (d.valor - s.total_itens) FROM despesas d JOIN soma_itens s ON s.transacao_id = d.id WHERE d.valor - s.total_itens > 0
    UNION ALL
    SELECT d.id, d.contexto_id, d.valor FROM despesas d WHERE NOT EXISTS (SELECT 1 FROM soma_itens s WHERE s.transacao_id = d.id)
  )
  SELECT cx.id, cx.nome, cx.tipo, cx.cor, cx.icone, cx.data_referencia,
         COALESCE(SUM(ct.valor), 0) AS total,
         COUNT(DISTINCT ct.transacao_id) AS n_transacoes,
         MIN(d2.data_transacao) AS primeira_data,
         MAX(d2.data_transacao) AS ultima_data
  FROM contrib ct
  JOIN contextos cx ON cx.id = ct.contexto_id
  JOIN despesas d2 ON d2.id = ct.transacao_id
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY cx.id, cx.nome, cx.tipo, cx.cor, cx.icone, cx.data_referencia
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;
