-- =====================================================================
-- saude01. SAÚDE — RELÓGIO (Galaxy Watch) → NOSSO TUDO
-- ---------------------------------------------------------------------
-- O app do relógio (apps/saude-android) mede batimento, VFC e registros
-- manuais e envia para cá. Decisões:
--
-- * Escopo = WORKSPACE (a família vê), como o resto do Nosso Tudo — decisão
--   explícita do Nicolas (15/11/2026). `profile_id` guarda de quem é o relógio.
-- * O relógio NÃO tem login nem chave do Supabase. Ele nasce com um segredo
--   próprio; aqui guardamos só o sha256 dele. Pareamento: o relógio mostra um
--   código de 6 letras, a pessoa digita em /app/saude, a RPC vincula.
-- * Escrita só pela Edge Function `saude-relogio` (service_role). Membros do
--   workspace só LEEM (e renomeiam/revogam dispositivos).
-- * Idempotência: tudo que o relógio manda tem chave natural ou `id_local`,
--   então reenviar o mesmo lote (rede caiu no meio) não duplica.
-- * Não guardamos PPG bruto: só agregados (bpm por minuto, janelas de VFC)
--   e o traçado de ECG sob demanda (30 s).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dispositivos (relógios vinculados)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_dispositivos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  nome             TEXT NOT NULL DEFAULT 'Galaxy Watch',
  modelo           TEXT,
  segredo_hash     TEXT NOT NULL UNIQUE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_envio_em  TIMESTAMPTZ,
  revogado_em      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_saude_dispositivos_ws ON saude_dispositivos (workspace_id);

-- ---------------------------------------------------------------------
-- Pareamentos pendentes (código mostrado no relógio, válido por 30 min)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_pareamentos (
  codigo          TEXT PRIMARY KEY CHECK (codigo ~ '^[A-Z2-9]{6}$'),
  segredo_hash    TEXT NOT NULL,
  modelo          TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em       TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes',
  usado_em        TIMESTAMPTZ,
  dispositivo_id  UUID REFERENCES saude_dispositivos(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- Batimento agregado por minuto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_bpm_minuto (
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  minuto          TIMESTAMPTZ NOT NULL,
  bpm_medio       REAL NOT NULL CHECK (bpm_medio BETWEEN 25 AND 240),
  bpm_min         SMALLINT NOT NULL,
  bpm_max         SMALLINT NOT NULL,
  amostras        SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (dispositivo_id, minuto)
);
CREATE INDEX IF NOT EXISTS idx_saude_bpm_ws_minuto ON saude_bpm_minuto (workspace_id, minuto DESC);

-- ---------------------------------------------------------------------
-- VFC: uma linha por janela de 5 min com sinal suficiente
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_vfc_janelas (
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inicio          TIMESTAMPTZ NOT NULL,
  rmssd_ms        REAL NOT NULL CHECK (rmssd_ms > 0 AND rmssd_ms < 500),
  cobertura       REAL NOT NULL CHECK (cobertura BETWEEN 0 AND 1.5),
  PRIMARY KEY (dispositivo_id, inicio)
);
CREATE INDEX IF NOT EXISTS idx_saude_vfc_ws_inicio ON saude_vfc_janelas (workspace_id, inicio DESC);

-- ---------------------------------------------------------------------
-- Registros manuais e eventos (check-in, hábito, respiração, ECG)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_registros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id_local        TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('checkin', 'habito', 'respiracao', 'ecg')),
  valor           TEXT NOT NULL,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispositivo_id, id_local)
);
CREATE INDEX IF NOT EXISTS idx_saude_registros_ws_ts ON saude_registros (workspace_id, ts DESC);

-- ---------------------------------------------------------------------
-- ECG sob demanda (~30 s a ~500 Hz = ~15 mil amostras em mV)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_ecgs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id_local        TEXT NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  duracao_s       REAL NOT NULL,
  hz              REAL NOT NULL,
  amostras_mv     REAL[] NOT NULL,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispositivo_id, id_local)
);
CREATE INDEX IF NOT EXISTS idx_saude_ecgs_ws_ts ON saude_ecgs (workspace_id, ts DESC);

-- ---------------------------------------------------------------------
-- RLS: membros LEEM; escrita só via service_role (Edge Function) e RPC.
-- ---------------------------------------------------------------------
ALTER TABLE saude_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE saude_pareamentos  ENABLE ROW LEVEL SECURITY;  -- deny-all
ALTER TABLE saude_bpm_minuto   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saude_vfc_janelas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE saude_registros    ENABLE ROW LEVEL SECURITY;
ALTER TABLE saude_ecgs         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ws_select ON saude_dispositivos;
CREATE POLICY p_ws_select ON saude_dispositivos FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));
-- renomear / revogar
DROP POLICY IF EXISTS p_ws_update ON saude_dispositivos;
CREATE POLICY p_ws_update ON saude_dispositivos FOR UPDATE
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws_select ON saude_bpm_minuto;
CREATE POLICY p_ws_select ON saude_bpm_minuto FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws_select ON saude_vfc_janelas;
CREATE POLICY p_ws_select ON saude_vfc_janelas FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws_select ON saude_registros;
CREATE POLICY p_ws_select ON saude_registros FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws_select ON saude_ecgs;
CREATE POLICY p_ws_select ON saude_ecgs FOR SELECT
  USING (workspace_id IN (SELECT user_workspaces()));

-- O hash do segredo não sai do banco nem para membros: REVOKE de coluna não
-- vence um GRANT de tabela, então trocamos o GRANT de tabela por um por coluna.
REVOKE ALL ON saude_dispositivos FROM anon, authenticated;
GRANT SELECT (id, workspace_id, profile_id, nome, modelo, criado_em, ultimo_envio_em, revogado_em)
  ON saude_dispositivos TO authenticated;
GRANT UPDATE (nome, revogado_em) ON saude_dispositivos TO authenticated;
REVOKE ALL ON saude_pareamentos FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON saude_bpm_minuto, saude_vfc_janelas, saude_registros, saude_ecgs FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC: vincular o código mostrado no relógio ao workspace de quem digitou
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_vincular_dispositivo(
  p_workspace_id UUID,
  p_codigo       TEXT,
  p_nome         TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_par   saude_pareamentos%ROWTYPE;
  v_disp  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;
  IF p_workspace_id NOT IN (SELECT user_workspaces()) THEN
    RAISE EXCEPTION 'sem_acesso_ao_workspace';
  END IF;

  SELECT * INTO v_par FROM saude_pareamentos
   WHERE codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     AND usado_em IS NULL
     AND expira_em > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'codigo_invalido_ou_expirado';
  END IF;

  INSERT INTO saude_dispositivos (workspace_id, profile_id, nome, modelo, segredo_hash)
  VALUES (p_workspace_id, auth.uid(), coalesce(nullif(trim(p_nome), ''), 'Galaxy Watch'), v_par.modelo, v_par.segredo_hash)
  ON CONFLICT (segredo_hash) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        profile_id   = EXCLUDED.profile_id,
        nome         = EXCLUDED.nome,
        revogado_em  = NULL
  RETURNING id INTO v_disp;

  UPDATE saude_pareamentos SET usado_em = now(), dispositivo_id = v_disp WHERE codigo = v_par.codigo;
  RETURN v_disp;
END;
$$;

REVOKE EXECUTE ON FUNCTION saude_vincular_dispositivo(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_vincular_dispositivo(UUID, TEXT, TEXT) TO authenticated;
