-- =====================================================================
-- saude19: cobertura noturna do batimento (validação da coleta, independente dos logs do relógio)
--   saude_coleta_lacunas: lacunas registradas pelo próprio relógio (0.9.7+), com causa e recuperação
--   saude_cobertura_noites (cobertura-v1): por noite, dentro da sessão de sono do Samsung Health
--   (sem ela: 23:00–06:00), quantos minutos ELEGÍVEIS tiveram batimento.
--   Elegível = não estava carregando nem fora do pulso (transições do relógio). Lacuna injustificada =
--   minutos elegíveis seguidos sem batimento. Não altera VFC, prontidão nem repouso.
-- =====================================================================
CREATE TABLE IF NOT EXISTS saude_coleta_lacunas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispositivo_id UUID NOT NULL REFERENCES saude_dispositivos(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  causa TEXT NOT NULL,
  reconexoes INT NOT NULL DEFAULT 0,
  recuperacao_ms BIGINT,
  no_pulso BOOLEAN,
  carregando BOOLEAN,
  bateria INT,
  estado_sensor TEXT,
  versao_app TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispositivo_id, inicio)
);
CREATE INDEX IF NOT EXISTS saude_coleta_lacunas_ws ON saude_coleta_lacunas (workspace_id, inicio DESC);
ALTER TABLE saude_coleta_lacunas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_coleta_lacunas;
CREATE POLICY p_ws_select ON saude_coleta_lacunas FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));

CREATE OR REPLACE FUNCTION saude_cobertura_noites(p_workspace_id UUID, p_dias INT DEFAULT 7, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (
  noite DATE, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, fonte_janela TEXT,
  minutos_janela INT, minutos_carregando INT, minutos_fora_pulso INT, minutos_elegiveis INT,
  minutos_cobertos INT, cobertura NUMERIC, maior_lacuna_min INT, lacunas_acima_10 INT, lacunas_relogio INT
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH dias AS (
    SELECT generate_series((now() AT TIME ZONE p_tz)::date - (p_dias - 1), (now() AT TIME ZONE p_tz)::date, '1 day')::date AS noite
  ),
  janelas AS (
    SELECT d.noite,
           coalesce(s.inicio, ((d.noite - 1) + time '23:00') AT TIME ZONE p_tz) AS inicio,
           coalesce(s.fim, (d.noite + time '06:00') AT TIME ZONE p_tz) AS fim,
           CASE WHEN s.uid IS NULL THEN 'padrao_23_06' ELSE 'sono_samsung' END AS fonte
    FROM dias d LEFT JOIN saude_sono(p_workspace_id, p_dias + 1, p_tz) s ON s.noite = d.noite
    WHERE coalesce(s.fim, (d.noite + time '06:00') AT TIME ZONE p_tz) <= now()
  ),
  ev AS (
    SELECT e.ts, e.tipo, lead(e.ts) OVER (ORDER BY e.ts) AS prox_ts, lead(e.tipo) OVER (ORDER BY e.ts) AS prox_tipo
    FROM saude_estado_eventos e
    WHERE e.workspace_id = p_workspace_id AND e.tipo IN ('carregando', 'desconectado', 'fora_do_pulso', 'no_pulso')
      AND e.ts >= now() - make_interval(days => p_dias + 2)
  ),
  -- intervalos justificados: carregando até desconectar; fora do pulso até voltar ao pulso
  just AS (
    SELECT 'carregando' AS tipo, ts AS a, coalesce((SELECT min(x.ts) FROM ev x WHERE x.tipo = 'desconectado' AND x.ts > ev.ts), now()) AS b
    FROM ev WHERE tipo = 'carregando'
    UNION ALL
    SELECT 'fora', ts, coalesce((SELECT min(x.ts) FROM ev x WHERE x.tipo = 'no_pulso' AND x.ts > ev.ts), now())
    FROM ev WHERE tipo = 'fora_do_pulso'
  ),
  grade AS (
    SELECT j.noite, m.m,
           EXISTS (SELECT 1 FROM just WHERE just.tipo = 'carregando' AND m.m >= just.a - interval '1 minute' AND m.m < just.b) AS carregando,
           EXISTS (SELECT 1 FROM just WHERE just.tipo = 'fora' AND m.m >= just.a - interval '1 minute' AND m.m < just.b) AS fora,
           EXISTS (SELECT 1 FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.minuto = m.m) AS coberto
    FROM janelas j
    CROSS JOIN LATERAL generate_series(date_trunc('minute', j.inicio), date_trunc('minute', j.fim) - interval '1 minute', interval '1 minute') AS m(m)
  ),
  ilhas AS (
    SELECT noite, m, (NOT coberto AND NOT carregando AND NOT fora) AS buraco,
           row_number() OVER (PARTITION BY noite ORDER BY m)
             - row_number() OVER (PARTITION BY noite, (NOT coberto AND NOT carregando AND NOT fora) ORDER BY m) AS grupo
    FROM grade
  ),
  buracos AS (
    SELECT noite, grupo, count(*) AS tam FROM ilhas WHERE buraco GROUP BY noite, grupo
  )
  SELECT j.noite, j.inicio, j.fim, j.fonte,
         count(g.m)::int,
         count(g.m) FILTER (WHERE g.carregando)::int,
         count(g.m) FILTER (WHERE g.fora AND NOT g.carregando)::int,
         count(g.m) FILTER (WHERE NOT g.carregando AND NOT g.fora)::int,
         count(g.m) FILTER (WHERE NOT g.carregando AND NOT g.fora AND g.coberto)::int,
         round(100.0 * count(g.m) FILTER (WHERE NOT g.carregando AND NOT g.fora AND g.coberto)
               / nullif(count(g.m) FILTER (WHERE NOT g.carregando AND NOT g.fora), 0), 1),
         coalesce((SELECT max(tam) FROM buracos bu WHERE bu.noite = j.noite), 0)::int,
         (SELECT count(*) FROM buracos bu WHERE bu.noite = j.noite AND bu.tam > 10)::int,
         (SELECT count(*) FROM saude_coleta_lacunas l WHERE l.workspace_id = p_workspace_id AND l.inicio < j.fim AND l.fim > j.inicio)::int
  FROM janelas j JOIN grade g ON g.noite = j.noite
  GROUP BY j.noite, j.inicio, j.fim, j.fonte
  ORDER BY j.noite;
$$;
REVOKE EXECUTE ON FUNCTION saude_cobertura_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_cobertura_noites(UUID, INT, TEXT) TO authenticated, service_role;
