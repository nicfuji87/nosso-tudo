-- =====================================================================
-- 0017. GERAÇÃO AUTOMÁTICA DE CONTAS FIXAS (RECORRÊNCIAS)
-- ---------------------------------------------------------------------
-- Materializa as recorrências vencidas em transações (origem='recorrente')
-- e avança proxima_geracao mantendo o dia do vencimento. Agendada via
-- pg_cron. Idempotente: não duplica um lançamento já gerado (recorrencia_id
-- + data_transacao). A 1ª parcela é gerada na data_inicio; daí em diante
-- avança conforme a frequência.
-- =====================================================================

CREATE OR REPLACE FUNCTION gerar_recorrencias_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
          'recorrente', r.id, 'confirmado'
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
$$;

-- Função de sistema: chamada só pelo cron (postgres). Tira do alcance de anon/authenticated.
REVOKE ALL ON FUNCTION gerar_recorrencias_due() FROM PUBLIC;

-- Agenda diária às 09:00 UTC (~06:00 BRT). cron.schedule é idempotente por nome.
SELECT cron.schedule('gerar-recorrencias-diario', '0 9 * * *', $$SELECT gerar_recorrencias_due()$$);
