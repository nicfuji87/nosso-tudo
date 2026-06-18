-- =====================================================================
-- NOSSO TUDO — 0021: gastos por categoria em um INTERVALO de datas
-- Base do comparativo "mesmo período" (ex.: 1–18 mai × 1–18 jun) e do
-- futuro filtro de período. Mesma lógica item a item do
-- gastos_por_categoria_v2 (0020), mas com janela [p_inicio, p_fim)
-- arbitrária em vez de mês fechado. Aditivo — não altera as RPCs atuais.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gastos_por_categoria_periodo(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date
)
 RETURNS TABLE(categoria_id uuid, categoria_nome text, cor text, icone text, total numeric)
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
  ),
  itens AS (
    SELECT i.transacao_id,
           COALESCE(i.categoria_id, d.categoria_id) AS categoria_id,
           COALESCE(i.valor_total, 0) AS valor
    FROM itens_transacao i
    JOIN despesas d ON d.id = i.transacao_id
    WHERE i.workspace_id = p_workspace_id
  ),
  soma_itens AS (
    SELECT transacao_id, SUM(valor) AS total_itens
    FROM itens GROUP BY transacao_id
  ),
  contrib AS (
    SELECT categoria_id, valor FROM itens
    UNION ALL
    SELECT d.categoria_id, (d.valor - s.total_itens) AS valor
    FROM despesas d JOIN soma_itens s ON s.transacao_id = d.id
    WHERE d.valor - s.total_itens > 0
    UNION ALL
    SELECT d.categoria_id, d.valor
    FROM despesas d
    WHERE NOT EXISTS (SELECT 1 FROM soma_itens s WHERE s.transacao_id = d.id)
  )
  -- Sobe a subcategoria (folha) para a categoria-pai de topo.
  SELECT p.id, p.nome, p.cor, p.icone, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  JOIN categorias c ON c.id = ct.categoria_id
  JOIN categorias p ON p.id = COALESCE(c.categoria_pai_id, c.id)
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY p.id, p.nome, p.cor, p.icone
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;
