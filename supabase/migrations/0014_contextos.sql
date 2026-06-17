-- =====================================================================
-- NOSSO TUDO — 0014: Contexto/Evento (Fase 3)
-- "Por que esse gasto aconteceu?" — leve, separado de colecoes (que tem
-- workflow de projeto/compromisso). Ex.: "Passeio em família", "Compra do mês".
-- transacoes e itens_transacao ganham contexto_id (item herda da transação).
-- Permite a visão dupla: custo do evento (contexto) × onde o dinheiro foi (categoria).
-- Ver PLANO-CATEGORIZACAO.md (Fase 3).
-- =====================================================================

-- 1. Tabela de contextos (escopo workspace)
CREATE TABLE IF NOT EXISTS contextos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                 -- "Passeio em família", "Compra do mês"
  tipo TEXT,                          -- 'passeio'|'compra_mes'|'trabalho'|'viagem'|'festa'|'saude'|...
  data_referencia DATE,
  descricao TEXT,
  cor TEXT,
  icone TEXT,
  arquivado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contextos_ws ON contextos(workspace_id, arquivado);
DROP TRIGGER IF EXISTS tg_contextos_updated ON contextos;
CREATE TRIGGER tg_contextos_updated BEFORE UPDATE ON contextos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. FKs em transações e itens (item herda da transação por padrão)
ALTER TABLE transacoes
  ADD COLUMN IF NOT EXISTS contexto_id UUID REFERENCES contextos(id) ON DELETE SET NULL;
ALTER TABLE itens_transacao
  ADD COLUMN IF NOT EXISTS contexto_id UUID REFERENCES contextos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tx_contexto ON transacoes(workspace_id, contexto_id);
CREATE INDEX IF NOT EXISTS idx_itens_contexto ON itens_transacao(workspace_id, contexto_id);

-- 3. RLS — padrão workspace
ALTER TABLE contextos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws ON contextos;
CREATE POLICY p_ws ON contextos FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

-- 4. RPC: custo por contexto (all-time) — "quanto custou o passeio inteiro"
-- Item-aware: item usa seu contexto; senão herda o da transação. Resíduo
-- (taxas/frete) e transações sem itens caem no contexto da transação.
CREATE OR REPLACE FUNCTION gastos_por_contexto(
  p_workspace_id UUID
) RETURNS TABLE(
  contexto_id UUID,
  nome TEXT,
  tipo TEXT,
  cor TEXT,
  icone TEXT,
  data_referencia DATE,
  total NUMERIC,
  n_transacoes BIGINT
) AS $$
  WITH despesas AS (
    SELECT t.id, t.valor, t.contexto_id
    FROM transacoes t
    WHERE t.workspace_id = p_workspace_id
      AND t.tipo = 'despesa'
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
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
