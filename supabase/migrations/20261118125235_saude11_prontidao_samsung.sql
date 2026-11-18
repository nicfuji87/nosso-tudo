-- =====================================================================
-- Saúde 11 — v0.9
--   * noites-v6: sono estimado pelo batimento só dentro do trecho contínuo com o relógio no pulso
--     (antes, carregando/fora do pulso viravam "sono"); + SpO₂ da noite (Samsung Health)
--   * radar-v2: SpO₂ noturna como 4º sinal
--   * treinos do Samsung Health viram treinos do diário sozinhos (samsung-v1)
--   * recuperação do batimento após o treino (queda em ~1 e ~2 min)
--   * prontidao-v1: nota do dia (repouso, VFC, sono, carga 7 d × 28 d, radar) + hora de dormir sugerida
--   * novos dados do Samsung Health: passos, composição corporal, ritmo irregular, apneia do sono
--   * diagnóstico do app do celular (última sincronização, erros)
-- =====================================================================

ALTER TABLE saude_samsung DROP CONSTRAINT IF EXISTS saude_samsung_tipo_check;
ALTER TABLE saude_samsung ADD CONSTRAINT saude_samsung_tipo_check
  CHECK (tipo IN ('sono', 'spo2', 'temp_pele', 'exercicio', 'energia', 'passos', 'corpo', 'ritmo_irregular', 'apneia'));

ALTER TABLE saude_eventos DROP CONSTRAINT IF EXISTS saude_eventos_origem_check;
ALTER TABLE saude_eventos ADD CONSTRAINT saude_eventos_origem_check
  CHECK (origem IN ('manual', 'detectado', 'relogio', 'samsung'));
CREATE INDEX IF NOT EXISTS idx_saude_eventos_samsung_uid ON saude_eventos ((detalhes->>'samsung_uid')) WHERE detalhes ? 'samsung_uid';

ALTER TABLE saude_dispositivos ADD COLUMN IF NOT EXISTS diagnostico JSONB;

