-- =====================================================================
-- NOSSO TUDO — 0012: categorização item a item (Fase 1)
-- Cada linha da nota (itens_transacao) ganha categoria própria, essencialidade
-- e tipo do item. Produto e categoria guardam defaults (memória/herança).
-- Tudo aditivo e opcional: lançamento sem itemizar continua válido.
-- Ver PLANO-CATEGORIZACAO.md.
-- =====================================================================

-- 1. Enum de essencialidade (guard: Postgres não tem CREATE TYPE IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'essencialidade') THEN
    CREATE TYPE essencialidade AS ENUM (
      'essencial',     -- não dá pra cortar (arroz, remédio, aluguel)
      'necessario',    -- importante, mas com folga (default)
      'superfluo',     -- supérfluo / desejo (sobremesa, pipoca)
      'investimento'   -- gasto que constrói valor (curso, ferramenta)
    );
  END IF;
END$$;

-- 2. itens_transacao: categoria própria + essencialidade + tipo do item
ALTER TABLE itens_transacao
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS essencialidade essencialidade NOT NULL DEFAULT 'necessario',
  ADD COLUMN IF NOT EXISTS tipo_item TEXT;   -- "Refeição","Bebida","Limpeza"... texto sugerido

CREATE INDEX IF NOT EXISTS idx_itens_categoria
  ON itens_transacao(workspace_id, categoria_id);

-- 3. produtos: memória de classificação (herança item → produto)
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS essencialidade_padrao essencialidade,
  ADD COLUMN IF NOT EXISTS tipo_padrao TEXT;

-- 4. categorias: default de essencialidade da categoria (último fallback)
ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS essencialidade_padrao essencialidade;

-- 5. categoria_templates: o padrão canônico carrega o default sugerido
ALTER TABLE categoria_templates
  ADD COLUMN IF NOT EXISTS essencialidade_padrao essencialidade;
