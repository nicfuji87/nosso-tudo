-- =====================================================================
-- NOSSO TUDO - SCHEMA SUPABASE (SaaS Multi-tenant)
-- Versão 2.0
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =====================================================================
-- 1. ENUMS
-- =====================================================================
CREATE TYPE workspace_role AS ENUM ('owner', 'member');

CREATE TYPE subscription_status AS ENUM (
  'trial', 'active', 'past_due', 'canceled', 'free'
);

CREATE TYPE tipo_entidade AS ENUM ('pessoa', 'grupo');

CREATE TYPE comportamento_categoria AS ENUM (
  'basico',       -- categoria comum
  'projeto',      -- viagem, festa, reforma (datas, orçamento, participantes)
  'compromisso'   -- compra coletiva, encomenda (workflow de status)
);

CREATE TYPE status_colecao_projeto AS ENUM (
  'planejado', 'em_andamento', 'concluido', 'cancelado'
);

CREATE TYPE status_colecao_compromisso AS ENUM (
  'aberto', 'confirmado', 'aguardando_envio',
  'recebido', 'pago', 'cancelado'
);

CREATE TYPE tipo_transacao AS ENUM (
  'despesa', 'receita', 'transferencia',
  'investimento_aporte', 'investimento_resgate'
);

CREATE TYPE meio_pagamento AS ENUM (
  'cartao_credito', 'cartao_debito', 'pix', 'dinheiro',
  'transferencia', 'boleto', 'vr', 'va', 'cartao_escola', 'outro'
);

CREATE TYPE status_conciliacao AS ENUM (
  'nao_conciliado', 'conciliado', 'pendente_revisao'
);

CREATE TYPE origem_transacao AS ENUM (
  'whatsapp', 'fatura_cartao', 'manual', 'recorrente', 'importacao', 'app'
);

CREATE TYPE tipo_midia AS ENUM (
  'imagem', 'pdf', 'audio', 'video', 'texto', 'documento'
);

CREATE TYPE frequencia_recorrencia AS ENUM (
  'diaria', 'semanal', 'quinzenal', 'mensal',
  'bimestral', 'trimestral', 'semestral', 'anual'
);

CREATE TYPE status_fatura AS ENUM (
  'aberta', 'fechada', 'paga', 'em_processamento', 'atrasada'
);

CREATE TYPE tipo_investimento AS ENUM (
  'renda_fixa', 'tesouro', 'acoes', 'fundos',
  'previdencia', 'cripto', 'imovel', 'outros'
);

CREATE TYPE tipo_conta_bancaria AS ENUM (
  'corrente', 'poupanca', 'salario', 'pagamento', 'investimento'
);

CREATE TYPE papel_ia AS ENUM ('user', 'assistant', 'system');

CREATE TYPE status_revisao AS ENUM (
  'confirmado',    -- aprovado pelo usuário ou auto-confirmado (alta confiança)
  'sugerido',      -- IA sugeriu match com algo existente, aguardando confirmação
  'novo',          -- registro novo, sem match — usuário pode ajustar
  'rejeitado'      -- usuário rejeitou a sugestão (vira novo registro independente)
);

CREATE TYPE tipo_entidade_sugestao AS ENUM (
  'estabelecimento', 'produto', 'categoria', 'entidade'
);

-- =====================================================================
-- 2. TRIGGER updated_at
-- =====================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. PLANS (globais)
-- =====================================================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_mensal_brl NUMERIC(10,2),
  preco_anual_brl NUMERIC(10,2),
  exibe_anuncios BOOLEAN DEFAULT FALSE,
  limites JSONB DEFAULT '{}',
  features JSONB DEFAULT '{}',
  ativo BOOLEAN DEFAULT TRUE,
  ordem INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (slug, nome, descricao, preco_mensal_brl, exibe_anuncios, limites, features, ordem) VALUES
  ('free', 'Free', 'Para começar — com anúncios e limites', 0, TRUE,
   '{"max_transacoes_mes": 100, "max_cartoes": 1, "max_contas": 2, "max_membros_com_acesso": 1, "max_colecoes_ativas": 1, "max_anexos_por_mes": 20}',
   '{"whatsapp": false, "ia_chat": false, "conciliacao_pdf": false, "investimentos": false, "relatorios_avancados": false, "recorrencias": true, "categorias_comportamento": true}',
   1),
  ('pro', 'Pro', 'Para a família toda — sem anúncios, tudo liberado', 19.90, FALSE,
   '{"max_transacoes_mes": null, "max_cartoes": null, "max_contas": null, "max_membros_com_acesso": 6, "max_colecoes_ativas": null, "max_anexos_por_mes": null}',
   '{"whatsapp": true, "ia_chat": true, "conciliacao_pdf": true, "investimentos": true, "relatorios_avancados": true, "recorrencias": true, "categorias_comportamento": true, "exportacao": true, "metas": true}',
   2);

-- =====================================================================
-- 4. PROFILES (vinculado a auth.users)
-- =====================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  telefone TEXT,
  avatar_url TEXT,
  default_workspace_id UUID,
  onboarding_concluido BOOLEAN DEFAULT FALSE,
  aceitou_termos_em TIMESTAMPTZ,
  aceitou_privacidade_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER tg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 5. WORKSPACES (cada família = 1 workspace)
