-- =====================================================================
-- NOSSO TUDO — 0015: taxonomia canônica (Fase 4)
-- categoria_templates vira o PADRÃO DE REFERÊNCIA oficial: a "lista comum"
-- que mantém relatórios comparáveis. A IA ancora novas categorias nela.
-- Substitui o seed inicial pelo padrão rico da proposta (com essencialidade).
-- NÃO toca em categorias já existentes nos workspaces (templates não têm FK
-- com categorias). Workspaces atuais aplicam o padrão via sync_categorias_canonicas().
-- Ver PLANO-CATEGORIZACAO.md (Fase 4).
-- =====================================================================

-- 1. Flag de padrão oficial (futuras sugestões da IA podem ser não-canônicas até promoção)
ALTER TABLE categoria_templates
  ADD COLUMN IF NOT EXISTS canonico BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Substitui o blueprint pelo padrão canônico (só afeta provisionamento futuro)
DELETE FROM categoria_templates;

-- 2a. Categorias principais (pais)
INSERT INTO categoria_templates (nome, slug, icone, cor, parent_slug, essencialidade_padrao, ordem) VALUES
  ('Moradia',              'moradia',            '🏠', '#8B4513', NULL, 'essencial',   1),
  ('Contas da casa',       'contas_casa',        '🧾', '#0EA5E9', NULL, 'essencial',   2),
  ('Alimentação em casa',  'alimentacao_casa',   '🛒', '#FF6B35', NULL, 'essencial',   3),
  ('Alimentação fora',     'alimentacao_fora',   '🍽️', '#F97316', NULL, 'superfluo',   4),
  ('Casa',                 'casa',               '🛋️', '#A16207', NULL, 'necessario',  5),
  ('Transporte',           'transporte',         '🚗', '#4A90E2', NULL, 'necessario',  6),
  ('Saúde',                'saude',              '⚕️', '#E74C3C', NULL, 'essencial',   7),
  ('Educação',             'educacao',           '📚', '#9B59B6', NULL, 'essencial',   8),
  ('Filhos',               'filhos',             '🧒', '#EC4899', NULL, 'necessario',  9),
  ('Cuidados pessoais',    'cuidados_pessoais',  '💇', '#D946EF', NULL, 'necessario', 10),
  ('Serviços domésticos',  'servicos_domesticos','🧹', '#14B8A6', NULL, 'necessario', 11),
  ('Lazer',                'lazer',              '🎮', '#F39C12', NULL, 'superfluo',  12),
  ('Viagens',              'viagens',            '✈️', '#06B6D4', NULL, 'superfluo',  13),
  ('Pets',                 'pets',               '🐾', '#795548', NULL, 'necessario', 14),
  ('Tecnologia',           'tecnologia',         '💻', '#6366F1', NULL, 'necessario', 15),
  ('Impostos e burocracia','impostos',           '🏛️', '#64748B', NULL, 'essencial',  16),
  ('Presentes e doações',  'presentes',          '🎁', '#FFC107', NULL, 'superfluo',  17),
  ('Financeiro',           'financeiro',         '💳', '#475569', NULL, 'necessario', 18),
  ('Investimentos',        'investimentos',      '💰', '#2ECC71', NULL, 'investimento',19),
  ('Receitas',             'receitas',           '💵', '#27AE60', NULL, 'necessario', 20),
  ('Outros',               'outros',             '📦', '#95A5A6', NULL, 'necessario', 99);

