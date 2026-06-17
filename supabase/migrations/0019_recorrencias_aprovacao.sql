-- =====================================================================
-- 0019. CONTAS FIXAS PASSAM POR APROVAÇÃO
-- ---------------------------------------------------------------------
-- (1) O cron gera as ocorrências como 'sugerido' (a confirmar) em vez de
--     'confirmado' — cada vencimento é conferido na Pré-conferência.
-- (2) Relatórios/saldo passam a contar SÓ 'confirmado' — pendentes (contas
--     fixas geradas e itens do WhatsApp) viram "previstos", não entram no
--     realizado até o usuário aprovar.
-- =====================================================================

-- (1) Geração como 'sugerido'
CREATE OR REPLACE FUNCTION gerar_recorrencias_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r       RECORD;
  v_data  DATE;
  v_count INT := 0;
  v_guard INT;
BEGIN
  FOR r IN SELECT * FROM recorrencias WHERE ativa = TRUE LOOP
    v_data := COALESCE(r.proxima_geracao, r.data_inicio);
    IF v_data IS NULL THEN
      CONTINUE;
    END IF;

    v_guard := 0;
    WHILE v_data <= CURRENT_DATE
          AND (r.data_fim IS NULL OR v_data <= r.data_fim)
          AND v_guard < 120 LOOP

      IF NOT EXISTS (
        SELECT 1 FROM transacoes
        WHERE recorrencia_id = r.id AND data_transacao = v_data
      ) THEN
        INSERT INTO transacoes (
          workspace_id, tipo, descricao, valor, data_transacao,
          categoria_id, pagador_id, beneficiario_id, meio_pagamento,
          cartao_id, conta_id, estabelecimento_id,
          origem, recorrencia_id, status_revisao
        ) VALUES (
          r.workspace_id, r.tipo, r.descricao, r.valor_previsto, v_data,
          r.categoria_id, r.pagador_id, r.beneficiario_id, r.meio_pagamento,
          r.cartao_id, r.conta_id, r.estabelecimento_id,
          'recorrente', r.id, 'sugerido'
        );
        v_count := v_count + 1;
        UPDATE recorrencias SET ultima_geracao = v_data WHERE id = r.id;
      END IF;

      v_data := (CASE r.frequencia
        WHEN 'diaria'     THEN v_data + INTERVAL '1 day'
        WHEN 'semanal'    THEN v_data + INTERVAL '1 week'
        WHEN 'quinzenal'  THEN v_data + INTERVAL '15 days'
        WHEN 'mensal'     THEN v_data + INTERVAL '1 month'
        WHEN 'bimestral'  THEN v_data + INTERVAL '2 months'
        WHEN 'trimestral' THEN v_data + INTERVAL '3 months'
        WHEN 'semestral'  THEN v_data + INTERVAL '6 months'
        WHEN 'anual'      THEN v_data + INTERVAL '1 year'
        ELSE v_data + INTERVAL '1 month'
      END)::DATE;
      v_guard := v_guard + 1;
    END LOOP;

    UPDATE recorrencias SET proxima_geracao = v_data WHERE id = r.id;
  END LOOP;

  RETURN v_count;
END;
$fn$;

-- (2) Relatórios contam só 'confirmado'

CREATE OR REPLACE FUNCTION public.resumo_mes(p_workspace_id uuid, p_mes date DEFAULT (date_trunc('month'::text, now()))::date)
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
    AND data_transacao >= p_mes
    AND data_transacao < (p_mes + INTERVAL '1 month');
$function$;

CREATE OR REPLACE FUNCTION public.gastos_por_categoria(p_workspace_id uuid, p_mes date DEFAULT (date_trunc('month'::text, now()))::date)
 RETURNS TABLE(categoria_id uuid, categoria_nome text, cor text, icone text, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.nome, c.cor, c.icone,
    COALESCE(SUM(t.valor), 0) AS total
  FROM transacoes t
  JOIN categorias c ON c.id = t.categoria_id
  WHERE t.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT user_workspaces())
    AND t.tipo = 'despesa'
    AND t.status_revisao = 'confirmado'
    AND t.data_transacao >= p_mes
    AND t.data_transacao < (p_mes + INTERVAL '1 month')
  GROUP BY c.id, c.nome, c.cor, c.icone
  HAVING COALESCE(SUM(t.valor), 0) > 0
  ORDER BY total DESC;
$function$;

CREATE OR REPLACE FUNCTION public.gastos_por_categoria_v2(p_workspace_id uuid, p_mes date DEFAULT (date_trunc('month'::text, now()))::date)
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
  SELECT c.id, c.nome, c.cor, c.icone, COALESCE(SUM(ct.valor), 0) AS total
  FROM contrib ct
  JOIN categorias c ON c.id = ct.categoria_id
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY c.id, c.nome, c.cor, c.icone
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;

CREATE OR REPLACE FUNCTION public.gastos_por_essencialidade(p_workspace_id uuid, p_mes date DEFAULT (date_trunc('month'::text, now()))::date)
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

CREATE OR REPLACE FUNCTION public.gastos_por_contexto(p_workspace_id uuid)
 RETURNS TABLE(contexto_id uuid, nome text, tipo text, cor text, icone text, data_referencia date, total numeric, n_transacoes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH despesas AS (
    SELECT t.id, t.valor, t.contexto_id
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
      AND t.status_revisao = 'confirmado'
  ),
  itens AS (
    SELECT i.transacao_id,
           COALESCE(i.contexto_id, d.contexto_id) AS contexto_id,
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
    SELECT transacao_id, contexto_id, valor FROM itens
    UNION ALL
    SELECT d.id, d.contexto_id, (d.valor - s.total_itens)
    FROM despesas d JOIN soma_itens s ON s.transacao_id = d.id
    WHERE d.valor - s.total_itens > 0
    UNION ALL
    SELECT d.id, d.contexto_id, d.valor
    FROM despesas d
    WHERE NOT EXISTS (SELECT 1 FROM soma_itens s WHERE s.transacao_id = d.id)
  )
  SELECT cx.id, cx.nome, cx.tipo, cx.cor, cx.icone, cx.data_referencia,
         COALESCE(SUM(ct.valor), 0) AS total,
         COUNT(DISTINCT ct.transacao_id) AS n_transacoes
  FROM contrib ct
  JOIN contextos cx ON cx.id = ct.contexto_id
  WHERE p_workspace_id IN (SELECT user_workspaces())
  GROUP BY cx.id, cx.nome, cx.tipo, cx.cor, cx.icone, cx.data_referencia
  HAVING COALESCE(SUM(ct.valor), 0) > 0
  ORDER BY total DESC;
$function$;
