-- =====================================================================
-- Saúde 08 — dados do Samsung Health (app do celular, Samsung Health Data SDK)
-- Um registro por item do Samsung Health (uid dele): sono com estágios, SpO2, temperatura
-- da pele, treinos (tipo, FC média/máx, calorias, auto-detectado) e Energy Score.
-- Upsert com ATUALIZAÇÃO: o Samsung Health às vezes corrige um registro depois.
-- =====================================================================
CREATE TABLE IF NOT EXISTS saude_samsung (
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uid             TEXT NOT NULL CHECK (char_length(uid) <= 120),
  tipo            TEXT NOT NULL CHECK (tipo IN ('sono', 'spo2', 'temp_pele', 'exercicio', 'energia')),
  inicio          TIMESTAMPTZ NOT NULL,
  fim             TIMESTAMPTZ,
  dados           JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dispositivo_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_saude_samsung_ws_tipo_inicio ON saude_samsung (workspace_id, tipo, inicio DESC);
ALTER TABLE saude_samsung ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_samsung;
CREATE POLICY p_ws_select ON saude_samsung FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));
REVOKE INSERT, UPDATE, DELETE ON saude_samsung FROM anon, authenticated;
GRANT SELECT ON saude_samsung TO authenticated;
