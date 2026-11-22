-- =====================================================================
-- Saúde 14
--   * noites-v8: VFC só com janelas de boa cobertura (≥ 80% dos batimentos captados). Na noite de 22/11,
--     com o relógio abaixo de 20% de bateria, a cobertura caiu para 57% e a VFC saiu 60 ms (normal 35).
--   * saude_treinos_painel: treinos com zonas pela SUA FC máxima, carga, recuperação cardíaca e calorias
--     (para a aba Treinos do app do celular).
-- =====================================================================
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
      ON j.workspace_id = p_workspace_id AND j.inicio >= s.sono_inicio AND j.inicio < s.sono_fim AND j.cobertura >= 0.8
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

-- ---------------------------------------------------------------------
-- treinos-v2: painel de treinos
--   FC máx. pessoal = maior valor visto nos treinos (Samsung Health ou média por minuto), mín. 170
--   zonas: Z1 < 60% · Z2 60–70% · Z3 70–80% · Z4 80–90% · Z5 ≥ 90% da FC máx.
--   carga: a mesma do painel (minutos ponderados pelo batimento) — prontidão e site usam a mesma
--   recuperação (recuperacao-v1): queda da FC ~1 e ~2 min após o fim; só vale fora d'água,
--   com FC no fim ≥ 100 e sem outro treino começando em até 10 min
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_treinos_painel(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS JSONB
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ev AS (
    SELECT e.id, e.inicio, e.fim, e.origem, e.detalhes
    FROM saude_eventos e
    WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado AND e.fim IS NOT NULL AND e.fim > e.inicio
      AND e.inicio >= now() - make_interval(days => p_dias)
  ),
  fm AS (
    SELECT greatest(
      170,
      coalesce((SELECT max((s.dados->>'fc_max')::real) FROM saude_samsung s
                WHERE s.workspace_id = p_workspace_id AND s.tipo = 'exercicio' AND s.inicio >= now() - interval '120 days'
                  AND (s.dados->>'fc_max')::real < 220), 0),
      coalesce((SELECT max(b.bpm_medio) FROM saude_eventos e
                JOIN saude_bpm_minuto b ON b.workspace_id = p_workspace_id AND b.minuto >= e.inicio AND b.minuto < e.fim AND b.amostras >= 20
                WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado AND e.inicio >= now() - interval '120 days'), 0)
    )::real AS fcmax
  ),
  z AS (
    SELECT ev.id, fm.fcmax,
           count(b.minuto)::int AS medidos,
           avg(b.bpm_medio)::real AS fc_media,
           max(b.bpm_medio)::real AS fc_pico,
           count(*) FILTER (WHERE b.bpm_medio < 0.6 * fm.fcmax)::int AS z1,
           count(*) FILTER (WHERE b.bpm_medio >= 0.6 * fm.fcmax AND b.bpm_medio < 0.7 * fm.fcmax)::int AS z2,
           count(*) FILTER (WHERE b.bpm_medio >= 0.7 * fm.fcmax AND b.bpm_medio < 0.8 * fm.fcmax)::int AS z3,
           count(*) FILTER (WHERE b.bpm_medio >= 0.8 * fm.fcmax AND b.bpm_medio < 0.9 * fm.fcmax)::int AS z4,
           count(*) FILTER (WHERE b.bpm_medio >= 0.9 * fm.fcmax)::int AS z5,
           coalesce(sum(CASE WHEN b.bpm_medio >= 160 THEN 4 WHEN b.bpm_medio >= 140 THEN 3 WHEN b.bpm_medio >= 120 THEN 2
                             WHEN b.bpm_medio >= 100 THEN 1 ELSE 0 END), 0)::int AS carga
    FROM ev CROSS JOIN fm
    LEFT JOIN saude_bpm_minuto b ON b.workspace_id = p_workspace_id AND b.minuto >= ev.inicio AND b.minuto < ev.fim
    GROUP BY ev.id, fm.fcmax
  ),
  r AS (
    SELECT ev.id,
           (SELECT max(b.bpm_medio) FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
              AND b.minuto >= date_trunc('minute', ev.fim) - interval '2 minutes' AND b.minuto <= date_trunc('minute', ev.fim)) AS fc_fim,
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
              AND b.minuto = date_trunc('minute', ev.fim) + interval '1 minute' LIMIT 1) AS fc_1,
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
              AND b.minuto = date_trunc('minute', ev.fim) + interval '2 minutes' LIMIT 1) AS fc_2,
           EXISTS (SELECT 1 FROM ev o WHERE o.id <> ev.id AND o.inicio >= ev.fim - interval '1 minute'
                     AND o.inicio < ev.fim + interval '10 minutes') AS emendado
    FROM ev
  )
  SELECT jsonb_build_object(
    'algoritmo', 'treinos-v2',
    'fcmax', (SELECT round(fcmax) FROM fm),
    'zonas_bpm', (SELECT jsonb_build_array(round(0.6 * fcmax), round(0.7 * fcmax), round(0.8 * fcmax), round(0.9 * fcmax)) FROM fm),
    'treinos', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', ev.id, 'inicio', ev.inicio, 'fim', ev.fim, 'origem', ev.origem,
      'modalidade', ev.detalhes->>'modalidade', 'tipo_samsung', ev.detalhes->>'tipo_samsung',
      'esforco', (ev.detalhes->>'esforco')::int, 'calorias', round((ev.detalhes->>'calorias')::numeric),
      'distancia_m', round((ev.detalhes->>'distancia_m')::numeric),
      'minutos', round(extract(epoch FROM ev.fim - ev.inicio) / 60),
      'medidos', z.medidos, 'fc_media', round(z.fc_media::numeric), 'fc_pico', round(z.fc_pico::numeric),
      'zonas', jsonb_build_array(z.z1, z.z2, z.z3, z.z4, z.z5), 'carga', z.carga,
      'recuperacao', CASE WHEN r.fc_fim >= 100 AND r.fc_1 IS NOT NULL AND r.fc_1 <= r.fc_fim AND NOT r.emendado
                               AND coalesce(ev.detalhes->>'modalidade', '') <> 'Natação'
                          THEN jsonb_strip_nulls(jsonb_build_object('fc_fim', round(r.fc_fim::numeric),
                                 'queda1', round((r.fc_fim - r.fc_1)::numeric), 'queda2', round((r.fc_fim - r.fc_2)::numeric))) END
    )) ORDER BY ev.inicio DESC), '[]'::jsonb)
  )
  FROM ev JOIN z ON z.id = ev.id JOIN r ON r.id = ev.id;
$$;

REVOKE EXECUTE ON FUNCTION saude_treinos_painel(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_treinos_painel(UUID, INT, TEXT) TO authenticated, service_role;