-- 2b. Subcategorias (filhos)
INSERT INTO categoria_templates (nome, slug, parent_slug, essencialidade_padrao, ordem) VALUES
  -- Moradia
  ('Aluguel','mor_aluguel','moradia','essencial',1),
  ('Financiamento','mor_financiamento','moradia','essencial',2),
  ('Condomínio','mor_condominio','moradia','essencial',3),
  ('IPTU','mor_iptu','moradia','essencial',4),
  ('Seguro residencial','mor_seguro','moradia','necessario',5),
  ('Reforma','mor_reforma','moradia','necessario',6),
  ('Manutenção','mor_manutencao','moradia','necessario',7),
  -- Contas da casa
  ('Energia','con_energia','contas_casa','essencial',1),
  ('Água','con_agua','contas_casa','essencial',2),
  ('Gás','con_gas','contas_casa','essencial',3),
  ('Internet','con_internet','contas_casa','necessario',4),
  ('Celular','con_celular','contas_casa','necessario',5),
  ('Streaming','con_streaming','contas_casa','superfluo',6),
  ('Assinaturas','con_assinaturas','contas_casa','superfluo',7),
  -- Alimentação em casa
  ('Supermercado','alc_mercado','alimentacao_casa','essencial',1),
  ('Hortifruti','alc_hortifruti','alimentacao_casa','essencial',2),
  ('Carnes','alc_carnes','alimentacao_casa','essencial',3),
  ('Padaria','alc_padaria','alimentacao_casa','necessario',4),
  ('Feira','alc_feira','alimentacao_casa','essencial',5),
  ('Bebidas','alc_bebidas','alimentacao_casa','superfluo',6),
  ('Doces e snacks','alc_doces','alimentacao_casa','superfluo',7),
  -- Alimentação fora
  ('Restaurante','alf_restaurante','alimentacao_fora','superfluo',1),
  ('Delivery','alf_delivery','alimentacao_fora','superfluo',2),
  ('Lanchonete','alf_lanchonete','alimentacao_fora','superfluo',3),
  ('Café','alf_cafe','alimentacao_fora','superfluo',4),
  ('Cinema/lanchonete','alf_cinema','alimentacao_fora','superfluo',5),
  ('Alimentação no trabalho','alf_trabalho','alimentacao_fora','necessario',6),
  ('Alimentação escolar','alf_escolar','alimentacao_fora','necessario',7),
  ('Taxa de serviço','alf_taxa','alimentacao_fora','superfluo',8),
  -- Casa
  ('Limpeza','cas_limpeza','casa','necessario',1),
  ('Higiene da casa','cas_higiene','casa','necessario',2),
  ('Utilidades domésticas','cas_utilidades','casa','necessario',3),
  ('Decoração','cas_decoracao','casa','superfluo',4),
  ('Móveis','cas_moveis','casa','necessario',5),
  ('Cama, mesa e banho','cas_cama_mesa','casa','necessario',6),
  ('Ferramentas','cas_ferramentas','casa','necessario',7),
  -- Transporte
  ('Combustível','tra_combustivel','transporte','necessario',1),
  ('Estacionamento','tra_estacionamento','transporte','necessario',2),
  ('Pedágio','tra_pedagio','transporte','necessario',3),
  ('Aplicativo/táxi','tra_apps','transporte','necessario',4),
  ('Transporte público','tra_publico','transporte','necessario',5),
  ('Manutenção do veículo','tra_manutencao','transporte','necessario',6),
  ('Seguro auto','tra_seguro','transporte','necessario',7),
  ('IPVA','tra_ipva','transporte','essencial',8),
  ('Licenciamento','tra_licenciamento','transporte','essencial',9),
  ('Multas','tra_multas','transporte','superfluo',10),
  -- Saúde
  ('Medicamentos','sau_medicamentos','saude','essencial',1),
  ('Consultas','sau_consultas','saude','essencial',2),
  ('Exames','sau_exames','saude','essencial',3),
  ('Plano de saúde','sau_plano','saude','essencial',4),
  ('Dentista','sau_dentista','saude','necessario',5),
  ('Óculos/lentes','sau_oculos','saude','necessario',6),
  ('Terapias','sau_terapias','saude','necessario',7),
  ('Vacinas','sau_vacinas','saude','essencial',8),
  -- Educação
  ('Escola','edu_escola','educacao','essencial',1),
  ('Material escolar','edu_material','educacao','essencial',2),
  ('Cursos','edu_cursos','educacao','investimento',3),
  ('Livros','edu_livros','educacao','necessario',4),
  ('Reforço','edu_reforco','educacao','necessario',5),
  ('Transporte escolar','edu_transporte','educacao','necessario',6),
  -- Filhos
  ('Roupas infantis','fil_roupas','filhos','necessario',1),
  ('Calçados infantis','fil_calcados','filhos','necessario',2),
  ('Brinquedos','fil_brinquedos','filhos','superfluo',3),
  ('Mesada','fil_mesada','filhos','necessario',4),
  ('Atividades extracurriculares','fil_atividades','filhos','necessario',5),
  ('Festas','fil_festas','filhos','superfluo',6),
  -- Cuidados pessoais
  ('Higiene pessoal','cui_higiene','cuidados_pessoais','essencial',1),
  ('Cabelo','cui_cabelo','cuidados_pessoais','necessario',2),
  ('Cosméticos','cui_cosmeticos','cuidados_pessoais','superfluo',3),
  ('Perfumaria','cui_perfumaria','cuidados_pessoais','superfluo',4),
  ('Academia','cui_academia','cuidados_pessoais','necessario',5),
  ('Roupas','cui_roupas','cuidados_pessoais','necessario',6),
  ('Calçados','cui_calcados','cuidados_pessoais','necessario',7),
  ('Lavanderia','cui_lavanderia','cuidados_pessoais','necessario',8),
  -- Serviços domésticos
  ('Empregada doméstica','ser_empregada','servicos_domesticos','necessario',1),
  ('Diarista','ser_diarista','servicos_domesticos','necessario',2),
  ('Babá','ser_baba','servicos_domesticos','necessario',3),
  ('Encargos','ser_encargos','servicos_domesticos','necessario',4),
  ('Benefícios','ser_beneficios','servicos_domesticos','necessario',5),
  ('13º/férias','ser_13_ferias','servicos_domesticos','necessario',6),
  ('Rescisão','ser_rescisao','servicos_domesticos','necessario',7),
  -- Lazer
  ('Cinema','laz_cinema','lazer','superfluo',1),
  ('Shows','laz_shows','lazer','superfluo',2),
  ('Passeios','laz_passeios','lazer','superfluo',3),
  ('Clube','laz_clube','lazer','superfluo',4),
  ('Hobbies','laz_hobbies','lazer','superfluo',5),
  ('Games','laz_games','lazer','superfluo',6),
  ('Eventos','laz_eventos','lazer','superfluo',7),
  ('Assinaturas de entretenimento','laz_streaming','lazer','superfluo',8),
  -- Viagens
  ('Passagem','via_passagem','viagens','superfluo',1),
  ('Hospedagem','via_hospedagem','viagens','superfluo',2),
  ('Alimentação em viagem','via_alimentacao','viagens','superfluo',3),
  ('Passeios','via_passeios','viagens','superfluo',4),
  ('Seguro viagem','via_seguro','viagens','necessario',5),
  ('Aluguel de carro','via_aluguel_carro','viagens','superfluo',6),
  ('Compras de viagem','via_compras','viagens','superfluo',7),
  -- Pets
  ('Ração','pet_racao','pets','essencial',1),
  ('Petiscos','pet_petiscos','pets','superfluo',2),
  ('Veterinário','pet_veterinario','pets','essencial',3),
  ('Vacinas','pet_vacinas','pets','essencial',4),
  ('Medicamentos','pet_medicamentos','pets','essencial',5),
  ('Banho e tosa','pet_banho_tosa','pets','necessario',6),
  ('Acessórios','pet_acessorios','pets','superfluo',7),
  -- Tecnologia
  ('Celular','tec_celular','tecnologia','necessario',1),
  ('Computador','tec_computador','tecnologia','necessario',2),
  ('Acessórios','tec_acessorios','tecnologia','superfluo',3),
  ('Softwares','tec_softwares','tecnologia','necessario',4),
  ('Aplicativos','tec_aplicativos','tecnologia','superfluo',5),
  ('Armazenamento','tec_armazenamento','tecnologia','necessario',6),
  -- Impostos e burocracia
  ('Imposto de renda','imp_irpf','impostos','essencial',1),
  ('Cartório','imp_cartorio','impostos','necessario',2),
  ('Documentos','imp_documentos','impostos','necessario',3),
  ('Contador','imp_contador','impostos','necessario',4),
  ('Taxas e tarifas','imp_taxas','impostos','necessario',5),
  -- Presentes e doações
  ('Presentes','pre_presentes','presentes','superfluo',1),
  ('Doações','pre_doacoes','presentes','superfluo',2),
  ('Dízimo/ofertas','pre_dizimo','presentes','necessario',3),
  ('Ajuda familiar','pre_ajuda','presentes','necessario',4),
  ('Datas comemorativas','pre_datas','presentes','superfluo',5),
  -- Financeiro
  ('Juros','fin_juros','financeiro','superfluo',1),
  ('Multas','fin_multas','financeiro','superfluo',2),
  ('Empréstimos','fin_emprestimos','financeiro','necessario',3),
  ('Parcelamentos','fin_parcelamentos','financeiro','necessario',4),
  ('Tarifas bancárias','fin_tarifas','financeiro','necessario',5),
  ('Anuidade de cartão','fin_anuidade','financeiro','necessario',6),
  -- Investimentos
  ('Reserva de emergência','inv_reserva','investimentos','investimento',1),
  ('Aportes','inv_aportes','investimentos','investimento',2),
  ('Previdência','inv_previdencia','investimentos','investimento',3),
  -- Receitas
  ('Salário','rec_salario','receitas','necessario',1),
  ('Freelance/extra','rec_freela','receitas','necessario',2),
  ('Rendimentos','rec_rendimentos','receitas','necessario',3),
  ('Reembolso','rec_reembolso','receitas','necessario',4);

