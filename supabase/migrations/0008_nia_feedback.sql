-- =====================================================================
-- NOSSO TUDO — 0008: feedback das mensagens da Nia (análise conversacional)
-- Um voto 👍/👎 por usuário por mensagem; base do painel de qualidade no admin.
-- =====================================================================

CREATE TABLE IF NOT EXISTS nia_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id  UUID NOT NULL REFERENCES mensagens_ia(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  voto         TEXT NOT NULL CHECK (voto IN ('positivo', 'negativo')),
  comentario   TEXT,
  criado_em    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT nia_feedback_uniq UNIQUE (mensagem_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_nia_feedback_ws ON nia_feedback(workspace_id);

ALTER TABLE nia_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws ON nia_feedback;
CREATE POLICY p_ws ON nia_feedback FOR ALL TO authenticated
  USING (workspace_id IN (SELECT user_workspaces())) WITH CHECK (workspace_id IN (SELECT user_workspaces()));
