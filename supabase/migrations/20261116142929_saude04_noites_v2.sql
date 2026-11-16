-- Saúde 04 — noites-v2: janela 22:00–08:00 (rotulada pela manhã) e mínimos de dado.
--   fc_repouso  só com ≥ 180 min medidos na noite (evita "noite" feita só de manhã/treino)
--   vfc_noturna só com ≥ 6 janelas de 5 min (cobertura ≥ 0,5) na mesma janela
CREATE OR REPLACE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT)
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
           percentile_cont(0.5) WITHIN GROUP (ORDER BY rmssd_ms)::real AS mediana,
           count(*)::int AS janelas
    FROM saude_vfc_janelas
    WHERE workspace_id = p_workspace_id AND inicio >= now() - make_interval(days => p_dias + 1)
      AND ((inicio AT TIME ZONE p_tz)::time >= '22:00' OR (inicio AT TIME ZONE p_tz)::time < '08:00')
      AND cobertura >= 0.5
    GROUP BY 1
  )
  SELECT coalesce(fc.noite, v.noite), coalesce(fc.minutos, 0), fc.fc_repouso,
         CASE WHEN v.janelas >= 6 THEN v.mediana END, coalesce(v.janelas, 0)
  FROM fc FULL JOIN v ON v.noite = fc.noite
  ORDER BY 1;
$$;
