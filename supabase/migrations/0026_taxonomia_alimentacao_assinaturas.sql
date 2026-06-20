-- Revisão ampla da taxonomia (jun/2026)
-- - "Alimentação fora": remove subcategorias-lixo (Cinema/lanchonete, Taxa de serviço).
-- - "Alimentação em casa": reestrutura por TIPO de produto (absorve as subcats
--   granulares que a IA criou: laticínios, mercearia, peixes...).
-- - Consolida assinaturas/streaming num único lugar (Contas da casa).
-- - Move para o grupo certo as subcats que a IA pôs em "Alimentação em casa"
--   por engano (limpeza/descartáveis -> Casa), levando os itens junto.
-- - Remove a categoria "Viagem à Argentina" (viagem é EVENTO, não categoria).
-- Aplica no padrão canônico (categoria_templates) e nos workspaces existentes.

-- ============ PARTE A: padrão canônico (vale para novos workspaces) ============

-- Alimentação fora: tira o lixo e reordena o que sobra.
DELETE FROM categoria_templates WHERE slug IN ('alf_cinema', 'alf_taxa');
UPDATE categoria_templates SET ordem = 5 WHERE slug = 'alf_trabalho';
UPDATE categoria_templates SET ordem = 6 WHERE slug = 'alf_escolar';

-- Alimentação em casa: por tipo de produto.
DELETE FROM categoria_templates WHERE slug = 'alc_feira';
UPDATE categoria_templates SET nome = 'Carnes e aves', ordem = 3 WHERE slug = 'alc_carnes';
UPDATE categoria_templates SET ordem = 1 WHERE slug = 'alc_mercado';
UPDATE categoria_templates SET ordem = 2 WHERE slug = 'alc_hortifruti';
UPDATE categoria_templates SET ordem = 6 WHERE slug = 'alc_padaria';
UPDATE categoria_templates SET ordem = 8 WHERE slug = 'alc_bebidas';
UPDATE categoria_templates SET ordem = 9 WHERE slug = 'alc_doces';
INSERT INTO categoria_templates (nome, slug, parent_slug, comportamento, essencialidade_padrao, ordem, canonico)
SELECT v.nome, v.slug, 'alimentacao_casa', 'basico'::comportamento_categoria, v.ess::essencialidade, v.ordem, true
FROM (VALUES
  ('Peixes e frutos do mar', 'alc_peixes', 'essencial', 4),
  ('Laticínios e frios', 'alc_laticinios', 'essencial', 5),
  ('Mercearia', 'alc_mercearia', 'essencial', 7),
  ('Congelados', 'alc_congelados', 'necessario', 10)
) AS v(nome, slug, ess, ordem)
WHERE NOT EXISTS (SELECT 1 FROM categoria_templates t WHERE t.slug = v.slug);

-- Contas da casa: consolida "Streaming" + "Assinaturas" num só.
UPDATE categoria_templates SET nome = 'Assinaturas e streaming' WHERE slug = 'con_streaming';
DELETE FROM categoria_templates WHERE slug = 'con_assinaturas';

-- Lazer: remove "Assinaturas de entretenimento" (absorvido em Contas da casa).
DELETE FROM categoria_templates WHERE slug = 'laz_streaming';

-- ============ PARTE B: aplica nos workspaces existentes ============

-- Helper de sessão: reatribui TODAS as referências de uma categoria para outra
-- (itens, transações, orçamentos, recorrências, coleções, memória de produto/
-- estabelecimento) e então apaga a origem. No-op se origem/destino nulos.
CREATE FUNCTION pg_temp.remap_categoria(p_src uuid, p_dest uuid) RETURNS void AS $f$
BEGIN
  IF p_src IS NULL OR p_dest IS NULL OR p_src = p_dest THEN RETURN; END IF;
  UPDATE itens_transacao  SET categoria_id = p_dest WHERE categoria_id = p_src;
  UPDATE transacoes       SET categoria_id = p_dest WHERE categoria_id = p_src;
  UPDATE orcamentos       SET categoria_id = p_dest WHERE categoria_id = p_src;
  UPDATE recorrencias     SET categoria_id = p_dest WHERE categoria_id = p_src;
  UPDATE colecoes         SET categoria_id = p_dest WHERE categoria_id = p_src;
  UPDATE produtos         SET categoria_sugerida_id = p_dest WHERE categoria_sugerida_id = p_src;
  UPDATE estabelecimentos SET categoria_sugerida_id = p_dest WHERE categoria_sugerida_id = p_src;
  DELETE FROM categorias WHERE id = p_src;
END;
$f$ LANGUAGE plpgsql;

DO $$
DECLARE
  w RECORD;
  g_alim uuid;
  g_casa uuid;
  d_laticinios uuid;
  d_peixes uuid;
  d_mercearia uuid;
  d_carnes uuid;
  d_mercado uuid;
