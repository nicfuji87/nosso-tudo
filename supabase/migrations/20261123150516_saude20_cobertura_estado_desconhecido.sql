-- =====================================================================
-- saude20: cobertura-v2 — não trata ausência de transição como certeza de "no pulso"
--   Cada minuto da janela (sessão de sono do Samsung Health; sem ela 23:00–06:00) recebe UMA classe:
--     coberto           = há batimento do relógio (prova de uso)
--     carregando        = intervalo carregando → desconectado (transições do relógio)
--     fora_do_pulso     = intervalo fora_do_pulso → no_pulso
--     sem_dado_no_pulso = sem batimento, mas o Samsung Health classificou fase de sono nesse minuto
--                         (evidência independente de que o relógio estava no pulso) → lacuna COMPROVADA
--     desconhecido      = sem batimento e sem evidência de uso nem de remoção
--   cobertura_comprovada  = coberto / (coberto + sem_dado_no_pulso)
--   cobertura_conservadora = coberto / (coberto + sem_dado_no_pulso + desconhecido)  ← meta de validação
-- =====================================================================
DROP FUNCTION IF EXISTS saude_cobertura_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_cobertura_noites(p_workspace_id UUID, p_dias INT DEFAULT 7, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (
  noite DATE, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, fonte_janela TEXT,
  minutos_janela INT, minutos_cobertos INT, minutos_carregando INT, minutos_fora_pulso INT,
  minutos_sem_dado_no_pulso INT, minutos_desconhecidos INT,
  cobertura_comprovada NUMERIC, cobertura_conservadora NUMERIC,
  maior_lacuna_min INT, maior_lacuna_comprovada_min INT, lacunas_acima_10 INT, lacunas_relogio INT
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH dias AS (
    SELECT generate_series((now() AT TIME ZONE p_tz)::date - (p_dias - 1), (now() AT TIME ZONE p_tz)::date, '1 day')::date AS noite
  ),
  janelas AS (
    SELECT d.noite, s.uid,
           coalesce(s.inicio, ((d.noite - 1) + time '23:00') AT TIME ZONE p_tz) AS inicio,
           coalesce(s.fim, (d.noite + time '06:00') AT TIME ZONE p_tz) AS fim,
           CASE WHEN s.uid IS NULL THEN 'padrao_23_06' ELSE 'sono_samsung' END AS fonte
    FROM dias d LEFT JOIN saude_sono(p_workspace_id, p_dias + 1, p_tz) s ON s.noite = d.noite
    WHERE coalesce(s.fim, (d.noite + time '06:00') AT TIME ZONE p_tz) <= now()
  ),
  ev AS (
    SELECT e.ts, e.tipo FROM saude_estado_eventos e
    WHERE e.workspace_id = p_workspace_id AND e.tipo IN ('carregando', 'desconectado', 'fora_do_pulso', 'no_pulso')
      AND e.ts >= now() - make_interval(days => p_dias + 2)
  ),
  just AS (
    SELECT 'carregando' AS tipo, ev.ts AS a, coalesce((SELECT min(x.ts) FROM ev x WHERE x.tipo = 'desconectado' AND x.ts > ev.ts), now()) AS b
    FROM ev WHERE ev.tipo = 'carregando'
    UNION ALL
    SELECT 'fora', ev.ts, coalesce((SELECT min(x.ts) FROM ev x WHERE x.tipo = 'no_pulso' AND x.ts > ev.ts), now())
    FROM ev WHERE ev.tipo = 'fora_do_pulso'
  ),
  -- fases do sono do Samsung Health (qualquer fase = relógio no pulso, por evidência independente)
  fases AS (
    SELECT j.noite, to_timestamp((f->>0)::bigint / 1000.0) AS a, to_timestamp((f->>1)::bigint / 1000.0) AS b
    FROM janelas j
    JOIN saude_samsung x ON x.workspace_id = p_workspace_id AND x.uid = j.uid
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(x.dados->'estagios', '[]'::jsonb)) AS f
  ),
  grade AS (
    SELECT j.noite, m.m,
           CASE
             WHEN EXISTS (SELECT 1 FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.minuto = m.m) THEN 'coberto'
             WHEN EXISTS (SELECT 1 FROM just WHERE just.tipo = 'carregando' AND m.m >= just.a - interval '1 minute' AND m.m < just.b) THEN 'carregando'
             WHEN EXISTS (SELECT 1 FROM just WHERE just.tipo = 'fora' AND m.m >= just.a - interval '1 minute' AND m.m < just.b) THEN 'fora_do_pulso'
             WHEN EXISTS (SELECT 1 FROM fases f WHERE f.noite = j.noite AND m.m + interval '1 minute' > f.a AND m.m < f.b) THEN 'sem_dado_no_pulso'
             ELSE 'desconhecido'
           END AS classe
    FROM janelas j
    CROSS JOIN LATERAL generate_series(date_trunc('minute', j.inicio), date_trunc('minute', j.fim) - interval '1 minute', interval '1 minute') AS m(m)
  ),
  ilhas AS (
    SELECT noite, m, classe,
           (classe IN ('sem_dado_no_pulso', 'desconhecido')) AS buraco,
           row_number() OVER (PARTITION BY noite ORDER BY m)
             - row_number() OVER (PARTITION BY noite, (classe IN ('sem_dado_no_pulso', 'desconhecido')) ORDER BY m) AS grupo,
           row_number() OVER (PARTITION BY noite ORDER BY m)
             - row_number() OVER (PARTITION BY noite, (classe = 'sem_dado_no_pulso') ORDER BY m) AS grupo_c
    FROM grade
  ),
  buracos AS (SELECT noite, grupo, count(*) AS tam FROM ilhas WHERE buraco GROUP BY noite, grupo),
  buracos_c AS (SELECT noite, grupo_c, count(*) AS tam FROM ilhas WHERE classe = 'sem_dado_no_pulso' GROUP BY noite, grupo_c)
  SELECT j.noite, j.inicio, j.fim, j.fonte,
         count(g.m)::int,
         count(*) FILTER (WHERE g.classe = 'coberto')::int,
         count(*) FILTER (WHERE g.classe = 'carregando')::int,
         count(*) FILTER (WHERE g.classe = 'fora_do_pulso')::int,
         count(*) FILTER (WHERE g.classe = 'sem_dado_no_pulso')::int,
         count(*) FILTER (WHERE g.classe = 'desconhecido')::int,
         round(100.0 * count(*) FILTER (WHERE g.classe = 'coberto')
               / nullif(count(*) FILTER (WHERE g.classe IN ('coberto', 'sem_dado_no_pulso')), 0), 1),
         round(100.0 * count(*) FILTER (WHERE g.classe = 'coberto')
               / nullif(count(*) FILTER (WHERE g.classe IN ('coberto', 'sem_dado_no_pulso', 'desconhecido')), 0), 1),
         coalesce((SELECT max(tam) FROM buracos bu WHERE bu.noite = j.noite), 0)::int,
         coalesce((SELECT max(tam) FROM buracos_c bc WHERE bc.noite = j.noite), 0)::int,
         (SELECT count(*) FROM buracos bu WHERE bu.noite = j.noite AND bu.tam > 10)::int,
         (SELECT count(*) FROM saude_coleta_lacunas l WHERE l.workspace_id = p_workspace_id AND l.inicio < j.fim AND l.fim > j.inicio)::int
  FROM janelas j JOIN grade g ON g.noite = j.noite
  GROUP BY j.noite, j.inicio, j.fim, j.fonte
  ORDER BY j.noite;
$$;
REVOKE EXECUTE ON FUNCTION saude_cobertura_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_cobertura_noites(UUID, INT, TEXT) TO authenticated, service_role;
