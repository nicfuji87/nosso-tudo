-- =====================================================================
-- 0040. MATCH DE PRODUTO PELO NOME-BASE + FUSÃO DOS DUPLICADOS EXISTENTES
-- ---------------------------------------------------------------------
-- Com `nome_base` (0039), produtos que só diferem em medida ou na ordem
-- das palavras passam a ter a MESMA chave. Aqui isso vira:
--   1. match automático (score 1.0) — não gera pergunta na Pré-conferência;
--   2. fusão dos cadastros que já nasceram duplicados.
-- =====================================================================

/**
 * Candidatos a match. Ordem de certeza:
 *   1.00  nome_base idêntico  -> é o mesmo produto, não pergunte
 *   1.00  código de barras    -> idem (raro: a foto é da nota, não do produto)
 *   <1    similaridade fuzzy  -> vira sugestão para o usuário decidir
 */
CREATE OR REPLACE FUNCTION public.buscar_match_produto(
  p_workspace_id UUID,
  p_nome TEXT,
  p_codigo_barras TEXT DEFAULT NULL,
  p_threshold NUMERIC DEFAULT 0.50
) RETURNS TABLE(id UUID, nome TEXT, score NUMERIC) AS $fn$
DECLARE
  v_normalizado TEXT := normalizar_texto(p_nome);
  v_base        TEXT := nome_base_produto(p_nome);
BEGIN
  IF p_codigo_barras IS NOT NULL THEN
    RETURN QUERY
    SELECT p.id, p.nome, 1.00::NUMERIC
    FROM produtos p
    WHERE p.workspace_id = p_workspace_id AND p.codigo_barras = p_codigo_barras
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Identidade sem medida e com tokens ordenados: certeza, não pergunta.
  IF v_base <> '' THEN
    RETURN QUERY
    SELECT p.id, p.nome, 1.00::NUMERIC
    FROM produtos p
    WHERE p.workspace_id = p_workspace_id AND p.nome_base = v_base
    ORDER BY p.vezes_comprado DESC NULLS LAST, p.created_at
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Fuzzy: compara nome-base contra nome-base (a medida não conta pontos
  -- nem tira), com fallback nos apelidos.
  RETURN QUERY
  SELECT p.id, p.nome,
    GREATEST(
      similarity(p.nome_base, v_base),
      similarity(p.nome_normalizado, v_normalizado),
      COALESCE((SELECT MAX(similarity(nome_base_produto(a), v_base))
                  FROM unnest(p.apelidos) a), 0)
    )::NUMERIC AS score
  FROM produtos p
  WHERE p.workspace_id = p_workspace_id
    AND (p.nome_base % v_base
         OR p.nome_normalizado % v_normalizado
         OR EXISTS (SELECT 1 FROM unnest(p.apelidos) a WHERE nome_base_produto(a) % v_base))
  ORDER BY score DESC
  LIMIT 5;
END;
$fn$ LANGUAGE plpgsql STABLE SET search_path = public;

/**
 * Funde produtos que compartilham o mesmo nome_base. Mantém o mais
 * comprado (empate: o mais antigo), reaponta os itens, absorve apelidos
 * e nomes das variantes, e apaga o resto. Devolve quantos sumiram.
 */
CREATE OR REPLACE FUNCTION public.fundir_produtos_por_nome_base(p_workspace_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g        RECORD;
  v_manter UUID;
  v_apagar UUID[];
  v_total  INTEGER := 0;
BEGIN
  FOR g IN
    SELECT nome_base FROM produtos
    WHERE workspace_id = p_workspace_id AND COALESCE(nome_base,'') <> ''
    GROUP BY nome_base HAVING count(*) > 1
  LOOP
    SELECT id INTO v_manter FROM produtos
     WHERE workspace_id = p_workspace_id AND nome_base = g.nome_base
     ORDER BY COALESCE(vezes_comprado,0) DESC, created_at
     LIMIT 1;

    SELECT array_agg(id) INTO v_apagar FROM produtos
     WHERE workspace_id = p_workspace_id AND nome_base = g.nome_base AND id <> v_manter;

    -- Os nomes das variantes viram apelido: o histórico continua buscável.
    UPDATE produtos SET apelidos = (
      SELECT array_agg(DISTINCT x) FROM unnest(
        COALESCE(apelidos,'{}') ||
        COALESCE((SELECT array_agg(p2.nome) FROM produtos p2 WHERE p2.id = ANY(v_apagar)),'{}') ||
        COALESCE((SELECT array_agg(a) FROM produtos p2, unnest(COALESCE(p2.apelidos,'{}')) a
                   WHERE p2.id = ANY(v_apagar)),'{}')
      ) x WHERE x IS NOT NULL AND x <> nome)
    WHERE id = v_manter;

    UPDATE itens_transacao SET produto_id = v_manter WHERE produto_id = ANY(v_apagar);

    UPDATE produtos p SET vezes_comprado = (
      SELECT COUNT(*) FROM itens_transacao i WHERE i.produto_id = p.id)
    WHERE p.id = v_manter;

    -- Sugestões abertas sobre esses cadastros perderam o sentido.
    UPDATE sugestoes_match
       SET resolvida = TRUE, decisao = 'fundido automaticamente (mesma identidade sem medida)',
           decidido_em = NOW()
     WHERE workspace_id = p_workspace_id AND resolvida = FALSE
       AND (registro_origem_id = ANY(v_apagar) OR registro_sugerido_id = ANY(v_apagar)
            OR registro_origem_id = v_manter   OR registro_sugerido_id = v_manter);

    DELETE FROM produtos WHERE id = ANY(v_apagar);
    v_total := v_total + array_length(v_apagar, 1);
  END LOOP;

  RETURN v_total;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fundir_produtos_por_nome_base(uuid) FROM PUBLIC;