-- =====================================================================
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  moeda_principal TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  settings JSONB DEFAULT '{}',
  plan_id UUID NOT NULL REFERENCES plans(id),
  subscription_status subscription_status NOT NULL DEFAULT 'free',
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  asaas_customer_id TEXT,           -- ID do customer no Asaas
  asaas_subscription_id TEXT,       -- ID da assinatura no Asaas
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_asaas ON workspaces(asaas_customer_id);
CREATE TRIGGER tg_workspaces_updated BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE profiles
  ADD CONSTRAINT fk_profile_default_workspace
  FOREIGN KEY (default_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;

-- =====================================================================
-- 6. WORKSPACE_MEMBERS (quem tem acesso)
-- Crianças sem acesso ficam apenas em 'entidades'
-- =====================================================================
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, profile_id)
);
CREATE INDEX idx_ws_members_profile ON workspace_members(profile_id);

-- =====================================================================
-- 7. INVITATIONS
-- =====================================================================
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role workspace_role NOT NULL DEFAULT 'member',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  entidade_alvo_id UUID,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inv_workspace ON invitations(workspace_id);
CREATE INDEX idx_inv_email ON invitations(email);

-- =====================================================================
-- 8. WHATSAPP_ROUTING
-- =====================================================================
CREATE TABLE whatsapp_routing (
  telefone TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  verificado BOOLEAN DEFAULT FALSE,
  codigo_verificacao TEXT,
  verificado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wa_workspace ON whatsapp_routing(workspace_id);

-- =====================================================================
-- 9. ENTIDADES (pessoas + grupos, escopo por workspace)
-- Crianças sem acesso ficam aqui, podem ser linkadas a profile depois
-- =====================================================================
CREATE TABLE entidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo tipo_entidade NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cor TEXT,
  icone TEXT,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, nome)
);
CREATE INDEX idx_entidades_ws ON entidades(workspace_id);

-- =====================================================================
-- 10. CATEGORIA_TEMPLATES (catálogo global, copiado para cada workspace novo)
-- =====================================================================
CREATE TABLE categoria_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icone TEXT,
  cor TEXT,
  parent_slug TEXT,
  comportamento comportamento_categoria DEFAULT 'basico',
  ordem INT DEFAULT 0
);

-- =====================================================================
-- 11. CATEGORIAS (por workspace, com comportamento)
-- =====================================================================
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  icone TEXT,
  cor TEXT,
  categoria_pai_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  comportamento comportamento_categoria NOT NULL DEFAULT 'basico',
  ordem INT DEFAULT 0,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);
CREATE INDEX idx_categorias_ws ON categorias(workspace_id);
CREATE INDEX idx_categorias_pai ON categorias(categoria_pai_id);
CREATE INDEX idx_categorias_comp ON categorias(comportamento) WHERE comportamento != 'basico';

-- =====================================================================
-- 12. COLEÇÕES (instâncias de categorias projeto/compromisso)
-- =====================================================================
CREATE TABLE colecoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  descricao TEXT,

  -- 'projeto' (viagem, festa, reforma)
  data_inicio DATE,
  data_fim DATE,
  orcamento_previsto NUMERIC(12,2),
  moeda TEXT DEFAULT 'BRL',
  participantes UUID[] DEFAULT '{}',
  status_projeto status_colecao_projeto,

  -- 'compromisso' (compra coletiva, encomenda)
  organizador TEXT,
  responsavel_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  valor_estimado NUMERIC(12,2),
  valor_final NUMERIC(12,2),
  data_pedido DATE,
  data_estimada_entrega DATE,
  data_confirmacao DATE,
  data_entrega_real DATE,
  data_pagamento DATE,
  status_compromisso status_colecao_compromisso,

  cor TEXT,
  icone TEXT,
  midia_capa_id UUID,
  metadados JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_colecoes_ws ON colecoes(workspace_id);
CREATE INDEX idx_colecoes_cat ON colecoes(categoria_id);
CREATE INDEX idx_colecoes_status_p ON colecoes(status_projeto) WHERE status_projeto IS NOT NULL;
CREATE INDEX idx_colecoes_status_c ON colecoes(status_compromisso) WHERE status_compromisso IS NOT NULL;
CREATE TRIGGER tg_colecoes_updated BEFORE UPDATE ON colecoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 13. ITENS DE COLEÇÃO
-- =====================================================================
CREATE TABLE itens_colecao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  colecao_id UUID NOT NULL REFERENCES colecoes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade INT DEFAULT 1,
  valor_unitario_estimado NUMERIC(12,2),
  valor_unitario_final NUMERIC(12,2),
  atributos JSONB DEFAULT '{}',
  ordem INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_itens_colecao ON itens_colecao(colecao_id);

-- =====================================================================
-- 14. ESTABELECIMENTOS
-- =====================================================================
CREATE TABLE estabelecimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  cnpj TEXT,
  apelidos TEXT[] DEFAULT '{}',
  categoria_sugerida_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  cidade TEXT,
  observacoes TEXT,
  status_revisao status_revisao DEFAULT 'confirmado',  -- 'novo' quando criado por IA, 'confirmado' quando user aprovou
  origem_criacao origem_transacao,                     -- por onde foi criado
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_estab_ws ON estabelecimentos(workspace_id);
CREATE INDEX idx_estab_nome_trgm ON estabelecimentos USING gin (nome_normalizado gin_trgm_ops);
CREATE INDEX idx_estab_apelidos ON estabelecimentos USING gin (apelidos);

