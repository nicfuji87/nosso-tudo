-- =====================================================================
-- NOSSO TUDO — 0016: match de categoria ancorado no padrão (Fase 5)
-- A IA/ingest usa isto para casar um nome de categoria vindo do WhatsApp
-- contra o padrão canônico do workspace (nome + slug), via pg_trgm.
-- Mesma disciplina de buscar_match_estabelecimento/produto.
-- =====================================================================
CREATE OR REPLACE FUNCTION buscar_match_categoria(
  p_workspace_id UUID,
  p_nome TEXT,
  p_threshold NUMERIC DEFAULT 0.40
) RETURNS TABLE(id UUID, nome TEXT, slug TEXT, score NUMERIC) AS $$
DECLARE
  v_norm TEXT := normalizar_texto(p_nome);
BEGIN
  RETURN QUERY
  SELECT c.id, c.nome, c.slug,
    GREATEST(
      similarity(normalizar_texto(c.nome), v_norm),
      similarity(c.slug, v_norm)
    )::NUMERIC AS score
  FROM categorias c
  WHERE c.workspace_id = p_workspace_id
    AND c.ativa = TRUE
    AND (
      normalizar_texto(c.nome) % v_norm
      OR c.slug % v_norm
    )
  ORDER BY score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;
