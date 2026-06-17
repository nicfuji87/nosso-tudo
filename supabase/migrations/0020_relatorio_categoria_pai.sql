-- =====================================================================
-- NOSSO TUDO — 0020: relatório de gastos agrupado por categoria-PAI
-- Antes, gastos_por_categoria_v2 agrupava pela categoria-folha (subcategoria),
-- então "Cabelo" aparecia como fatia própria e, por ser pequena, caía no
-- balde "Outros" do donut — em vez de somar em "Cuidados pessoais".
-- Agora cada contribuição sobe para a categoria de topo (COALESCE(pai, ela
-- mesma)), batendo com a hierarquia que o seletor de categoria já mostra.
-- Taxonomia é de 2 níveis (pai → filho), então um COALESCE basta.
-- Total continua reconciliado com resumo_mes (só muda o agrupamento).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gastos_por_categoria_v2(
  p_workspace_id uuid,
  p_mes date DEFAULT (date_trunc('month'::text, now()))::date
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
      AND t.data_transacao >= p_mes
      AND t.data_transacao < (p_mes + INTERVAL '1 month')
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