-- =====================================================================
-- 15. CONTAS BANCÁRIAS
-- =====================================================================
CREATE TABLE contas_bancarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titular_id UUID NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT,
  banco TEXT NOT NULL,
  apelido TEXT NOT NULL,
  tipo tipo_conta_bancaria DEFAULT 'corrente',
  agencia TEXT,
  numero TEXT,
  eh_conta_compartilhada BOOLEAN DEFAULT FALSE,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_contas_ws ON contas_bancarias(workspace_id);
CREATE TRIGGER tg_contas_updated BEFORE UPDATE ON contas_bancarias
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 16. CARTÕES
-- =====================================================================
CREATE TABLE cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titular_id UUID NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT,
  banco TEXT NOT NULL,
  bandeira TEXT,
  apelido TEXT NOT NULL,
  ultimos_digitos TEXT,
  dia_fechamento SMALLINT CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite NUMERIC(12,2),
  conta_pagamento_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cartoes_ws ON cartoes(workspace_id);
CREATE TRIGGER tg_cartoes_updated BEFORE UPDATE ON cartoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 17. MÍDIAS
-- =====================================================================
CREATE TABLE midias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo tipo_midia NOT NULL,
  nome_original TEXT,
  tamanho_bytes BIGINT,
  mime_type TEXT,
  origem TEXT,
  whatsapp_telefone TEXT,
  enviado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  texto_extraido TEXT,
  metadados JSONB DEFAULT '{}',
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_midias_ws ON midias(workspace_id);
CREATE INDEX idx_midias_processado ON midias(workspace_id, processado);

ALTER TABLE colecoes
  ADD CONSTRAINT fk_colecao_capa
  FOREIGN KEY (midia_capa_id) REFERENCES midias(id) ON DELETE SET NULL;

-- =====================================================================
-- 18. RECORRÊNCIAS
-- =====================================================================
CREATE TABLE recorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo tipo_transacao NOT NULL DEFAULT 'despesa',
  valor_previsto NUMERIC(12,2) NOT NULL,
  variacao_aceitavel_pct NUMERIC(5,2) DEFAULT 10.0,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  pagador_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  beneficiario_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  meio_pagamento meio_pagamento,
  cartao_id UUID REFERENCES cartoes(id) ON DELETE SET NULL,
  conta_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  estabelecimento_id UUID REFERENCES estabelecimentos(id) ON DELETE SET NULL,
  frequencia frequencia_recorrencia NOT NULL DEFAULT 'mensal',
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  proxima_geracao DATE,
  ultima_geracao DATE,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recorrencias_ws ON recorrencias(workspace_id);
