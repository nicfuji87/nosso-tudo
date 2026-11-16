-- =====================================================================
-- Saúde 05 — Radar de Saúde v1
--   * temperatura da pele noturna (janelas de 5 min, 22h–8h)
--   * saude_noites v3 (+ temperatura)
--   * saude_radar: cada noite vs. o seu normal (mediana e desvio robusto das 28 noites anteriores)
-- Não é diagnóstico: aponta desvios do seu padrão e quantos sinais saíram juntos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Temperatura da pele (só à noite, enviada pelo relógio)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saude_temp_janelas (
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inicio          TIMESTAMPTZ NOT NULL,
  pele            REAL NOT NULL CHECK (pele BETWEEN 20 AND 45),
  ambiente        REAL CHECK (ambiente BETWEEN -20 AND 60),
  amostras        SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (dispositivo_id, inicio)
);
CREATE INDEX IF NOT EXISTS idx_saude_temp_ws_inicio ON saude_temp_janelas (workspace_id, inicio DESC);
ALTER TABLE saude_temp_janelas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_temp_janelas;
CREATE POLICY p_ws_select ON saude_temp_janelas FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));
REVOKE INSERT, UPDATE, DELETE ON saude_temp_janelas FROM anon, authenticated;
GRANT SELECT ON saude_temp_janelas TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Estatística robusta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_mediana(v DOUBLE PRECISION[]) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x) FROM unnest(v) AS x WHERE x IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION saude_mad(v DOUBLE PRECISION[]) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT saude_mediana(array_agg(abs(x - m))) FROM unnest(v) AS x, (SELECT saude_mediana(v) AS m) s WHERE x IS NOT NULL
$$;

