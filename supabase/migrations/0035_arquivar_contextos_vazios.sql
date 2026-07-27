-- =====================================================================
-- 0035. LIMPEZA AUTOMÁTICA DE EVENTOS/CONTEXTOS VAZIOS
-- ---------------------------------------------------------------------
-- Evento sem nenhum lançamento some da lista. Cobre os dois casos: o que
-- nunca chegou a ser usado (a Nia criou 'Judô' quando já existia 'Judô do
-- Henrique') e o que ficou vazio depois que os lançamentos saíram dele.
--
-- ARQUIVA, não apaga. `contextos.arquivado` já é o filtro de listarEventos e
-- das telas, então arquivar produz exatamente o efeito desejado — sumir da
-- lista e parar de confundir a Nia — sem destruir nome, tipo e cor, e sem
-- quebrar nada se um lançamento voltar a apontar para ele depois. Reverter é
-- um UPDATE.
--
-- CARÊNCIA DE 24H: entre criar o evento e lançar a primeira despesa nele o
-- contexto fica legitimamente vazio. Sem a carência, um evento criado agora
-- morreria antes de ser usado. A mesma condição serve ao caso "esvaziou": um
-- evento antigo que perdeu o último lançamento já passou da carência e é
-- arquivado na próxima passada.
-- =====================================================================

CREATE OR REPLACE FUNCTION arquivar_contextos_vazios()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH vazios AS (
    UPDATE contextos c
       SET arquivado = TRUE, updated_at = NOW()
     WHERE c.arquivado = FALSE
       AND c.created_at < NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.contexto_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM itens_transacao i WHERE i.contexto_id = c.id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM vazios;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION arquivar_contextos_vazios() FROM PUBLIC, anon, authenticated;

-- Diária às 09:05 UTC (~06:05 BRT), logo depois da geração de recorrências —
-- assim um contexto que acabou de receber um lançamento recorrente não é
-- arquivado por engano. cron.schedule é idempotente por nome.
SELECT cron.schedule(
  'arquivar-contextos-vazios-diario',
  '5 9 * * *',
  $$SELECT arquivar_contextos_vazios()$$
);
