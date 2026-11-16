-- =====================================================================
-- Saúde 03 — agregados para o painel (somente leitura, SECURITY INVOKER: valem as RLS)
-- =====================================================================

-- Noites: período 21:00–09:00 local, rotulado pela manhã.
--   fc_repouso  = menor média móvel de 30 min (≥ 20 min medidos na janela, minutos com ≥ 20 amostras)
--   vfc_noturna = mediana das janelas de 5 min entre 00:00 e 07:00 com cobertura ≥ 0,5
-- Sem dado de sono, é "período noturno", não "sono". Algoritmo: noites-v1.
CREATE OR REPLACE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH b AS (
    SELECT minuto, bpm_medio, amostras, (minuto AT TIME ZONE p_tz) AS l
    FROM saude_bpm_minuto
    WHERE workspace_id = p_workspace_id AND minuto >= now() - make_interval(days => p_dias + 1)
  ),
  n AS (
    SELECT (l + interval '3 hours')::date AS noite, minuto, bpm_medio, amostras
    FROM b WHERE l::time >= '21:00' OR l::time < '09:00'
  ),
  r AS (
    SELECT noite,
           avg(bpm_medio) OVER w AS media30,
           count(*)       OVER w AS n30
    FROM n WHERE amostras >= 20
    WINDOW w AS (PARTITION BY noite ORDER BY minuto RANGE BETWEEN interval '29 minutes' PRECEDING AND CURRENT ROW)
  ),
  fc AS (
    SELECT n.noite, count(*)::int AS minutos,
           (SELECT min(r.media30) FROM r WHERE r.noite = n.noite AND r.n30 >= 20)::real AS fc_repouso
    FROM n GROUP BY n.noite
  ),
  v AS (
    SELECT (inicio AT TIME ZONE p_tz)::date AS noite,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY rmssd_ms)::real AS vfc_noturna,
           count(*)::int AS janelas
    FROM saude_vfc_janelas
    WHERE workspace_id = p_workspace_id AND inicio >= now() - make_interval(days => p_dias + 1)
      AND (inicio AT TIME ZONE p_tz)::time < '07:00' AND cobertura >= 0.5
    GROUP BY 1
  )
  SELECT coalesce(fc.noite, v.noite) AS noite, coalesce(fc.minutos, 0), fc.fc_repouso, v.vfc_noturna, coalesce(v.janelas, 0)
  FROM fc FULL JOIN v ON v.noite = fc.noite
  ORDER BY 1;
$$;

-- Treinos detectados (treino-v1): blocos de minutos com FC média ≥ p_limiar, unindo falhas de até
-- 3 min, com ≥ 10 min de duração e ≥ 8 minutos medidos. Faixas fixas de esforço (sem FC máx. pessoal).
-- É uma SUGESTÃO: a modalidade e o esforço percebido são confirmados pela pessoa.
CREATE OR REPLACE FUNCTION saude_treinos_detectados(p_workspace_id UUID, p_dias INT DEFAULT 14, p_limiar REAL DEFAULT 100)
RETURNS TABLE (inicio TIMESTAMPTZ, fim TIMESTAMPTZ, minutos INT, fc_media REAL, fc_max INT,
               z_leve INT, z_moderado INT, z_intenso INT, z_maximo INT, carga INT)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH b AS (
    SELECT minuto, bpm_medio, bpm_max
    FROM saude_bpm_minuto
    WHERE workspace_id = p_workspace_id AND minuto >= now() - make_interval(days => p_dias)
      AND bpm_medio >= p_limiar
  ),
  g AS (
    SELECT *, CASE WHEN minuto - lag(minuto) OVER (ORDER BY minuto) <= interval '3 minutes' THEN 0 ELSE 1 END AS novo FROM b
  ),
  s AS (SELECT *, sum(novo) OVER (ORDER BY minuto) AS grupo FROM g)
  SELECT min(minuto), max(minuto) + interval '1 minute', count(*)::int,
         avg(bpm_medio)::real, max(bpm_max)::int,
         count(*) FILTER (WHERE bpm_medio < 120)::int,
         count(*) FILTER (WHERE bpm_medio >= 120 AND bpm_medio < 140)::int,
         count(*) FILTER (WHERE bpm_medio >= 140 AND bpm_medio < 160)::int,
         count(*) FILTER (WHERE bpm_medio >= 160)::int,
         sum(CASE WHEN bpm_medio >= 160 THEN 4 WHEN bpm_medio >= 140 THEN 3 WHEN bpm_medio >= 120 THEN 2 ELSE 1 END)::int
  FROM s
  GROUP BY grupo
  HAVING max(minuto) - min(minuto) >= interval '10 minutes' AND count(*) >= 8
  ORDER BY 1 DESC;
$$;

REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION saude_treinos_detectados(UUID, INT, REAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION saude_treinos_detectados(UUID, INT, REAL) TO authenticated;