-- 3. provisionar_workspace passa a copiar essencialidade_padrao para as categorias
CREATE OR REPLACE FUNCTION provisionar_workspace(
  p_nome TEXT,
  p_owner_id UUID,
  p_slug TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
  v_plan_free_id UUID;
  v_slug TEXT;
  v_template RECORD;
  v_categoria_pai_map JSONB := '{}';
  v_cat_pai_id UUID;
BEGIN
  v_slug := COALESCE(p_slug, lower(regexp_replace(unaccent(p_nome), '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := v_slug || '-' || substring(gen_random_uuid()::text, 1, 6);

  SELECT id INTO v_plan_free_id FROM plans WHERE slug = 'free' LIMIT 1;

  INSERT INTO workspaces (nome, slug, owner_id, plan_id, subscription_status)
  VALUES (p_nome, v_slug, p_owner_id, v_plan_free_id, 'free')
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, profile_id, role)
  VALUES (v_workspace_id, p_owner_id, 'owner');

  INSERT INTO entidades (workspace_id, nome, tipo)
  VALUES (v_workspace_id, 'Casa', 'grupo');

  FOR v_template IN
    SELECT * FROM categoria_templates WHERE parent_slug IS NULL ORDER BY ordem
  LOOP
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, comportamento, essencialidade_padrao, ordem)
    VALUES (v_workspace_id, v_template.nome, v_template.slug, v_template.icone,
            v_template.cor, v_template.comportamento, v_template.essencialidade_padrao, v_template.ordem)
    RETURNING id INTO v_cat_pai_id;
    v_categoria_pai_map := v_categoria_pai_map || jsonb_build_object(v_template.slug, v_cat_pai_id);
  END LOOP;

  FOR v_template IN
    SELECT * FROM categoria_templates WHERE parent_slug IS NOT NULL ORDER BY ordem
  LOOP
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, categoria_pai_id, essencialidade_padrao, ordem)
    VALUES (v_workspace_id, v_template.nome, v_template.slug, v_template.icone,
            v_template.cor,
            (v_categoria_pai_map->>v_template.parent_slug)::UUID,
            v_template.essencialidade_padrao, v_template.ordem);
  END LOOP;

  UPDATE profiles SET default_workspace_id = v_workspace_id
  WHERE id = p_owner_id AND default_workspace_id IS NULL;

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Aplica o padrão canônico a um workspace existente (aditivo, idempotente por slug)
CREATE OR REPLACE FUNCTION sync_categorias_canonicas(p_workspace_id UUID)
RETURNS INT AS $$
DECLARE
  v_t RECORD;
  v_pai UUID;
  v_count INT := 0;
BEGIN
  IF p_workspace_id NOT IN (SELECT user_workspaces()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- Pais
  FOR v_t IN SELECT * FROM categoria_templates WHERE parent_slug IS NULL ORDER BY ordem LOOP
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, comportamento, essencialidade_padrao, ordem)
    SELECT p_workspace_id, v_t.nome, v_t.slug, v_t.icone, v_t.cor, v_t.comportamento, v_t.essencialidade_padrao, v_t.ordem
    WHERE NOT EXISTS (
      SELECT 1 FROM categorias c WHERE c.workspace_id = p_workspace_id AND c.slug = v_t.slug
    );
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- Filhos
  FOR v_t IN SELECT * FROM categoria_templates WHERE parent_slug IS NOT NULL ORDER BY ordem LOOP
    SELECT id INTO v_pai FROM categorias
      WHERE workspace_id = p_workspace_id AND slug = v_t.parent_slug;
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, categoria_pai_id, essencialidade_padrao, ordem)
    SELECT p_workspace_id, v_t.nome, v_t.slug, v_t.icone, v_t.cor, v_pai, v_t.essencialidade_padrao, v_t.ordem
    WHERE NOT EXISTS (
      SELECT 1 FROM categorias c WHERE c.workspace_id = p_workspace_id AND c.slug = v_t.slug
    );
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
