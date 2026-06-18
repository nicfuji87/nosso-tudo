-- =====================================================================
-- NOSSO TUDO — 0022: filtro opcional por beneficiário (pessoa) nos
-- relatórios de despesa. Adiciona p_beneficiario uuid DEFAULT NULL às
-- RPCs de categoria/essencialidade. NULL = sem filtro (comportamento
-- atual intacto — Início e relatórios sem filtro não mudam).
-- DROP + CREATE porque o novo parâmetro altera a assinatura; é uma só
-- transação (rollback limpo se algo falhar). Nenhuma RPC interna chama
-- estas funções — só a app, por args nomeados.
-- =====================================================================

-- 1) Gastos por categoria (mês) -------------------------------------------------
DROP FUNCTION IF EXISTS public.gastos_por_categoria_v2(uuid, date);
CREATE OR REPLACE FUNCTION public.gastos_por_categoria_v2(
  p_workspace_id uuid,
  p_mes date DEFAULT (date_trunc('month'::text, now()))::date,
  p_beneficiario uuid DEFAULT NULL
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
      AND (p_beneficiario IS NULL OR t.beneficiario_id = p_beneficiario)
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
  SELECT p.id, p.nome, p.cor, p.icone, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  JOIN categorias c ON c.id = ct.categoria_id
  JOIN categorias p ON p.id = COALESCE(c.categoria_pai_id, c.id)
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY p.id, p.nome, p.cor, p.icone
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;

-- 2) Gastos por categoria em intervalo (comparativo) ----------------------------
DROP FUNCTION IF EXISTS public.gastos_por_categoria_periodo(uuid, date, date);
CREATE OR REPLACE FUNCTION public.gastos_por_categoria_periodo(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date,
  p_beneficiario uuid DEFAULT NULL
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
      AND (p_beneficiario IS NULL OR t.beneficiario_id = p_beneficiario)
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
  SELECT p.id, p.nome, p.cor, p.icone, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  JOIN categorias c ON c.id = ct.categoria_id
  JOIN categorias p ON p.id = COALESCE(c.categoria_pai_id, c.id)
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY p.id, p.nome, p.cor, p.icone
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;

-- 3) Essencial × supérfluo (mês) ------------------------------------------------
DROP FUNCTION IF EXISTS public.gastos_por_essencialidade(uuid, date);
CREATE OR REPLACE FUNCTION public.gastos_por_essencialidade(
  p_workspace_id uuid,
  p_mes date DEFAULT (date_trunc('month'::text, now()))::date,
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
      AND t.data_transacao >= p_mes
      AND t.data_transacao < (p_mes + INTERVAL '1 month')
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
