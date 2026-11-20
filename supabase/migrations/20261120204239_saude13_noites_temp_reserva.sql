-- Saúde 13 — noites-v7: temperatura da pele de reserva.
-- Na noite de 20/11 o relógio não gravou a temperatura (0 janelas); o Samsung Health mediu (406 leituras).
-- Quando a nossa tem < 24 janelas, usa a média do Samsung Health da mesma noite (as duas ficaram a ±0,3 °C
-- nas noites com as duas). Nova coluna fonte_temp: 'relogio' | 'samsung'.
DROP FUNCTION IF EXISTS saude_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT, temp_pele REAL, janelas_temp INT,
               sono_inicio TIMESTAMPTZ, sono_fim TIMESTAMPTZ, fonte_sono TEXT, spo2_media REAL, spo2_min REAL, fonte_temp TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n0 AS (
    SELECT ((minuto AT TIME ZONE p_tz) + interval '3 hours')::date AS noite, minuto, bpm_medio, amostras
    FROM saude_bpm_minuto
    WHERE workspace_id = p_workspace_id AND minuto >= now() - make_interval(days => p_dias + 1)
      AND ((minuto AT TIME ZONE p_tz)::time >= '21:00' OR (minuto AT TIME ZONE p_tz)::time < '09:00')
  ),
  n1 AS ( -- lacuna > 10 min (carregando, fora do pulso) separa trechos
    SELECT n0.*, CASE WHEN minuto - lag(minuto) OVER (PARTITION BY noite ORDER BY minuto) > interval '10 minutes' THEN 1 ELSE 0 END AS salto
    FROM n0
  ),
  n AS (SELECT n1.*, sum(salto) OVER (PARTITION BY noite ORDER BY minuto) AS seg FROM n1),
  r AS (
    SELECT noite, seg, minuto,
           avg(bpm_medio) OVER w30 AS media30, count(*) OVER w30 AS n30,
           avg(bpm_medio) OVER w15 AS media15
    FROM n WHERE amostras >= 15
    WINDOW w30 AS (PARTITION BY noite, seg ORDER BY minuto RANGE BETWEEN interval '29 minutes' PRECEDING AND CURRENT ROW),
           w15 AS (PARTITION BY noite, seg ORDER BY minuto RANGE BETWEEN interval '14 minutes' PRECEDING AND CURRENT ROW)
  ),
  fc AS (
    SELECT n.noite, count(*)::int AS minutos,
           CASE WHEN count(*) >= 180
                THEN (SELECT min(r.media30) FROM r WHERE r.noite = n.noite AND r.n30 >= 20)::real END AS fc_repouso
    FROM n GROUP BY n.noite
  ),
  rs AS ( -- o trecho onde o batimento foi mais baixo é o do sono
    SELECT DISTINCT ON (r.noite) r.noite, r.seg FROM r WHERE r.n30 >= 20 ORDER BY r.noite, r.media30
  ),
  ss AS ( -- maior sono do Samsung Health por noite (rotulada pelo dia em que acordou)
    SELECT DISTINCT ON ((fim AT TIME ZONE p_tz)::date) (fim AT TIME ZONE p_tz)::date AS noite, inicio, fim
    FROM saude_samsung
    WHERE workspace_id = p_workspace_id AND tipo = 'sono' AND fim IS NOT NULL
      AND inicio >= now() - make_interval(days => p_dias + 2) AND fim - inicio >= interval '3 hours'
    ORDER BY (fim AT TIME ZONE p_tz)::date, fim - inicio DESC
  ),
  sp AS ( -- temperatura da pele do Samsung Health na noite (reserva quando o relógio não gravou a nossa)
    SELECT DISTINCT ON ((fim AT TIME ZONE p_tz)::date) (fim AT TIME ZONE p_tz)::date AS noite, (dados->>'media')::real AS media
    FROM saude_samsung
    WHERE workspace_id = p_workspace_id AND tipo = 'temp_pele' AND fim IS NOT NULL AND dados ? 'media'
      AND (dados->>'n')::int >= 100
      AND inicio >= now() - make_interval(days => p_dias + 2) AND fim - inicio >= interval '3 hours'
    ORDER BY (fim AT TIME ZONE p_tz)::date, fim - inicio DESC
  ),
  so AS ( -- SpO₂ da noite (Samsung Health mede durante o sono)
    SELECT DISTINCT ON ((fim AT TIME ZONE p_tz)::date) (fim AT TIME ZONE p_tz)::date AS noite,
           (dados->>'media')::real AS media, (dados->>'min')::real AS minimo
    FROM saude_samsung
    WHERE workspace_id = p_workspace_id AND tipo = 'spo2' AND fim IS NOT NULL AND dados ? 'media'
      AND inicio >= now() - make_interval(days => p_dias + 2) AND fim - inicio >= interval '3 hours'
    ORDER BY (fim AT TIME ZONE p_tz)::date, fim - inicio DESC
  ),
  ini AS (
    SELECT fc.noite, fc.minutos, fc.fc_repouso, rs.seg,
           (SELECT min(r.minuto) FROM r WHERE r.noite = fc.noite AND r.seg = rs.seg AND r.media15 <= fc.fc_repouso + 8) AS est_inicio
    FROM fc LEFT JOIN rs ON rs.noite = fc.noite
  ),
  est AS (
    SELECT ini.*,
           coalesce(
             (SELECT min(r.minuto) FROM r WHERE r.noite = ini.noite AND r.seg = ini.seg
                AND r.minuto >= ini.est_inicio + interval '3 hours' AND r.media15 >= ini.fc_repouso + 20),
             (SELECT max(n.minuto) FROM n WHERE n.noite = ini.noite AND n.seg = ini.seg)
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
         CASE WHEN t.janelas >= 24 THEN t.mediana ELSE sp.media END, coalesce(t.janelas, 0),
         s.sono_inicio, s.sono_fim, s.fonte_sono, so.media, so.minimo,
         CASE WHEN t.janelas >= 24 THEN 'relogio' WHEN sp.media IS NOT NULL THEN 'samsung' END
  FROM s
  LEFT JOIN v ON v.noite = s.noite
  LEFT JOIN t ON t.noite = s.noite
  LEFT JOIN so ON so.noite = s.noite
  LEFT JOIN sp ON sp.noite = s.noite
  ORDER BY 1;
$$;

REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated, service_role;