CREATE INDEX idx_recorrencias_proxima ON recorrencias(ativa, proxima_geracao);
CREATE TRIGGER tg_recorrencias_updated BEFORE UPDATE ON recorrencias
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 19. FATURAS DE CARTÃO
-- =====================================================================
CREATE TABLE faturas_cartao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  mes_referencia DATE NOT NULL,
  data_fechamento DATE,
  data_vencimento DATE,
  valor_total NUMERIC(12,2),
  valor_pago NUMERIC(12,2) DEFAULT 0,
  status status_fatura DEFAULT 'aberta',
  midia_id UUID REFERENCES midias(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cartao_id, mes_referencia)
);
CREATE INDEX idx_faturas_ws ON faturas_cartao(workspace_id);
CREATE TRIGGER tg_faturas_updated BEFORE UPDATE ON faturas_cartao
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 20. TRANSAÇÕES (central)
-- =====================================================================
CREATE TABLE transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tipo tipo_transacao NOT NULL DEFAULT 'despesa',
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  moeda TEXT DEFAULT 'BRL',
  valor_brl NUMERIC(12,2),
  taxa_cambio NUMERIC(12,6),
  data_transacao DATE NOT NULL,
  data_lancamento TIMESTAMPTZ DEFAULT NOW(),
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  pagador_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  beneficiario_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  meio_pagamento meio_pagamento,
  cartao_id UUID REFERENCES cartoes(id) ON DELETE SET NULL,
  conta_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  estabelecimento_id UUID REFERENCES estabelecimentos(id) ON DELETE SET NULL,
  colecao_id UUID REFERENCES colecoes(id) ON DELETE SET NULL,
  eh_parcelado BOOLEAN DEFAULT FALSE,
  total_parcelas SMALLINT DEFAULT 1,
  numero_parcela SMALLINT DEFAULT 1,
  transacao_pai_id UUID REFERENCES transacoes(id) ON DELETE CASCADE,
  recorrencia_id UUID REFERENCES recorrencias(id) ON DELETE SET NULL,
  status_conciliacao status_conciliacao DEFAULT 'nao_conciliado',
  fatura_id UUID REFERENCES faturas_cartao(id) ON DELETE SET NULL,
  investimento_id UUID,
  tags TEXT[] DEFAULT '{}',
  observacoes TEXT,
  origem origem_transacao DEFAULT 'manual',
  midia_id UUID REFERENCES midias(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Revisão (transações criadas por IA podem precisar de confirmação)
  status_revisao status_revisao DEFAULT 'confirmado',
  score_confianca NUMERIC(3,2),  -- 0.00 a 1.00, preenchido quando IA cria

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tx_ws_data ON transacoes(workspace_id, data_transacao DESC);
CREATE INDEX idx_tx_categoria ON transacoes(workspace_id, categoria_id);
CREATE INDEX idx_tx_pagador ON transacoes(workspace_id, pagador_id);
CREATE INDEX idx_tx_beneficiario ON transacoes(workspace_id, beneficiario_id);
CREATE INDEX idx_tx_cartao ON transacoes(workspace_id, cartao_id);
CREATE INDEX idx_tx_conta ON transacoes(workspace_id, conta_id);
CREATE INDEX idx_tx_colecao ON transacoes(workspace_id, colecao_id);
CREATE INDEX idx_tx_fatura ON transacoes(workspace_id, fatura_id);
CREATE INDEX idx_tx_status_conc ON transacoes(workspace_id, status_conciliacao);
CREATE INDEX idx_tx_pai ON transacoes(transacao_pai_id);
CREATE INDEX idx_tx_tags ON transacoes USING gin (tags);
CREATE INDEX idx_tx_revisao ON transacoes(workspace_id, status_revisao) WHERE status_revisao != 'confirmado';
CREATE TRIGGER tg_transacoes_updated BEFORE UPDATE ON transacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 21. INVESTIMENTOS
-- =====================================================================
CREATE TABLE investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titular_id UUID NOT NULL REFERENCES entidades(id) ON DELETE RESTRICT,
  tipo tipo_investimento NOT NULL,
  instituicao TEXT,
  descricao TEXT NOT NULL,
  valor_aplicado_total NUMERIC(12,2) DEFAULT 0,
  valor_atual NUMERIC(12,2),
  data_ultima_atualizacao DATE,
  data_aplicacao_inicial DATE,
  data_vencimento DATE,
  rentabilidade_esperada TEXT,
  liquidez TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_inv_ws ON investimentos(workspace_id);
CREATE TRIGGER tg_inv_updated BEFORE UPDATE ON investimentos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE transacoes
  ADD CONSTRAINT fk_tx_investimento
  FOREIGN KEY (investimento_id) REFERENCES investimentos(id) ON DELETE SET NULL;

-- =====================================================================
-- 22. METAS
-- =====================================================================
CREATE TABLE metas_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  valor_alvo NUMERIC(12,2) NOT NULL,
  valor_atual NUMERIC(12,2) DEFAULT 0,
  data_alvo DATE,
  investimento_id UUID REFERENCES investimentos(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES entidades(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_metas_ws ON metas_financeiras(workspace_id);
CREATE TRIGGER tg_metas_updated BEFORE UPDATE ON metas_financeiras
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 23. ORÇAMENTOS
-- =====================================================================
CREATE TABLE orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  entidade_id UUID REFERENCES entidades(id) ON DELETE CASCADE,
  mes_referencia DATE NOT NULL,
  valor_planejado NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, categoria_id, entidade_id, mes_referencia)
);
CREATE INDEX idx_orc_ws ON orcamentos(workspace_id);
CREATE TRIGGER tg_orcamentos_updated BEFORE UPDATE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 24. CHAT COM IA (feature Pro)
-- =====================================================================
CREATE TABLE conversas_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titulo TEXT,
  contexto JSONB DEFAULT '{}',
  arquivada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conv_ws_profile ON conversas_ia(workspace_id, profile_id);
CREATE TRIGGER tg_conv_updated BEFORE UPDATE ON conversas_ia
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE mensagens_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES conversas_ia(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  papel papel_ia NOT NULL,
  conteudo TEXT NOT NULL,
  ferramentas_usadas JSONB DEFAULT '[]',
  tokens_input INT,
  tokens_output INT,
  modelo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_msg_conv ON mensagens_ia(conversa_id);

-- =====================================================================
-- 25. AUDIT LOG
-- =====================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  tabela TEXT NOT NULL,
  registro_id UUID NOT NULL,
  acao TEXT NOT NULL,
  alterado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  dados_antes JSONB,
  dados_depois JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_ws ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_registro ON audit_log(tabela, registro_id);

-- =====================================================================
-- 25b. PRODUTOS (catálogo opcional do workspace, populado por IA + uso)
-- Permite rastrear itens específicos entre transações (ex: preço do
-- mesmo detergente em mercados diferentes ao longo do tempo).
-- Habilitar via workspace.settings.modo_detalhado = true (Pro opt-in).
-- =====================================================================
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,           -- lowercase, sem acento, sem pontuação
  apelidos TEXT[] DEFAULT '{}',             -- ['detergente ype', 'deterg limpeza', 'det ype']
  marca TEXT,
  unidade_padrao TEXT,                      -- 'un', 'kg', 'l', '500ml'
  categoria_sugerida_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  codigo_barras TEXT,                       -- EAN/GTIN se disponível na nota
  ultimo_preco_unitario NUMERIC(10,2),
  ultimo_estabelecimento_id UUID REFERENCES estabelecimentos(id) ON DELETE SET NULL,
  ultima_compra_em DATE,
  vezes_comprado INT DEFAULT 0,             -- contador, ajuda no ranking
  status_revisao status_revisao DEFAULT 'novo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_produtos_ws ON produtos(workspace_id);
CREATE INDEX idx_produtos_nome_trgm ON produtos USING gin (nome_normalizado gin_trgm_ops);
CREATE INDEX idx_produtos_apelidos ON produtos USING gin (apelidos);
CREATE INDEX idx_produtos_barras ON produtos(workspace_id, codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE TRIGGER tg_produtos_updated BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 25c. ITENS DE TRANSAÇÃO (linhas de uma nota fiscal)
-- Opcional — só usado quando workspace está em modo_detalhado
-- =====================================================================
CREATE TABLE itens_transacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transacao_id UUID NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,

  -- Snapshot do que veio na nota (preservar texto original)
  descricao_original TEXT NOT NULL,
  quantidade NUMERIC(10,3) DEFAULT 1,
  unidade TEXT,
  valor_unitario NUMERIC(10,2),
  valor_total NUMERIC(12,2),
  desconto NUMERIC(10,2) DEFAULT 0,

  -- Status do match com produto
  status_revisao status_revisao DEFAULT 'confirmado',
  score_confianca NUMERIC(3,2),

  ordem_na_nota INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_itens_tx ON itens_transacao(transacao_id);
CREATE INDEX idx_itens_produto ON itens_transacao(produto_id);
CREATE INDEX idx_itens_revisao ON itens_transacao(workspace_id, status_revisao) WHERE status_revisao != 'confirmado';

-- =====================================================================
-- 25d. SUGESTÕES DE MATCH (fila do Inbox de Revisão)
-- Genérica — uma sugestão pode ser de estabelecimento, produto, etc.
-- =====================================================================
CREATE TABLE sugestoes_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- O que está sendo sugerido a unificar
  tipo tipo_entidade_sugestao NOT NULL,
  registro_origem_id UUID NOT NULL,           -- o que a IA criou agora
  registro_sugerido_id UUID NOT NULL,         -- com quem ele se parece (existente)
  texto_origem TEXT NOT NULL,                 -- o texto cru que veio
  texto_sugerido TEXT NOT NULL,               -- nome do registro existente

  score_confianca NUMERIC(3,2) NOT NULL,      -- 0.60 a 0.94 (acima de 0.95 é auto)
  origem origem_transacao,                    -- de onde veio

  -- Resolução
  resolvida BOOLEAN DEFAULT FALSE,
  decisao TEXT,                               -- 'mesmo' | 'diferente' | 'ignorar'
  decidido_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sug_ws_aberto ON sugestoes_match(workspace_id, resolvida) WHERE resolvida = FALSE;
CREATE INDEX idx_sug_origem ON sugestoes_match(registro_origem_id);

-- =====================================================================
-- 25e. FUNÇÕES DE BUSCA E MATCH (lógica reutilizável)
-- =====================================================================

-- Normaliza texto para comparação: lowercase, sem acento, sem pontuação extra
CREATE OR REPLACE FUNCTION normalizar_texto(p_texto TEXT) RETURNS TEXT AS $$
  SELECT lower(regexp_replace(unaccent(coalesce(p_texto, '')), '[^a-zA-Z0-9 ]+', ' ', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

-- Busca estabelecimentos similares — retorna candidatos com score
CREATE OR REPLACE FUNCTION buscar_match_estabelecimento(
  p_workspace_id UUID,
  p_nome TEXT,
  p_threshold NUMERIC DEFAULT 0.60
) RETURNS TABLE(id UUID, nome TEXT, score NUMERIC) AS $$
DECLARE
  v_normalizado TEXT := normalizar_texto(p_nome);
BEGIN
  RETURN QUERY
  SELECT e.id, e.nome,
    GREATEST(
      similarity(e.nome_normalizado, v_normalizado),
      -- Bonus se v_normalizado bate com algum apelido
      COALESCE((SELECT MAX(similarity(normalizar_texto(a), v_normalizado))
                FROM unnest(e.apelidos) a), 0)
    )::NUMERIC AS score
  FROM estabelecimentos e
  WHERE e.workspace_id = p_workspace_id
    AND (
      e.nome_normalizado % v_normalizado
      OR EXISTS (SELECT 1 FROM unnest(e.apelidos) a WHERE normalizar_texto(a) % v_normalizado)
    )
  ORDER BY score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

-- Busca produtos similares
CREATE OR REPLACE FUNCTION buscar_match_produto(
  p_workspace_id UUID,
  p_nome TEXT,
  p_codigo_barras TEXT DEFAULT NULL,
  p_threshold NUMERIC DEFAULT 0.50
) RETURNS TABLE(id UUID, nome TEXT, score NUMERIC) AS $$
DECLARE
  v_normalizado TEXT := normalizar_texto(p_nome);
BEGIN
  -- Match por código de barras = certeza absoluta
  IF p_codigo_barras IS NOT NULL THEN
    RETURN QUERY
    SELECT p.id, p.nome, 1.00::NUMERIC AS score
    FROM produtos p
    WHERE p.workspace_id = p_workspace_id AND p.codigo_barras = p_codigo_barras
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Match fuzzy por nome ou apelido
  RETURN QUERY
  SELECT p.id, p.nome,
    GREATEST(
      similarity(p.nome_normalizado, v_normalizado),
      COALESCE((SELECT MAX(similarity(normalizar_texto(a), v_normalizado))
                FROM unnest(p.apelidos) a), 0)
    )::NUMERIC AS score
  FROM produtos p
  WHERE p.workspace_id = p_workspace_id
    AND (
      p.nome_normalizado % v_normalizado
      OR EXISTS (SELECT 1 FROM unnest(p.apelidos) a WHERE normalizar_texto(a) % v_normalizado)
    )
  ORDER BY score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE;

-- Confirma uma sugestão: aprende (vira alias) e remove duplicata
CREATE OR REPLACE FUNCTION confirmar_match(
  p_sugestao_id UUID,
  p_decisao TEXT  -- 'mesmo' | 'diferente'
) RETURNS VOID AS $$
DECLARE
  v_sug sugestoes_match%ROWTYPE;
BEGIN
  SELECT * INTO v_sug FROM sugestoes_match WHERE id = p_sugestao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sugestão não encontrada'; END IF;

  -- Verifica permissão via RLS (membership no workspace)
  IF v_sug.workspace_id NOT IN (SELECT user_workspaces()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_decisao = 'mesmo' THEN
    -- Adiciona o texto de origem como alias do registro sugerido
    IF v_sug.tipo = 'estabelecimento' THEN
      UPDATE estabelecimentos
        SET apelidos = array_append(apelidos, v_sug.texto_origem)
        WHERE id = v_sug.registro_sugerido_id
          AND NOT (v_sug.texto_origem = ANY(apelidos));
      -- Reaponta todas as transações do registro_origem pro sugerido
      UPDATE transacoes SET estabelecimento_id = v_sug.registro_sugerido_id
        WHERE estabelecimento_id = v_sug.registro_origem_id;
      -- Apaga o duplicado
      DELETE FROM estabelecimentos WHERE id = v_sug.registro_origem_id;

    ELSIF v_sug.tipo = 'produto' THEN
      UPDATE produtos
        SET apelidos = array_append(apelidos, v_sug.texto_origem)
        WHERE id = v_sug.registro_sugerido_id
          AND NOT (v_sug.texto_origem = ANY(apelidos));
      UPDATE itens_transacao SET produto_id = v_sug.registro_sugerido_id
        WHERE produto_id = v_sug.registro_origem_id;
      DELETE FROM produtos WHERE id = v_sug.registro_origem_id;

    ELSIF v_sug.tipo = 'categoria' THEN
      UPDATE transacoes SET categoria_id = v_sug.registro_sugerido_id
        WHERE categoria_id = v_sug.registro_origem_id;
      DELETE FROM categorias WHERE id = v_sug.registro_origem_id;
    END IF;
  END IF;
  -- Se 'diferente': mantém ambos, só marca o registro_origem como confirmado

  -- Marca registro_origem como confirmado independente da decisão
  IF v_sug.tipo = 'estabelecimento' AND p_decisao = 'diferente' THEN
    UPDATE estabelecimentos SET status_revisao = 'confirmado' WHERE id = v_sug.registro_origem_id;
  ELSIF v_sug.tipo = 'produto' AND p_decisao = 'diferente' THEN
    UPDATE produtos SET status_revisao = 'confirmado' WHERE id = v_sug.registro_origem_id;
  END IF;

  -- Marca a sugestão como resolvida
  UPDATE sugestoes_match SET
    resolvida = TRUE,
    decisao = p_decisao,
    decidido_por = auth.uid(),
    decidido_em = NOW()
  WHERE id = p_sugestao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 25f. VIEW: INBOX DE REVISÃO unificado
-- =====================================================================
CREATE OR REPLACE VIEW v_inbox_revisao AS
SELECT
  'transacao_revisao' AS tipo_item,
  t.id AS item_id,
  t.workspace_id,
  t.descricao AS texto,
  t.valor,
  t.data_transacao AS data_referencia,
  t.score_confianca,
  t.origem,
  t.status_revisao::TEXT AS status,
  t.created_at
FROM transacoes t
WHERE t.status_revisao IN ('sugerido', 'novo')

UNION ALL

SELECT
  'sugestao_match' AS tipo_item,
  s.id AS item_id,
  s.workspace_id,
  s.texto_origem || ' → ' || s.texto_sugerido AS texto,
  NULL AS valor,
  s.created_at::DATE AS data_referencia,
  s.score_confianca,
  s.origem,
  s.tipo::TEXT AS status,
  s.created_at
FROM sugestoes_match s
WHERE s.resolvida = FALSE

UNION ALL

SELECT
  'fatura_pendente' AS tipo_item,
  t.id AS item_id,
  t.workspace_id,
  t.descricao AS texto,
  t.valor,
  t.data_transacao AS data_referencia,
  NULL AS score_confianca,
  t.origem,
  t.status_conciliacao::TEXT AS status,
  t.created_at
FROM transacoes t
WHERE t.status_conciliacao = 'pendente_revisao';

-- =====================================================================
-- 26. ANÚNCIOS (plano Free)
-- =====================================================================
CREATE TABLE anuncios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posicao TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT,
  imagem_url TEXT,
  url_destino TEXT,
  prioridade INT DEFAULT 0,
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 26b. PAGAMENTOS ASAAS (histórico de cobranças)
-- Reutilizado entre assinaturas recorrentes e cobranças avulsas
-- =====================================================================
CREATE TYPE status_pagamento AS ENUM (
  'pending', 'confirmed', 'received', 'overdue',
  'refunded', 'received_in_cash', 'refund_requested',
  'chargeback_requested', 'chargeback_dispute', 'awaiting_chargeback_reversal',
  'dunning_requested', 'dunning_received', 'awaiting_risk_analysis'
);

CREATE TYPE metodo_cobranca AS ENUM (
  'CREDIT_CARD', 'BOLETO', 'PIX', 'UNDEFINED'
);

CREATE TABLE pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Identificadores Asaas
  asaas_payment_id TEXT UNIQUE NOT NULL,    -- ID da cobrança no Asaas
  asaas_subscription_id TEXT,                -- vinculado à assinatura, se houver
  asaas_invoice_url TEXT,                    -- URL da fatura (pra mostrar pro user)
  asaas_invoice_number TEXT,
  asaas_bank_slip_url TEXT,                  -- URL do boleto
  asaas_pix_qr_code TEXT,                    -- payload Pix copia-e-cola

  -- Dados financeiros
  valor NUMERIC(10,2) NOT NULL,
  valor_liquido NUMERIC(10,2),               -- valor após taxas Asaas
  metodo metodo_cobranca DEFAULT 'UNDEFINED',
  status status_pagamento NOT NULL DEFAULT 'pending',

  -- Datas
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  data_credito DATE,                         -- quando o dinheiro entra na conta Asaas

  -- Descrição
  descricao TEXT,
  referencia_externa TEXT,                   -- nosso ID interno (ex: 'sub_renovacao_2026_05')

  -- Auditoria
  metadados JSONB DEFAULT '{}',              -- payload completo do Asaas pra debug
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pag_ws ON pagamentos(workspace_id, created_at DESC);
CREATE INDEX idx_pag_status ON pagamentos(workspace_id, status);
CREATE INDEX idx_pag_asaas ON pagamentos(asaas_payment_id);
CREATE INDEX idx_pag_subscription ON pagamentos(asaas_subscription_id);
CREATE TRIGGER tg_pagamentos_updated BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================================
-- 26c. ASAAS WEBHOOK EVENTS (log de eventos recebidos, idempotência)
-- =====================================================================
CREATE TABLE asaas_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_event_id TEXT UNIQUE,                -- pra idempotência (não processar 2x)
  event_type TEXT NOT NULL,                  -- ex: PAYMENT_CONFIRMED, PAYMENT_OVERDUE
  payload JSONB NOT NULL,
  processado BOOLEAN DEFAULT FALSE,
  processado_em TIMESTAMPTZ,
  erro TEXT,
  tentativas INT DEFAULT 0,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  pagamento_id UUID REFERENCES pagamentos(id) ON DELETE SET NULL,
  ip_origem INET,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_webhook_processado ON asaas_webhook_events(processado, received_at);
CREATE INDEX idx_webhook_evento ON asaas_webhook_events(event_type);

-- =====================================================================
-- 26d. RATE LIMITING (controle de abuso por endpoint sensível)
-- =====================================================================
CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identificador TEXT NOT NULL,               -- profile_id, ip, ou telefone
  tipo TEXT NOT NULL,                        -- 'login', 'whatsapp_verify', 'ia_chat', 'export'
  contagem INT DEFAULT 1,
  janela_inicio TIMESTAMPTZ DEFAULT NOW(),
  bloqueado_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identificador, tipo)
);
CREATE INDEX idx_rate_lookup ON rate_limits(identificador, tipo);

-- =====================================================================
-- 26e. AUDIT_LOG_ACESSO (acessos sensíveis: login, export, exclusões)
-- =====================================================================
CREATE TABLE audit_log_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,                        -- 'login', 'login_falha', 'export_data', 'delete_workspace', 'mfa_enabled'
  ip INET,
  user_agent TEXT,
  metadados JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_acesso_profile ON audit_log_acesso(profile_id, created_at DESC);
CREATE INDEX idx_audit_acesso_acao ON audit_log_acesso(acao, created_at DESC);

-- =====================================================================
-- 27. SEED: TEMPLATES DE CATEGORIA
-- =====================================================================
INSERT INTO categoria_templates (nome, slug, icone, cor, parent_slug, comportamento, ordem) VALUES
  ('Moradia',        'moradia',       '🏠', '#8B4513', NULL, 'basico', 1),
  ('Alimentação',    'alimentacao',   '🍽️', '#FF6B35', NULL, 'basico', 2),
  ('Transporte',     'transporte',    '🚗', '#4A90E2', NULL, 'basico', 3),
  ('Saúde',          'saude',         '⚕️', '#E74C3C', NULL, 'basico', 4),
  ('Educação',       'educacao',      '📚', '#9B59B6', NULL, 'basico', 5),
  ('Lazer',          'lazer',         '🎮', '#F39C12', NULL, 'basico', 6),
  ('Vestuário',      'vestuario',     '👔', '#E91E63', NULL, 'basico', 7),
  ('Assinaturas',    'assinaturas',   '📺', '#3F51B5', NULL, 'basico', 8),
  ('Presentes',      'presentes',     '🎁', '#FFC107', NULL, 'basico', 9),
  ('Pets',           'pets',          '🐾', '#795548', NULL, 'basico', 10),
  ('Investimentos',  'investimentos', '💰', '#2ECC71', NULL, 'basico', 11),
  ('Receitas',       'receitas',      '💵', '#27AE60', NULL, 'basico', 12),
  ('Outros',         'outros',        '📦', '#95A5A6', NULL, 'basico', 99);

INSERT INTO categoria_templates (nome, slug, parent_slug, ordem) VALUES
  ('Aluguel', 'mor_aluguel', 'moradia', 1),
  ('Condomínio', 'mor_condominio', 'moradia', 2),
  ('Energia', 'mor_luz', 'moradia', 3),
  ('Água', 'mor_agua', 'moradia', 4),
  ('Internet', 'mor_internet', 'moradia', 5),
  ('Supermercado', 'ali_mercado', 'alimentacao', 1),
  ('Restaurante', 'ali_restaurante', 'alimentacao', 2),
  ('Delivery', 'ali_delivery', 'alimentacao', 3),
  ('Combustível', 'tra_combustivel', 'transporte', 1),
  ('Apps de transporte', 'tra_apps', 'transporte', 2),
  ('Plano de Saúde', 'sau_plano', 'saude', 1),
  ('Farmácia', 'sau_farmacia', 'saude', 2),
  ('Médico', 'sau_medico', 'saude', 3),
  ('Escola', 'edu_escola', 'educacao', 1),
  ('Streaming', 'ass_streaming', 'assinaturas', 1);

-- =====================================================================
-- 28. FUNÇÃO: Provisionar workspace
-- =====================================================================
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
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, comportamento, ordem)
    VALUES (v_workspace_id, v_template.nome, v_template.slug, v_template.icone,
            v_template.cor, v_template.comportamento, v_template.ordem)
    RETURNING id INTO v_cat_pai_id;
    v_categoria_pai_map := v_categoria_pai_map || jsonb_build_object(v_template.slug, v_cat_pai_id);
  END LOOP;

  FOR v_template IN
    SELECT * FROM categoria_templates WHERE parent_slug IS NOT NULL ORDER BY ordem
  LOOP
    INSERT INTO categorias (workspace_id, nome, slug, icone, cor, categoria_pai_id, ordem)
    VALUES (v_workspace_id, v_template.nome, v_template.slug, v_template.icone,
            v_template.cor,
            (v_categoria_pai_map->>v_template.parent_slug)::UUID,
            v_template.ordem);
  END LOOP;

  UPDATE profiles SET default_workspace_id = v_workspace_id
  WHERE id = p_owner_id AND default_workspace_id IS NULL;

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 29. HELPER: workspaces do user logado
-- =====================================================================
CREATE OR REPLACE FUNCTION user_workspaces() RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_members WHERE profile_id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- =====================================================================
-- 30. VIEWS
-- =====================================================================
CREATE OR REPLACE VIEW v_pendentes_revisao AS
SELECT t.*, c.nome AS categoria_nome, est.nome AS estabelecimento_nome, car.apelido AS cartao_apelido
FROM transacoes t
LEFT JOIN categorias c ON c.id = t.categoria_id
LEFT JOIN estabelecimentos est ON est.id = t.estabelecimento_id
LEFT JOIN cartoes car ON car.id = t.cartao_id
WHERE t.status_conciliacao = 'pendente_revisao';

CREATE OR REPLACE VIEW v_colecoes_em_aberto AS
SELECT col.*, cat.nome AS categoria_nome, cat.comportamento
FROM colecoes col
JOIN categorias cat ON cat.id = col.categoria_id
WHERE (cat.comportamento = 'projeto' AND col.status_projeto NOT IN ('concluido', 'cancelado'))
   OR (cat.comportamento = 'compromisso' AND col.status_compromisso NOT IN ('pago', 'cancelado'));

-- =====================================================================
-- 31. ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_routing    ENABLE ROW LEVEL SECURITY;
ALTER TABLE entidades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias          ENABLE ROW LEVEL SECURITY;
ALTER TABLE colecoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_colecao       ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_bancarias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE midias              ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturas_cartao      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE investimentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas_financeiras   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas_ia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens_ia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_acesso    ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_transacao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugestoes_match     ENABLE ROW LEVEL SECURITY;
-- asaas_webhook_events e rate_limits: SEM RLS, acesso só via service_role (Edge Functions)

CREATE POLICY p_self ON profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY p_ws_member ON workspaces FOR SELECT TO authenticated
  USING (id IN (SELECT user_workspaces()));
CREATE POLICY p_ws_owner_write ON workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY p_wsm_visible ON workspace_members FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspaces()));

CREATE POLICY p_inv ON invitations FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces()));