-- ---------------------------------------------------------------------
-- 3. Noites v3: + temperatura da pele (mediana das janelas, ≥ 24 janelas = 2 h)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS saude_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT, temp_pele REAL, janelas_temp INT)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n AS (
    SELECT ((minuto AT TIME ZONE p_tz) + interval '2 hours')::date AS noite, minuto, bpm_medio, amostras
    FROM saude_bpm_minuto
    WHERE workspace_id = p_workspace_id AND minuto >= now() - make_interval(days => p_dias + 1)
      AND ((minuto AT TIME ZONE p_tz)::time >= '22:00' OR (minuto AT TIME ZONE p_tz)::time < '08:00')
  ),
  r AS (
    SELECT noite, avg(bpm_medio) OVER w AS media30, count(*) OVER w AS n30
    FROM n WHERE amostras >= 20
    WINDOW w AS (PARTITION BY noite ORDER BY minuto RANGE BETWEEN interval '29 minutes' PRECEDING AND CURRENT ROW)
  ),
  fc AS (
    SELECT n.noite, count(*)::int AS minutos,
           CASE WHEN count(*) >= 180
                THEN (SELECT min(r.media30) FROM r WHERE r.noite = n.noite AND r.n30 >= 20)::real END AS fc_repouso
    FROM n GROUP BY n.noite
  ),
  v AS (
    SELECT ((inicio AT TIME ZONE p_tz) + interval '2 hours')::date AS noite,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY rmssd_ms)::real AS mediana, count(*)::int AS janelas
    FROM saude_vfc_janelas
    WHERE workspace_id = p_workspace_id AND inicio >= now() - make_interval(days => p_dias + 1)
      AND ((inicio AT TIME ZONE p_tz)::time >= '22:00' OR (inicio AT TIME ZONE p_tz)::time < '08:00')
      AND cobertura >= 0.5
    GROUP BY 1
  ),
  t AS (
    SELECT ((inicio AT TIME ZONE p_tz) + interval '2 hours')::date AS noite,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY pele)::real AS mediana, count(*)::int AS janelas
    FROM saude_temp_janelas
    WHERE workspace_id = p_workspace_id AND inicio >= now() - make_interval(days => p_dias + 1)
      AND ((inicio AT TIME ZONE p_tz)::time >= '22:00' OR (inicio AT TIME ZONE p_tz)::time < '08:00')
    GROUP BY 1
  ),
  noites AS (SELECT noite FROM fc UNION SELECT noite FROM v UNION SELECT noite FROM t)
  SELECT x.noite, coalesce(fc.minutos, 0), fc.fc_repouso,
         CASE WHEN v.janelas >= 6 THEN v.mediana END, coalesce(v.janelas, 0),
         CASE WHEN t.janelas >= 24 THEN t.mediana END, coalesce(t.janelas, 0)
  FROM noites x
  LEFT JOIN fc ON fc.noite = x.noite
  LEFT JOIN v  ON v.noite  = x.noite
  LEFT JOIN t  ON t.noite  = x.noite
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- 4. Radar v1
--   normal = mediana das até 28 noites anteriores (sem as noites perto de "fiquei doente")
--   desvio típico = 1,4826 × MAD (com piso por sinal)
--   fora do normal: FC ≥ normal + máx(3 bpm, 2 desvios) · VFC ≤ normal − máx(20%, 2 desvios em ln)
--                   pele ≥ normal + máx(0,4 °C, 2 desvios)
--   nível: calibrando (< 7 noites de base) · estresse (3 sinais, ou ≥ 2 sinais em 2 noites seguidas)
--          · observar (≥ 1 sinal) · normal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_radar(p_workspace_id UUID, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, fc REAL, fc_normal REAL, fc_fora BOOLEAN, vfc REAL, vfc_normal REAL, vfc_fora BOOLEAN,
               temp REAL, temp_normal REAL, temp_fora BOOLEAN, sinais INT, base INT, doente BOOLEAN, nivel TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n AS (
    SELECT x.noite, x.fc_repouso AS fc, x.vfc_noturna AS vfc, x.temp_pele AS temp,
           EXISTS (SELECT 1 FROM saude_eventos e
                   WHERE e.workspace_id = p_workspace_id AND e.tipo = 'doenca' AND NOT e.descartado
                     AND (e.inicio AT TIME ZONE p_tz)::date BETWEEN x.noite - 2 AND x.noite + 2) AS doente
    FROM saude_noites(p_workspace_id, 75, p_tz) x
    WHERE x.fc_repouso IS NOT NULL OR x.vfc_noturna IS NOT NULL OR x.temp_pele IS NOT NULL
  ),
  b AS (
    SELECT n.*, h.*
    FROM n
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS base_n,
             array_agg(p.fc::float8) FILTER (WHERE p.fc IS NOT NULL) AS a_fc,
             array_agg(ln(p.vfc::float8)) FILTER (WHERE p.vfc IS NOT NULL) AS a_vfc,
             array_agg(p.temp::float8) FILTER (WHERE p.temp IS NOT NULL) AS a_temp
      FROM (SELECT * FROM n p2 WHERE p2.noite < n.noite AND NOT p2.doente ORDER BY p2.noite DESC LIMIT 28) p
    ) h
  ),
  c AS (
    SELECT b.noite, b.fc, b.vfc, b.temp, b.base_n, b.doente,
           saude_mediana(a_fc) AS fc_med, greatest(1.5, 1.4826 * coalesce(saude_mad(a_fc), 0)) AS fc_sd,
           coalesce(array_length(a_fc, 1), 0) AS n_fc,
           saude_mediana(a_vfc) AS lv_med, greatest(0.08, 1.4826 * coalesce(saude_mad(a_vfc), 0)) AS lv_sd,
           coalesce(array_length(a_vfc, 1), 0) AS n_vfc,
           saude_mediana(a_temp) AS t_med, greatest(0.15, 1.4826 * coalesce(saude_mad(a_temp), 0)) AS t_sd,
           coalesce(array_length(a_temp, 1), 0) AS n_temp
    FROM b
  ),
  d AS (
    SELECT c.*,
           coalesce(n_fc >= 7 AND fc IS NOT NULL AND fc - fc_med >= greatest(3, 2 * fc_sd), false) AS f_fc,
           coalesce(n_vfc >= 7 AND vfc IS NOT NULL AND ln(vfc::float8) - lv_med <= -greatest(0.223, 2 * lv_sd), false) AS f_vfc,
           coalesce(n_temp >= 7 AND temp IS NOT NULL AND temp - t_med >= greatest(0.4, 2 * t_sd), false) AS f_temp
    FROM c
  ),
  e AS (
    SELECT d.*, (f_fc::int + f_vfc::int + f_temp::int) AS s,
           lag(d.noite) OVER w AS noite_ant,
           lag(f_fc::int + f_vfc::int + f_temp::int) OVER w AS s_ant
    FROM d WINDOW w AS (ORDER BY d.noite)
  )
  SELECT e.noite, e.fc, e.fc_med::real, e.f_fc, e.vfc, exp(e.lv_med)::real, e.f_vfc, e.temp, e.t_med::real, e.f_temp,
         e.s, e.base_n, e.doente,
         CASE
           WHEN greatest(e.n_fc, e.n_vfc) < 7 THEN 'calibrando'
           WHEN e.s = 3 OR (e.s >= 2 AND coalesce(e.s_ant, 0) >= 2 AND e.noite_ant = e.noite - 1) THEN 'estresse'
           WHEN e.s >= 1 THEN 'observar'
           ELSE 'normal'
         END
  FROM e
  ORDER BY e.noite DESC
  LIMIT 30;
$$;

REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION saude_radar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION saude_radar(UUID, TEXT) TO authenticated;
