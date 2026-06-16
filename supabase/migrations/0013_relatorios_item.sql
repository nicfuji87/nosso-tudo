-- =====================================================================
-- NOSSO TUDO — 0013: relatórios por item (Fase 2)
-- gastos_por_categoria_v2: soma pelos itens quando a nota está itemizada,
-- cai na categoria da transação quando não está. Sem contagem dupla:
-- o resíduo (valor da nota - soma dos itens) é atribuído à categoria da
-- transação, mantendo o total reconciliado com resumo_mes.
-- gastos_por_essencialidade: essencial × supérfluo no mês.
-- Ver PLANO-CATEGORIZACAO.md (Fase 2).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Gastos por categoria, com itemização (substitui gastos_por_categoria na UI)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gastos_por_categoria_v2(
  p_workspace_id UUID,
  p_mes DATE DEFAULT date_trunc('month', now())::date
) RETURNS TABLE(
  categoria_id UUID,
  categoria_nome TEXT,
  cor TEXT,
  icone TEXT,
  total NUMERIC
) AS $$
  WITH despesas AS (
    SELECT t.id, t.valor, t.categoria_id
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
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
    -- 1) cada item na sua categoria
    SELECT categoria_id, valor FROM itens
    UNION ALL
    -- 2) resíduo das notas itemizadas (taxas/frete/arredondamento) na categoria da transação
    SELECT d.categoria_id, (d.valor - s.total_itens) AS valor
    FROM despesas d JOIN soma_itens s ON s.transacao_id = d.id
    WHERE d.valor - s.total_itens > 0
    UNION ALL
    -- 3) transações sem itens: valor inteiro na categoria da transação
    SELECT d.categoria_id, d.valor
    FROM despesas d
    WHERE NOT EXISTS (SELECT 1 FROM soma_itens s WHERE s.transacao_id = d.id)
  )
  SELECT c.id, c.nome, c.cor, c.icone, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  JOIN categorias c ON c.id = ct.categoria_id
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY c.id, c.nome, c.cor, c.icone
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- Gastos por essencialidade no mês (essencial × supérfluo)
-- Item itemizado usa sua essencialidade; resíduo e transações sem itens
-- caem no default da categoria (categorias.essencialidade_padrao) ou 'necessario'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gastos_por_essencialidade(
  p_workspace_id UUID,
  p_mes DATE DEFAULT date_trunc('month', now())::date
) RETURNS TABLE(
  essencialidade essencialidade,
  total NUMERIC
) AS $$
  WITH despesas AS (
    SELECT t.id, t.valor, t.categoria_id
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
      AND t.data_transacao >= p_mes
      AND t.data_transacao < (p_mes + INTERVAL '1 month')
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
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
