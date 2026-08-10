-- =====================================================================
-- 0038. BAIXA DE CONTA FIXA
-- ---------------------------------------------------------------------
-- O cron (0019) materializa cada vencimento de recorrência como uma
-- transação 'sugerido'. Dar baixa = confirmar essa linha na
-- Pré-conferência. Mas na prática a conta costuma ser paga por FORA
-- disso — um lançamento avulso pela Nia, pelo app ou pelo WhatsApp — e
-- aí o vencimento ficava pendurado como se estivesse em aberto.
--
-- Aqui a baixa passa a ser automática e nos DOIS sentidos, porque a
-- ordem de chegada varia:
--   • pagamento depois do vencimento gerado (o comum);
--   • pagamento adiantado — o cron só materializa o vencimento quando a
--     data chega, então o lançamento existe antes do placeholder.
-- Em ambos, o lançamento real assume a ocorrência (recebe o
-- recorrencia_id) e o placeholder é aposentado.
--
-- Descrição sozinha não decide. Medido contra as recorrências reais, um
-- pagamento com ruído ("Paguei o Marista do Henrique" = 0.59) pontua
-- MENOS que um falso positivo ("Ajuda Eliane - Inglês" × "Ajuda Eliane -
-- Remédio" = 0.60). Então o valor é o segundo eixo, e a baixa exige um
-- de dois combos (ver `combina_conta_fixa`):
--   A. descrição inequívoca (>= 0.75) + valor dentro da variação
--      aceitável da recorrência;
--   B. valor exato ao centavo + descrição só razoável (>= 0.55).
-- Nessa régua, todo falso positivo medido cai fora por um eixo ou pelo
-- outro. O preço é perder frases muito soltas ("Transferi pra Eliane o
-- inglês") — essas ficam para a baixa manual, que é barata.
-- =====================================================================

-- Vencimentos são procurados por recorrencia_id + data; sem isto vira
-- seq scan (a checagem de duplicata do cron usa o mesmo par).
CREATE INDEX IF NOT EXISTS idx_tx_recorrencia
  ON public.transacoes (recorrencia_id, data_transacao)
  WHERE recorrencia_id IS NOT NULL;

-- Contenção entre a descrição da recorrência e a do lançamento.
-- Simétrica: "CASSI" casa com "CASSI - Plano de Saúde Nicolas" e vice-versa.
CREATE OR REPLACE FUNCTION public.similaridade_conta_fixa(p_a text, p_b text)
RETURNS REAL
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT GREATEST(
    word_similarity(normalizar_texto(p_a), normalizar_texto(p_b)),
    word_similarity(normalizar_texto(p_b), normalizar_texto(p_a))
  );
$fn$;

/**
 * A regra de baixa, num lugar só — as duas direções de conciliação
 * consultam esta função para não divergirem com o tempo.
 */
CREATE OR REPLACE FUNCTION public.combina_conta_fixa(
  p_valor_pago      numeric,
  p_descricao_pago  text,
  p_valor_previsto  numeric,
  p_variacao_pct    numeric,
  p_descricao_conta text
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT
    -- A: descrição inequívoca + valor plausível
    (similaridade_conta_fixa(p_descricao_conta, p_descricao_pago) >= 0.75
     AND abs(p_valor_pago - p_valor_previsto)
         <= p_valor_previsto * (COALESCE(p_variacao_pct, 10) / 100.0))
    OR
    -- B: valor exato ao centavo carrega uma descrição mais frouxa
    (p_valor_pago = p_valor_previsto
     AND similaridade_conta_fixa(p_descricao_conta, p_descricao_pago) >= 0.55);
$fn$;

/** Liga o pagamento à recorrência e aposenta o vencimento materializado. */
CREATE OR REPLACE FUNCTION public.dar_baixa_conta_fixa(
  p_pagamento_id uuid,
  p_ocorrencia_id uuid,
  p_recorrencia_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_data date;
BEGIN
  SELECT data_transacao INTO v_data FROM transacoes WHERE id = p_pagamento_id;

  UPDATE transacoes
     SET recorrencia_id = p_recorrencia_id
   WHERE id = p_pagamento_id;

  -- 'rejeitado' em vez de DELETE de propósito: some das listas e da
  -- Pré-conferência, mas segura a checagem de duplicata do cron, que
  -- senão regeraria o vencimento na próxima passada.
  UPDATE transacoes
     SET status_revisao = 'rejeitado',
         observacoes = TRIM(BOTH ' ·' FROM
           COALESCE(observacoes, '') || ' · Baixa dada pelo lançamento de ' ||
           to_char(v_data, 'DD/MM/YYYY'))
   WHERE id = p_ocorrencia_id;
END;
$fn$;

/**
 * Pagamento → vencimento. Chamada quando um lançamento avulso é
 * confirmado. Devolve o id da recorrência conciliada, ou NULL.
 */
CREATE OR REPLACE FUNCTION public.conciliar_conta_fixa(p_transacao_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t     transacoes%ROWTYPE;
  v_hit RECORD;
BEGIN
  SELECT * INTO t FROM transacoes WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Só entra pagamento avulso já confirmado. A ocorrência gerada pelo
  -- cron (origem 'recorrente') não concilia consigo mesma.
  IF t.recorrencia_id IS NOT NULL
     OR t.tipo <> 'despesa'
     OR t.status_revisao <> 'confirmado'
     OR t.origem = 'recorrente' THEN
    RETURN NULL;
  END IF;

  SELECT o.id AS ocorrencia_id, r.id AS recorrencia_id
    INTO v_hit
  FROM transacoes o
  JOIN recorrencias r ON r.id = o.recorrencia_id
  WHERE o.workspace_id = t.workspace_id
    AND o.id <> t.id
    AND o.status_revisao = 'sugerido'
    AND o.tipo = 'despesa'
    -- Pago adiantado ou em atraso, dentro de dez dias do vencimento.
    AND o.data_transacao BETWEEN t.data_transacao - 10 AND t.data_transacao + 10
    AND combina_conta_fixa(t.valor, t.descricao, r.valor_previsto,
                           r.variacao_aceitavel_pct, r.descricao)
  ORDER BY similaridade_conta_fixa(r.descricao, t.descricao) DESC,
           abs(o.data_transacao - t.data_transacao)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM dar_baixa_conta_fixa(t.id, v_hit.ocorrencia_id, v_hit.recorrencia_id);
  RETURN v_hit.recorrencia_id;
END;
$fn$;

/**
 * Vencimento → pagamento. O espelho da anterior: chamada quando o cron
 * materializa uma ocorrência e o pagamento já tinha sido lançado antes.
 * Devolve o id do lançamento que deu a baixa, ou NULL.
 */
CREATE OR REPLACE FUNCTION public.conciliar_vencimento(p_ocorrencia_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  o     transacoes%ROWTYPE;
  r     recorrencias%ROWTYPE;
  v_pag uuid;
BEGIN
  SELECT * INTO o FROM transacoes WHERE id = p_ocorrencia_id;
  IF NOT FOUND OR o.recorrencia_id IS NULL OR o.status_revisao <> 'sugerido' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM recorrencias WHERE id = o.recorrencia_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT t.id INTO v_pag
  FROM transacoes t
  WHERE t.workspace_id = o.workspace_id
    AND t.id <> o.id
    AND t.recorrencia_id IS NULL          -- ainda não deu baixa em nada
    AND t.status_revisao = 'confirmado'
    AND t.tipo = 'despesa'
    AND t.origem <> 'recorrente'
    AND t.data_transacao BETWEEN o.data_transacao - 10 AND o.data_transacao + 10
    AND combina_conta_fixa(t.valor, t.descricao, r.valor_previsto,
                           r.variacao_aceitavel_pct, r.descricao)
  ORDER BY similaridade_conta_fixa(r.descricao, t.descricao) DESC,
           abs(t.data_transacao - o.data_transacao)
  LIMIT 1;

  IF v_pag IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM dar_baixa_conta_fixa(v_pag, o.id, r.id);
  RETURN v_pag;
END;
$fn$;

/** Desfaz uma baixa: solta o lançamento e reabre o vencimento. */
CREATE OR REPLACE FUNCTION public.desvincular_conta_fixa(p_transacao_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t transacoes%ROWTYPE;
BEGIN
  SELECT * INTO t FROM transacoes WHERE id = p_transacao_id;
  IF NOT FOUND OR t.recorrencia_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- A função é SECURITY DEFINER, então o RLS não roda aqui dentro: a
  -- checagem de acesso ao workspace precisa ser explícita.
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = t.workspace_id AND m.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'sem acesso a este workspace';
  END IF;

  -- Reabre o placeholder que esta baixa tinha aposentado.
  UPDATE transacoes
     SET status_revisao = 'sugerido'
   WHERE id = (
     SELECT o.id FROM transacoes o
     WHERE o.recorrencia_id = t.recorrencia_id
       AND o.status_revisao = 'rejeitado'
       AND o.origem = 'recorrente'
       AND o.data_transacao BETWEEN t.data_transacao - 10 AND t.data_transacao + 10
     ORDER BY abs(o.data_transacao - t.data_transacao)
     LIMIT 1
   );

  UPDATE transacoes SET recorrencia_id = NULL WHERE id = t.id;
  RETURN TRUE;
END;
$fn$;

/**
 * Dispara nos dois sentidos: lançamento confirmado procura vencimento
 * aberto; vencimento recém-materializado procura pagamento já lançado.
 */
CREATE OR REPLACE FUNCTION public.trg_conciliar_conta_fixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- A conciliação faz UPDATE em transacoes; sem isto ela se reentraria.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- Conciliação é conveniência: qualquer falha aqui vira aviso, nunca
  -- derruba o lançamento do usuário.
  BEGIN
    IF NEW.status_revisao = 'confirmado' AND NEW.recorrencia_id IS NULL THEN
      PERFORM conciliar_conta_fixa(NEW.id);
    ELSIF TG_OP = 'INSERT' AND NEW.status_revisao = 'sugerido'
          AND NEW.recorrencia_id IS NOT NULL THEN
      PERFORM conciliar_vencimento(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'conciliação de conta fixa falhou em %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS conciliar_conta_fixa_ai ON public.transacoes;
CREATE TRIGGER conciliar_conta_fixa_ai
AFTER INSERT OR UPDATE OF status_revisao ON public.transacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_conciliar_conta_fixa();

-- Funções SECURITY DEFINER nascem executáveis por PUBLIC. As três abaixo
-- escrevem em transacoes sem checar workspace (confiam em quem chama: o
-- trigger), então só o dono pode executá-las — exposta ao app fica apenas
-- `desvincular_conta_fixa`, que valida o acesso por conta própria.
REVOKE EXECUTE ON FUNCTION public.dar_baixa_conta_fixa(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.conciliar_conta_fixa(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.conciliar_vencimento(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.desvincular_conta_fixa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.similaridade_conta_fixa(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.combina_conta_fixa(numeric, text, numeric, numeric, text) TO authenticated;
