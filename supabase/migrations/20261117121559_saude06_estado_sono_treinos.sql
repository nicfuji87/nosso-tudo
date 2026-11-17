-- =====================================================================
-- Saúde 06 — linha do tempo do relógio, sono estimado e resumo de treinos por intervalo
-- =====================================================================

-- 1. Linha do tempo do relógio: carregando / desconectado / no pulso / fora do pulso, e amostras
--    de bateria (uma por envio). Explica as lacunas do batimento e mede o gasto de bateria.
CREATE TABLE IF NOT EXISTS saude_estado_eventos (
  dispositivo_id  UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ts              TIMESTAMPTZ NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('amostra', 'carregando', 'desconectado', 'no_pulso', 'fora_do_pulso')),
  bateria         SMALLINT CHECK (bateria BETWEEN 0 AND 100),
  PRIMARY KEY (dispositivo_id, ts, tipo)
);
CREATE INDEX IF NOT EXISTS idx_saude_estado_ws_ts ON saude_estado_eventos (workspace_id, ts DESC);
ALTER TABLE saude_estado_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_estado_eventos;
CREATE POLICY p_ws_select ON saude_estado_eventos FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));
REVOKE INSERT, UPDATE, DELETE ON saude_estado_eventos FROM anon, authenticated;
GRANT SELECT ON saude_estado_eventos TO authenticated;

-- 2. search_path fixo nas funções de estatística (alerta do linter)
ALTER FUNCTION saude_mediana(DOUBLE PRECISION[]) SET search_path = public;
ALTER FUNCTION saude_mad(DOUBLE PRECISION[]) SET search_path = public;

-- 3. Noites v4: período de sono ESTIMADO pelo batimento (não há sensor de sono aqui)
--    início = 1º minuto (após 21h) em que a média de 15 min fica ≤ repouso + 8
--    fim    = 1º minuto, 3 h depois do início, em que a média de 15 min passa de repouso + 20 (levantou),
--             ou o último minuto antes das 9h
--    VFC e temperatura da pele passam a ser medidas SÓ dentro desse período: acordado, treino e banho
--    da manhã não contaminam mais a noite.
DROP FUNCTION IF EXISTS saude_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT, temp_pele REAL, janelas_temp INT,
               sono_inicio TIMESTAMPTZ, sono_fim TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n AS (
    SELECT ((minuto AT TIME ZONE p_tz) + interval '3 hours')::date AS noite, minuto, bpm_medio, amostras
    FROM saude_bpm_minuto
    WHERE workspace_id = p_workspace_id AND minuto >= now() - make_interval(days => p_dias + 1)
      AND ((minuto AT TIME ZONE p_tz)::time >= '21:00' OR (minuto AT TIME ZONE p_tz)::time < '09:00')
  ),
  r AS (
    SELECT noite, minuto,
           avg(bpm_medio) OVER w30 AS media30, count(*) OVER w30 AS n30,
           avg(bpm_medio) OVER w15 AS media15
    FROM n WHERE amostras >= 15
    WINDOW w30 AS (PARTITION BY noite ORDER BY minuto RANGE BETWEEN interval '29 minutes' PRECEDING AND CURRENT ROW),
           w15 AS (PARTITION BY noite ORDER BY minuto RANGE BETWEEN interval '14 minutes' PRECEDING AND CURRENT ROW)
  ),
  fc AS (
    SELECT n.noite, count(*)::int AS minutos,
           CASE WHEN count(*) >= 180
                THEN (SELECT min(r.media30) FROM r WHERE r.noite = n.noite AND r.n30 >= 20)::real END AS fc_repouso
    FROM n GROUP BY n.noite
  ),
  ini AS (
    SELECT fc.noite, fc.minutos, fc.fc_repouso,
           (SELECT min(r.minuto) FROM r WHERE r.noite = fc.noite AND r.media15 <= fc.fc_repouso + 8) AS sono_inicio
    FROM fc
  ),
  s AS (
    SELECT ini.*,
           coalesce(
             (SELECT min(r.minuto) FROM r WHERE r.noite = ini.noite AND r.minuto >= ini.sono_inicio + interval '3 hours'
                AND r.media15 >= ini.fc_repouso + 20),
             (SELECT max(r.minuto) FROM r WHERE r.noite = ini.noite)
           ) AS sono_fim
    FROM ini
  ),
  v AS (
    SELECT s.noite, percentile_cont(0.5) WITHIN GROUP (ORDER BY j.rmssd_ms)::real AS mediana, count(*)::int AS janelas
    FROM s JOIN saude_vfc_janelas j
      ON j.workspace_id = p_workspace_id AND j.inicio >= s.sono_inicio AND j.inicio < s.sono_fim AND j.cobertura >= 0.5
    GROUP BY s.noite
  ),
  t AS (
    SELECT s.noite, percentile_cont(0.5) WITHIN GROUP (ORDER BY j.pele)::real AS mediana, count(*)::int AS janelas
    FROM s JOIN saude_temp_janelas j
      ON j.workspace_id = p_workspace_id AND j.inicio >= s.sono_inicio AND j.inicio < s.sono_fim
    GROUP BY s.noite
  )
  SELECT s.noite, s.minutos, s.fc_repouso,
         CASE WHEN v.janelas >= 6 THEN v.mediana END, coalesce(v.janelas, 0),
         CASE WHEN t.janelas >= 24 THEN t.mediana END, coalesce(t.janelas, 0),
         CASE WHEN s.fc_repouso IS NOT NULL THEN s.sono_inicio END,
         CASE WHEN s.fc_repouso IS NOT NULL THEN s.sono_fim END
  FROM s
  LEFT JOIN v ON v.noite = s.noite
  LEFT JOIN t ON t.noite = s.noite
  ORDER BY 1;
$$;
REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated;

-- 4. Resumo de batimento por intervalo (treino confirmado, dividido ou lançado à mão).
--    Cada treino mostra os SEUS números, mesmo quando dois treinos saíram de um só bloco detectado.
CREATE OR REPLACE FUNCTION saude_resumo_intervalos(p_workspace_id UUID, p_inicios TIMESTAMPTZ[], p_fins TIMESTAMPTZ[])
RETURNS TABLE (idx INT, minutos INT, fc_media REAL, fc_max INT, z_leve INT, z_moderado INT, z_intenso INT, z_maximo INT, carga INT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT i.idx::int, count(b.*)::int, avg(b.bpm_medio)::real, max(b.bpm_max)::int,
         count(*) FILTER (WHERE b.bpm_medio < 120)::int,
         count(*) FILTER (WHERE b.bpm_medio >= 120 AND b.bpm_medio < 140)::int,
         count(*) FILTER (WHERE b.bpm_medio >= 140 AND b.bpm_medio < 160)::int,
         count(*) FILTER (WHERE b.bpm_medio >= 160)::int,
         coalesce(sum(CASE WHEN b.bpm_medio >= 160 THEN 4 WHEN b.bpm_medio >= 140 THEN 3 WHEN b.bpm_medio >= 120 THEN 2
                           WHEN b.bpm_medio >= 100 THEN 1 ELSE 0 END), 0)::int
  FROM unnest(p_inicios, p_fins) WITH ORDINALITY AS i(ini, fim, idx)
  LEFT JOIN saude_bpm_minuto b
    ON b.workspace_id = p_workspace_id AND b.minuto >= i.ini AND b.minuto < i.fim
  GROUP BY i.idx
  ORDER BY i.idx;
$$;
REVOKE EXECUTE ON FUNCTION saude_resumo_intervalos(UUID, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_resumo_intervalos(UUID, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;