CREATE POLICY p_wa ON whatsapp_routing FOR ALL TO authenticated
  USING (profile_id = auth.uid());

-- Policies para todas as tabelas escopadas por workspace
CREATE POLICY p_ws ON entidades FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON categorias FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON colecoes FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON itens_colecao FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON estabelecimentos FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON contas_bancarias FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON cartoes FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON midias FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON recorrencias FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON faturas_cartao FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON transacoes FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON investimentos FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON metas_financeiras FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON orcamentos FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON conversas_ia FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON mensagens_ia FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON audit_log FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspaces()));

CREATE POLICY p_plans_read ON plans FOR SELECT USING (TRUE);
CREATE POLICY p_ads_read ON anuncios FOR SELECT TO authenticated USING (ativo = TRUE);

-- Pagamentos: membros do workspace podem ler; só Edge Functions (service_role) escrevem
CREATE POLICY p_pagamentos_read ON pagamentos FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspaces()));

-- Audit log de acesso: cada user vê só o seu próprio
CREATE POLICY p_audit_acesso_self ON audit_log_acesso FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Produtos, itens de transação e sugestões: padrão workspace
CREATE POLICY p_ws ON produtos FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON itens_transacao FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
CREATE POLICY p_ws ON sugestoes_match FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
