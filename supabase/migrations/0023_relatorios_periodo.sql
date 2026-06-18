-- =====================================================================
-- NOSSO TUDO — 0023: relatórios por INTERVALO de datas (filtro de tempo
-- completo: últimos 3/6 meses, ano, personalizado). Versões "periodo" de
-- resumo e essencialidade — aditivas (nomes novos), não tocam as RPCs de
-- mês. A de categoria por intervalo já existe (gastos_por_categoria_periodo).
-- =====================================================================

-- Resumo (receitas/despesas/saldo) num intervalo [p_inicio, p_fim).
CREATE OR REPLACE FUNCTION public.resumo_periodo(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date
)
 RETURNS TABLE(receitas numeric, despesas numeric, saldo numeric, total_transacoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'receita'), 0) AS receitas,
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'despesa'), 0) AS despesas,
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'receita'), 0)
      - COALESCE(SUM(valor) FILTER (WHERE tipo = 'despesa'), 0) AS saldo,
    COUNT(*) AS total_transacoes
  FROM transacoes
  WHERE workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT user_workspaces())
    AND status_revisao = 'confirmado'
    AND data_transacao >= p_inicio
    AND data_transacao < p_fim;
$function$;

-- Essencial × supérfluo num intervalo, item a item (espelha gastos_por_essencialidade).
CREATE OR REPLACE FUNCTION public.gastos_por_essencialidade_periodo(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date,
  p_beneficiario uuid DEFAULT NULL
)
 RETURNS TABLE(essencialidade essencialidade, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH despesas AS (
    SELECT t.id, t.valor, t.categoria_id
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
      AND t.status_revisao = 'confirmado'
      AND t.data_transacao >= p_inicio
      AND t.data_transacao < p_fim
      AND (p_beneficiario IS NULL OR t.beneficiario_id = p_beneficiario)
  ),
  itens AS (
    SELECT i.transacao_id, i.essencialidade, COALESCE(i.valor_total, 0) AS valor
    FROM itens_transacao i
    JOIN despesas d ON d.id = i.transacao_id
    WHERE i.workspace_id = p_workspace_id
  ),
  soma_itens AS (
    SELECT transacao_id, SUM(valor) AS total_itens
    FROM itens GROUP BY transacao_id
  ),
  contrib AS (
    SELECT essencialidade, valor FROM itens
    UNION ALL
    SELECT COALESCE(c.essencialidade_padrao, 'necessario')::essencialidade, (d.valor - s.total_itens)
    FROM despesas d
    JOIN soma_itens s ON s.transacao_id = d.id
    LEFT JOIN categorias c ON c.id = d.categoria_id
    WHERE d.valor - s.total_itens > 0
    UNION ALL
    SELECT COALESCE(c.essencialidade_padrao, 'necessario')::essencialidade, d.valor
    FROM despesas d
    LEFT JOIN categorias c ON c.id = d.categoria_id
    WHERE NOT EXISTS (SELECT 1 FROM soma_itens s WHERE s.transacao_id = d.id)
  )
  SELECT ct.essencialidade, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY ct.essencialidade
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;