-- ---------------------------------------------------------------------
-- noites-v6
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS saude_noites(UUID, INT, TEXT);
CREATE FUNCTION saude_noites(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, minutos INT, fc_repouso REAL, vfc_noturna REAL, janelas INT, temp_pele REAL, janelas_temp INT,
               sono_inicio TIMESTAMPTZ, sono_fim TIMESTAMPTZ, fonte_sono TEXT, spo2_media REAL, spo2_min REAL)
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
         CASE WHEN t.janelas >= 24 THEN t.mediana END, coalesce(t.janelas, 0),
         s.sono_inicio, s.sono_fim, s.fonte_sono, so.media, so.minimo
  FROM s
  LEFT JOIN v ON v.noite = s.noite
  LEFT JOIN t ON t.noite = s.noite
  LEFT JOIN so ON so.noite = s.noite
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- radar-v2: + SpO₂ (fora: ≤ normal − máx(2 pontos, 2 desvios)); estresse = 3+ sinais, ou 2+ em 2 noites seguidas
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS saude_radar(UUID, TEXT);
CREATE FUNCTION saude_radar(p_workspace_id UUID, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (noite DATE, fc REAL, fc_normal REAL, fc_fora BOOLEAN, vfc REAL, vfc_normal REAL, vfc_fora BOOLEAN,
               temp REAL, temp_normal REAL, temp_fora BOOLEAN, sinais INT, base INT, doente BOOLEAN, nivel TEXT,
               spo2 REAL, spo2_normal REAL, spo2_fora BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH n AS (
    SELECT x.noite, x.fc_repouso AS fc, x.vfc_noturna AS vfc, x.temp_pele AS temp, x.spo2_media AS spo2,
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
             array_agg(p.temp::float8) FILTER (WHERE p.temp IS NOT NULL) AS a_temp,
             array_agg(p.spo2::float8) FILTER (WHERE p.spo2 IS NOT NULL) AS a_spo
      FROM (SELECT * FROM n p2 WHERE p2.noite < n.noite AND NOT p2.doente ORDER BY p2.noite DESC LIMIT 28) p
    ) h
  ),
  c AS (
    SELECT b.noite, b.fc, b.vfc, b.temp, b.spo2, b.base_n, b.doente,
           saude_mediana(a_fc) AS fc_med, greatest(1.5, 1.4826 * coalesce(saude_mad(a_fc), 0)) AS fc_sd,
           coalesce(array_length(a_fc, 1), 0) AS n_fc,
           saude_mediana(a_vfc) AS lv_med, greatest(0.08, 1.4826 * coalesce(saude_mad(a_vfc), 0)) AS lv_sd,
           coalesce(array_length(a_vfc, 1), 0) AS n_vfc,
           saude_mediana(a_temp) AS t_med, greatest(0.15, 1.4826 * coalesce(saude_mad(a_temp), 0)) AS t_sd,
           coalesce(array_length(a_temp, 1), 0) AS n_temp,
           saude_mediana(a_spo) AS s_med, greatest(1.0, 1.4826 * coalesce(saude_mad(a_spo), 0)) AS s_sd,
           coalesce(array_length(a_spo, 1), 0) AS n_spo
    FROM b
  ),
  d AS (
    SELECT c.*,
           coalesce(n_fc >= 7 AND fc IS NOT NULL AND fc - fc_med >= greatest(3, 2 * fc_sd), false) AS f_fc,
           coalesce(n_vfc >= 7 AND vfc IS NOT NULL AND ln(vfc::float8) - lv_med <= -greatest(0.223, 2 * lv_sd), false) AS f_vfc,
           coalesce(n_temp >= 7 AND temp IS NOT NULL AND temp - t_med >= greatest(0.4, 2 * t_sd), false) AS f_temp,
           coalesce(n_spo >= 7 AND spo2 IS NOT NULL AND spo2 - s_med <= -greatest(2, 2 * s_sd), false) AS f_spo
    FROM c
  ),
  e AS (
    SELECT d.*, (f_fc::int + f_vfc::int + f_temp::int + f_spo::int) AS s,
           lag(d.noite) OVER w AS noite_ant,
           lag(f_fc::int + f_vfc::int + f_temp::int + f_spo::int) OVER w AS s_ant
    FROM d WINDOW w AS (ORDER BY d.noite)
  )
  SELECT e.noite, e.fc, e.fc_med::real, e.f_fc, e.vfc, exp(e.lv_med)::real, e.f_vfc, e.temp, e.t_med::real, e.f_temp,
         e.s, e.base_n, e.doente,
         CASE
           WHEN greatest(e.n_fc, e.n_vfc) < 7 THEN 'calibrando'
           WHEN e.s >= 3 OR (e.s >= 2 AND coalesce(e.s_ant, 0) >= 2 AND e.noite_ant = e.noite - 1) THEN 'estresse'
           WHEN e.s >= 1 THEN 'observar'
           ELSE 'normal'
         END,
         e.spo2, e.s_med::real, e.f_spo
  FROM e
  ORDER BY e.noite DESC
  LIMIT 30;
$$;

-- ---------------------------------------------------------------------
-- samsung-v1: cada treino gravado no Samsung Health vira treino do diário (sem confirmar)
--   Convenção do usuário: "Outro" = musculação; "Aeróbica"/"Artes marciais" = judô ou jiu-jitsu (pelo histórico).
--   Não duplica: pula se já existe treino com o mesmo uid, ou um treino ativo cobrindo ≥ 50% da sessão.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_importar_treinos(p_workspace_id UUID, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS INT
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  x RECORD;
  t TEXT;
  m TEXT;
  n INT := 0;
BEGIN
  FOR x IN
    SELECT s.uid, s.inicio, s.fim, s.dados, d.profile_id
    FROM saude_samsung s JOIN saude_dispositivos d ON d.id = s.dispositivo_id
    WHERE s.workspace_id = p_workspace_id AND s.tipo = 'exercicio' AND s.fim IS NOT NULL
      AND s.inicio >= now() - interval '45 days' AND s.fim - s.inicio >= interval '5 minutes'
      AND NOT EXISTS (SELECT 1 FROM saude_eventos e WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino'
                        AND e.detalhes->>'samsung_uid' = s.uid)
      AND NOT EXISTS (SELECT 1 FROM saude_eventos e WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino'
                        AND NOT e.descartado AND e.fim IS NOT NULL AND e.inicio < s.fim AND s.inicio < e.fim
                        AND least(e.fim, s.fim) - greatest(e.inicio, s.inicio) >= (s.fim - s.inicio) / 2)
    ORDER BY s.inicio
  LOOP
    t := coalesce(x.dados->>'tipo_samsung', 'OTHER');
    m := CASE
      WHEN t ~ 'SWIMMING' THEN 'Natação'
      WHEN t IN ('OTHER', 'WEIGHT_MACHINE', 'CIRCUIT_TRAINING')
        OR t ~ '(WEIGHT|BENCH|SQUAT|DEADLIFT|LUNGE|LEG_|LAT_|SHOULDER|ARM_|RAISES|PULL_UPS|PUSH_UPS|CRUNCH|PLANK)' THEN 'Musculação'
      WHEN t IN ('AEROBICS', 'MARTIAL_ARTS', 'BOXING') THEN coalesce((
        SELECT e.detalhes->>'modalidade' FROM saude_eventos e
        WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado
          AND e.detalhes->>'modalidade' IN ('Judô', 'Jiu-jitsu')
        ORDER BY (extract(isodow FROM e.inicio AT TIME ZONE p_tz) = extract(isodow FROM x.inicio AT TIME ZONE p_tz)
                  AND abs(extract(epoch FROM ((e.inicio AT TIME ZONE p_tz)::time - (x.inicio AT TIME ZONE p_tz)::time))) <= 5400) DESC,
                 e.inicio DESC
        LIMIT 1), 'Judô')
      WHEN t ~ '(WALKING|HIKING)' THEN 'Caminhada'
      WHEN t ~ 'RUNNING' THEN 'Corrida'
      ELSE 'Outro'
    END;
    INSERT INTO saude_eventos (workspace_id, profile_id, tipo, inicio, fim, origem, algoritmo, detalhes)
    VALUES (p_workspace_id, x.profile_id, 'treino', x.inicio, x.fim, 'samsung', 'samsung-v1',
            jsonb_strip_nulls(jsonb_build_object(
              'modalidade', m, 'samsung_uid', x.uid, 'tipo_samsung', t,
              'auto', x.dados->'auto', 'calorias', x.dados->'calorias', 'distancia_m', x.dados->'distancia_m',
              'vo2max', x.dados->'vo2max')));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------
-- Recuperação do batimento após o treino (recuperacao-v1)
--   fc_fim = maior média por minuto nos 3 min finais; fc_1/fc_2 = minuto seguinte / o outro.
--   Médias por minuto suavizam: é um valor aproximado, bom para tendência.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_recuperacao(p_workspace_id UUID, p_fins TIMESTAMPTZ[])
RETURNS TABLE (idx INT, fc_fim REAL, fc_1 REAL, fc_2 REAL)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT i.idx::int,
         (SELECT max(b.bpm_medio) FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
            AND b.minuto >= date_trunc('minute', i.fim) - interval '2 minutes' AND b.minuto <= date_trunc('minute', i.fim))::real,
         (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
            AND b.minuto = date_trunc('minute', i.fim) + interval '1 minute' LIMIT 1)::real,
         (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
            AND b.minuto = date_trunc('minute', i.fim) + interval '2 minutes' LIMIT 1)::real
  FROM unnest(p_fins) WITH ORDINALITY AS i(fim, idx)
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- prontidao-v1: nota do dia (0–100) e hora de dormir sugerida. Não é diagnóstico.
--   parte de 100 e desconta: repouso acima do normal (−5/bpm, até −25), VFC abaixo (−1/%, até −25),
--   sono < 7h30 (−10/h, até −25), carga 7 d acima de 1,3× a média semanal de 28 d (−8; > 1,5× −15),
--   radar observar (−5) / estresse (−20). Normal pessoal: a partir de 3 noites (aproximado até 7).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_prontidao(p_workspace_id UUID, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  hoje DATE := (now() AT TIME ZONE p_tz)::date;
  r RECORD;
  nt RECORD;
  fatores JSONB := '[]'::jsonb;
  score NUMERIC := 100;
  tem_dado BOOLEAN := false;
  efeito NUMERIC;
  horas NUMERIC;
  aguda INT := 0;
  cronica NUMERIC;
  razao NUMERIC;
  desde_dados TIMESTAMPTZ;
  inis TIMESTAMPTZ[];
  fins TIMESTAMPTZ[];
  acordar INT;
  deitar INT;
  regular NUMERIC;
  qtd_noites INT;
  nivel TEXT;
  base_noites INT := 0;
  fonte TEXT;
BEGIN
  -- radar da noite de hoje
  SELECT * INTO r FROM saude_radar(p_workspace_id, p_tz) x WHERE x.noite = hoje LIMIT 1;
  IF FOUND THEN base_noites := r.base; END IF;
  IF base_noites >= 3 THEN
    IF r.fc IS NOT NULL AND r.fc_normal IS NOT NULL THEN
      tem_dado := true;
      efeito := -least(25, greatest(0, round((r.fc - r.fc_normal) * 5)));
      score := score + efeito;
      fatores := fatores || jsonb_build_object('sinal', 'repouso', 'efeito', efeito,
        'texto', format('Repouso %s bpm (normal %s)', round(r.fc::numeric), round(r.fc_normal::numeric)));
    END IF;
    IF r.vfc IS NOT NULL AND r.vfc_normal IS NOT NULL AND r.vfc_normal > 0 THEN
      tem_dado := true;
      efeito := -least(25, greatest(0, round((1 - r.vfc / r.vfc_normal) * 100)));
      score := score + efeito;
      fatores := fatores || jsonb_build_object('sinal', 'vfc', 'efeito', efeito,
        'texto', format('VFC %s ms (normal %s)', round(r.vfc::numeric), round(r.vfc_normal::numeric)));
    END IF;
    IF r.nivel IN ('observar', 'estresse') THEN
      efeito := CASE r.nivel WHEN 'estresse' THEN -20 ELSE -5 END;
      score := score + efeito;
      fatores := fatores || jsonb_build_object('sinal', 'radar', 'efeito', efeito,
        'texto', CASE r.nivel WHEN 'estresse' THEN 'Radar: corpo sob estresse' ELSE 'Radar: um sinal fora do normal' END);
    END IF;
  END IF;

  -- sono da noite de hoje
  SELECT * INTO nt FROM saude_noites(p_workspace_id, 2, p_tz) x WHERE x.noite = hoje AND x.sono_inicio IS NOT NULL LIMIT 1;
  IF FOUND THEN
    fonte := nt.fonte_sono;
    horas := round(extract(epoch FROM nt.sono_fim - nt.sono_inicio) / 3600.0, 1);
    tem_dado := true;
    efeito := -least(25, greatest(0, round((7.5 - horas) * 10)));
    score := score + efeito;
    fatores := fatores || jsonb_build_object('sinal', 'sono', 'efeito', efeito,
      'texto', format('%s h %s min de sono%s', floor(horas), lpad(round((horas - floor(horas)) * 60)::text, 2, '0'),
                      CASE WHEN nt.fonte_sono = 'batimento' THEN ' (estimado)' ELSE '' END));
  END IF;

  -- carga: 7 dias × média semanal dos 28 dias (só com ≥ 21 dias de dados)
  SELECT array_agg(e.inicio), array_agg(coalesce(e.fim, e.inicio)) INTO inis, fins
  FROM saude_eventos e
  WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado AND e.inicio >= now() - interval '28 days';
  IF inis IS NOT NULL THEN
    SELECT coalesce(sum(x.carga) FILTER (WHERE inis[x.idx] >= now() - interval '7 days'), 0), sum(x.carga)
    INTO aguda, cronica
    FROM saude_resumo_intervalos(p_workspace_id, inis, fins) x;
  END IF;
  SELECT min(minuto) INTO desde_dados FROM saude_bpm_minuto WHERE workspace_id = p_workspace_id AND minuto >= now() - interval '60 days';
  IF desde_dados IS NOT NULL AND desde_dados <= now() - interval '21 days' AND coalesce(cronica, 0) > 0 THEN
    cronica := cronica / 4.0;
    razao := round(aguda / cronica, 2);
    IF razao > 1.3 THEN
      efeito := CASE WHEN razao > 1.5 THEN -15 ELSE -8 END;
      score := score + efeito;
      fatores := fatores || jsonb_build_object('sinal', 'carga', 'efeito', efeito,
        'texto', format('Carga da semana %s× o seu habitual', replace(razao::text, '.', ',')));
    END IF;
  ELSE
    cronica := NULL;
  END IF;

  -- hora de dormir: acordar típico (mediana das últimas 21 noites) − 7h30 − 15 min para pegar no sono
  WITH x AS (
    SELECT extract(epoch FROM (sono_fim AT TIME ZONE p_tz)::time)::int / 60 AS fim_min,
           (extract(epoch FROM (sono_inicio AT TIME ZONE p_tz)::time)::int / 60 + 720) % 1440 AS ini_min_12
    FROM saude_noites(p_workspace_id, 21, p_tz)
    WHERE sono_inicio IS NOT NULL AND sono_fim IS NOT NULL AND sono_fim - sono_inicio BETWEEN interval '3 hours' AND interval '12 hours'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY fim_min)::int, stddev_samp(ini_min_12), count(*)
  INTO acordar, regular, qtd_noites FROM x;
  IF qtd_noites >= 3 THEN
    deitar := ((acordar - 465) % 1440 + 1440) % 1440;
  ELSE
    acordar := NULL;
  END IF;

  score := greatest(0, least(100, score));
  nivel := CASE WHEN NOT tem_dado THEN NULL WHEN score >= 80 THEN 'alto' WHEN score >= 60 THEN 'moderado' ELSE 'baixo' END;
  RETURN jsonb_build_object(
    'algoritmo', 'prontidao-v1',
    'dia', hoje,
    'score', CASE WHEN tem_dado THEN round(score) END,
    'nivel', nivel,
    'calibrando', base_noites < 7,
    'fatores', fatores,
    'carga', jsonb_build_object('aguda', aguda, 'cronica_semana', round(cronica), 'razao', razao),
    'sono', jsonb_build_object(
      'horas', horas,
      'fonte', fonte,
      'acordar', CASE WHEN acordar IS NOT NULL THEN lpad((acordar / 60)::text, 2, '0') || ':' || lpad((acordar % 60)::text, 2, '0') END,
      'deitar', CASE WHEN acordar IS NOT NULL THEN lpad((deitar / 60)::text, 2, '0') || ':' || lpad((deitar % 60)::text, 2, '0') END,
      'regularidade_min', CASE WHEN qtd_noites >= 3 THEN round(regular) END,
      'noites', coalesce(qtd_noites, 0))
  );
END;
$$;

-- ---------------------------------------------------------------------
-- permissões: site (authenticated) e Edge Function (service_role)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION saude_radar(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION saude_importar_treinos(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION saude_recuperacao(UUID, TIMESTAMPTZ[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION saude_prontidao(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION saude_radar(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION saude_importar_treinos(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION saude_recuperacao(UUID, TIMESTAMPTZ[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION saude_prontidao(UUID, TEXT) TO authenticated, service_role;

-- treinos do Samsung Health que já estão no banco
SELECT saude_importar_treinos(w.workspace_id) FROM (SELECT DISTINCT workspace_id FROM saude_samsung WHERE tipo = 'exercicio') w;
