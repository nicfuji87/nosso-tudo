-- Saúde 09 — noites-v5: quando o Samsung Health tem o sono da noite (≥ 3 h), o período de sono vem dele
-- (sensor de sono de verdade); senão, continua a estimativa pelo batimento (noites-v4).
-- VFC e temperatura da pele usam esse período. Nova coluna: fonte_sono ('samsung' | 'batimento').
DROP FUNCTION IF EXISTS saude_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT, temp_pele REAL, janelas_temp INT,
               sono_inicio TIMESTAMPTZ, sono_fim TIMESTAMPTZ, fonte_sono TEXT)
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
  ss AS ( -- maior sono do Samsung Health por noite (rotulada pelo dia em que acordou)
    SELECT DISTINCT ON ((fim AT TIME ZONE p_tz)::date) (fim AT TIME ZONE p_tz)::date AS noite, inicio, fim
    FROM saude_samsung
    WHERE workspace_id = p_workspace_id AND tipo = 'sono' AND fim IS NOT NULL
      AND inicio >= now() - make_interval(days => p_dias + 2) AND fim - inicio >= interval '3 hours'
    ORDER BY (fim AT TIME ZONE p_tz)::date, fim - inicio DESC
  ),
  ini AS (
    SELECT fc.noite, fc.minutos, fc.fc_repouso,
           (SELECT min(r.minuto) FROM r WHERE r.noite = fc.noite AND r.media15 <= fc.fc_repouso + 8) AS est_inicio
    FROM fc
  ),
  est AS (
    SELECT ini.*,
           coalesce(
             (SELECT min(r.minuto) FROM r WHERE r.noite = ini.noite AND r.minuto >= ini.est_inicio + interval '3 hours'
                AND r.media15 >= ini.fc_repouso + 20),
             (SELECT max(r.minuto) FROM r WHERE r.noite = ini.noite)
           ) AS est_fim
    FROM ini
  ),
  s AS (
    SELECT coalesce(est.noite, ss.noite) AS noite, coalesce(est.minutos, 0) AS minutos, est.fc_repouso,
           CASE WHEN ss.inicio IS NOT NULL THEN ss.inicio WHEN est.fc_repouso IS NOT NULL THEN est.est_inicio END AS sono_inicio,
           CASE WHEN ss.fim IS NOT NULL THEN ss.fim WHEN est.fc_repouso IS NOT NULL THEN est.est_fim END AS sono_fim,
           CASE WHEN ss.inicio IS NOT NULL THEN 'samsung' WHEN est.fc_repouso IS NOT NULL THEN 'batimento' END AS fonte_sono
    FROM est FULL JOIN ss ON ss.noite = est.noite
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
         s.sono_inicio, s.sono_fim, s.fonte_sono
  FROM s
  LEFT JOIN v ON v.noite = s.noite
  LEFT JOIN t ON t.noite = s.noite
  ORDER BY 1;
$$;
REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated;