BEGIN
  FOR w IN SELECT id FROM workspaces LOOP
    SELECT id INTO g_alim FROM categorias WHERE workspace_id = w.id AND slug = 'alimentacao_casa';
    SELECT id INTO g_casa FROM categorias WHERE workspace_id = w.id AND slug = 'casa';

    -- Renomeios in-place (mantêm os lançamentos).
    UPDATE categorias SET nome = 'Carnes e aves' WHERE workspace_id = w.id AND slug = 'alc_carnes';
    UPDATE categorias SET nome = 'Assinaturas e streaming' WHERE workspace_id = w.id AND slug = 'con_streaming';

    IF g_alim IS NOT NULL THEN
      -- Reaproveita as subcats da IA como as canônicas (preserva os itens delas).
      UPDATE categorias SET nome = 'Laticínios e frios', slug = 'alc_laticinios',
             essencialidade_padrao = 'essencial', ordem = 5
        WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Laticínios'
          AND NOT EXISTS (SELECT 1 FROM categorias x WHERE x.workspace_id = w.id AND x.slug = 'alc_laticinios');
      UPDATE categorias SET nome = 'Peixes e frutos do mar', slug = 'alc_peixes',
             essencialidade_padrao = 'essencial', ordem = 4
        WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Peixes e Frutos do Mar'
          AND NOT EXISTS (SELECT 1 FROM categorias x WHERE x.workspace_id = w.id AND x.slug = 'alc_peixes');

      -- Garante as 4 subcats-alvo (cria se faltar).
      INSERT INTO categorias (workspace_id, nome, slug, categoria_pai_id, comportamento, essencialidade_padrao, ordem)
      SELECT w.id, v.nome, v.slug, g_alim, 'basico'::comportamento_categoria, v.ess::essencialidade, v.ordem
      FROM (VALUES
        ('Peixes e frutos do mar', 'alc_peixes', 'essencial', 4),
        ('Laticínios e frios', 'alc_laticinios', 'essencial', 5),
        ('Mercearia', 'alc_mercearia', 'essencial', 7),
        ('Congelados', 'alc_congelados', 'necessario', 10)
      ) AS v(nome, slug, ess, ordem)
      WHERE NOT EXISTS (SELECT 1 FROM categorias x WHERE x.workspace_id = w.id AND x.slug = v.slug);

      SELECT id INTO d_laticinios FROM categorias WHERE workspace_id = w.id AND slug = 'alc_laticinios';
      SELECT id INTO d_peixes     FROM categorias WHERE workspace_id = w.id AND slug = 'alc_peixes';
      SELECT id INTO d_mercearia  FROM categorias WHERE workspace_id = w.id AND slug = 'alc_mercearia';
      SELECT id INTO d_carnes     FROM categorias WHERE workspace_id = w.id AND slug = 'alc_carnes';
      SELECT id INTO d_mercado    FROM categorias WHERE workspace_id = w.id AND slug = 'alc_mercado';

      -- Consolida as demais subcats da IA nos alvos (leva os itens junto).
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Frios e embutidos'), d_laticinios);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Aves'), d_carnes);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Grãos e cereais'), d_mercearia);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Massas e farináceos'), d_mercearia);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Enlatados e conservas'), d_mercearia);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Temperos e condimentos'), d_mercearia);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Óleos e Gorduras'), d_mercearia);
      PERFORM pg_temp.remap_categoria((SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'alc_feira'), d_mercado);

      -- Subcats que a IA pôs em Alimentação por engano -> grupo Casa.
      IF g_casa IS NOT NULL THEN
        PERFORM pg_temp.remap_categoria(
          (SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Produtos de limpeza'),
          (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'cas_limpeza'));
        PERFORM pg_temp.remap_categoria(
          (SELECT id FROM categorias WHERE workspace_id = w.id AND categoria_pai_id = g_alim AND nome = 'Descartáveis e Papel'),
          (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'cas_higiene'));
      END IF;
    END IF;

    -- Alimentação fora: subcats-lixo -> destinos naturais (preserva lançamentos).
    PERFORM pg_temp.remap_categoria(
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'alf_cinema'),
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'alf_lanchonete'));
    PERFORM pg_temp.remap_categoria(
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'alf_taxa'),
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'alf_restaurante'));

    -- Assinaturas: tudo consolidado em Contas da casa › Assinaturas e streaming.
    PERFORM pg_temp.remap_categoria(
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'con_assinaturas'),
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'con_streaming'));
    PERFORM pg_temp.remap_categoria(
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'laz_streaming'),
      (SELECT id FROM categorias WHERE workspace_id = w.id AND slug = 'con_streaming'));

    -- "Viagem à Argentina": viagem é evento, não categoria. Remove se não tiver
    -- nada apontando (o evento/contexto de mesmo nome continua existindo).
    DELETE FROM categorias c
    WHERE c.workspace_id = w.id AND c.nome = 'Viagem à Argentina'
      AND NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.categoria_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM itens_transacao i WHERE i.categoria_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM categorias ch WHERE ch.categoria_pai_id = c.id);
  END LOOP;
END $$;
