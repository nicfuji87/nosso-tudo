-- =====================================================================
-- Saúde 02 — estado do relógio, diário de eventos e registro de mal-estar
-- Aditiva: nada do que a v0.3 usa é removido ou alterado de forma incompatível.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado do relógio (enviado junto com cada lote / batida de vida)
-- ---------------------------------------------------------------------
ALTER TABLE saude_dispositivos
  ADD COLUMN IF NOT EXISTS versao_app        TEXT,
  ADD COLUMN IF NOT EXISTS bateria_pct       SMALLINT CHECK (bateria_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS carregando        BOOLEAN,
  ADD COLUMN IF NOT EXISTS no_pulso          BOOLEAN,
  ADD COLUMN IF NOT EXISTS ultima_leitura_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estado_em         TIMESTAMPTZ;

GRANT SELECT (versao_app, bateria_pct, carregando, no_pulso, ultima_leitura_em, estado_em)
  ON saude_dispositivos TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Registro de mal-estar feito no relógio (um toque, funciona offline)
-- ---------------------------------------------------------------------
ALTER TABLE saude_registros DROP CONSTRAINT IF EXISTS saude_registros_tipo_check;
ALTER TABLE saude_registros ADD CONSTRAINT saude_registros_tipo_check
  CHECK (tipo IN ('checkin', 'habito', 'respiracao', 'ecg', 'malestar'));

-- ---------------------------------------------------------------------
-- 3. Diário de saúde: treinos (detectados e confirmados), sintomas, mal-estar,
--    medicamentos, álcool, cafeína, doença, estresse, sono, notas.
--    É a base para interpretar os dados e, depois, medir se os alertas acertam.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id   UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  tipo         TEXT NOT NULL CHECK (tipo IN (
                 'treino', 'sintoma', 'malestar', 'medicamento', 'alcool',
                 'cafeina', 'doenca', 'estresse', 'sono', 'nota')),
  inicio       TIMESTAMPTZ NOT NULL,
  fim          TIMESTAMPTZ,
  -- treino: { modalidade, esforco (0–10), confianca_fc }
  -- malestar/sintoma: { situacao, sintomas[], intensidade }
  detalhes     JSONB NOT NULL DEFAULT '{}'::jsonb,
  nota         TEXT CHECK (char_length(nota) <= 500),
  origem       TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'detectado', 'relogio')),
  descartado   BOOLEAN NOT NULL DEFAULT false,   -- "não foi treino": não volta a ser sugerido
  algoritmo    TEXT,                              -- ex.: treino-v1 (versão de quem sugeriu)
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_saude_eventos_ws_inicio ON saude_eventos (workspace_id, inicio DESC);

ALTER TABLE saude_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ws_select ON saude_eventos;
CREATE POLICY p_ws_select ON saude_eventos FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));
DROP POLICY IF EXISTS p_ws_insert ON saude_eventos;
CREATE POLICY p_ws_insert ON saude_eventos FOR INSERT
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));
DROP POLICY IF EXISTS p_ws_update ON saude_eventos;
CREATE POLICY p_ws_update ON saude_eventos FOR UPDATE
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));
DROP POLICY IF EXISTS p_ws_delete ON saude_eventos;
CREATE POLICY p_ws_delete ON saude_eventos FOR DELETE
  USING (workspace_id IN (SELECT user_workspaces()));

REVOKE ALL ON saude_eventos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON saude_eventos TO authenticated;
