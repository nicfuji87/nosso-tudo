-- =====================================================================
-- saude16: dados confiáveis para o app do celular 1.0
--   * saude_sono (sono-v1): sessão canônica do Samsung Health por noite — dormido = profundo+REM+leve,
--     acordado, tempo sem fase, estado (parcial/finalizado) e qualidade (bom/incompleto/suspeito)
--   * saude_prontidao (prontidao-v2): usa o sono DORMIDO (não o tempo na cama), não pune sono parcial
--     ou contraditório, devolve confiança, entradas usadas e o que faltou; sem repouso e sem VFC → sem nota
--   * saude_prontidao_hist: histórico das notas (a Edge Function grava quando a nota muda)
--   * saude_perfil: perfil esportivo (FC máx. manual, metas) — a FC máx. manual vale para as zonas
--   * saude_treinos_painel (treinos-v3): FC máx. do perfil, qualidade da recuperação cardíaca
--     (leituras por minuto), carga por esforço percebido (RPE × min) separada da carga por FC,
--     e aviso de FC pouco confiável no pulso em natação e lutas
-- =====================================================================

CREATE TABLE IF NOT EXISTS saude_prontidao_hist (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  algoritmo TEXT NOT NULL,
  score INT,
  nivel TEXT,
  confianca TEXT,
  entradas JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saude_prontidao_hist_ws_dia ON saude_prontidao_hist (workspace_id, dia, calculado_em DESC);
ALTER TABLE saude_prontidao_hist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_prontidao_hist;
CREATE POLICY p_ws_select ON saude_prontidao_hist FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));

CREATE TABLE IF NOT EXISTS saude_perfil (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  fcmax_manual INT CHECK (fcmax_manual BETWEEN 120 AND 230),
  nascimento DATE,
  altura_cm INT CHECK (altura_cm BETWEEN 100 AND 250),
  peso_kg NUMERIC(5,1) CHECK (peso_kg BETWEEN 30 AND 250),
  meta_sono_h NUMERIC(3,1) NOT NULL DEFAULT 7.5 CHECK (meta_sono_h BETWEEN 5 AND 10),
  meta_passos INT NOT NULL DEFAULT 8000 CHECK (meta_passos BETWEEN 1000 AND 40000),
  modalidades TEXT[] NOT NULL DEFAULT '{}',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE saude_perfil ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ws_select ON saude_perfil;
CREATE POLICY p_ws_select ON saude_perfil FOR SELECT USING (workspace_id IN (SELECT user_workspaces()));
DROP POLICY IF EXISTS p_ws_write ON saude_perfil;
CREATE POLICY p_ws_write ON saude_perfil FOR ALL USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

-- ---------------------------------------------------------------------
-- sono-v1: uma sessão principal por noite (data local do fim; ≥ 3 h; cochilos ficam de fora)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_sono(p_workspace_id UUID, p_dias INT DEFAULT 30, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS TABLE (
  uid TEXT, noite DATE, inicio TIMESTAMPTZ, fim TIMESTAMPTZ, duracao_min INT, dormido_min INT,
  profundo_min INT, rem_min INT, leve_min INT, acordado_min INT, sem_fase_min INT, nota INT,
  fc_media REAL, estado TEXT, qualidade TEXT, motivo TEXT, atualizado_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH s AS (
    SELECT DISTINCT ON ((x.fim AT TIME ZONE p_tz)::date)
           x.uid, (x.fim AT TIME ZONE p_tz)::date AS noite, x.inicio, x.fim, x.atualizado_em,
           round(extract(epoch FROM x.fim - x.inicio) / 60)::int AS dur,
           coalesce((x.dados->'estagios_min'->>'profundo')::int, 0) AS prof,
           coalesce((x.dados->'estagios_min'->>'rem')::int, 0) AS rem,
           coalesce((x.dados->'estagios_min'->>'leve')::int, 0) AS leve,
           coalesce((x.dados->'estagios_min'->>'acordado')::int, 0) AS acord,
           (x.dados->>'nota')::int AS nota
    FROM saude_samsung x
    WHERE x.workspace_id = p_workspace_id AND x.tipo = 'sono' AND x.fim IS NOT NULL
      AND x.fim - x.inicio >= interval '3 hours' AND x.inicio >= now() - make_interval(days => p_dias + 1)
    ORDER BY (x.fim AT TIME ZONE p_tz)::date, x.fim - x.inicio DESC
  )
  SELECT s.uid, s.noite, s.inicio, s.fim, s.dur, s.prof + s.rem + s.leve, s.prof, s.rem, s.leve, s.acord,
         greatest(0, s.dur - (s.prof + s.rem + s.leve + s.acord)), s.nota,
         (SELECT avg(b.bpm_medio)::real FROM saude_bpm_minuto b
           WHERE b.workspace_id = p_workspace_id AND b.minuto >= s.inicio AND b.minuto < s.fim),
         CASE WHEN s.fim > now() OR s.atualizado_em < s.fim THEN 'parcial' ELSE 'finalizado' END,
         CASE WHEN s.acord > 0.3 * s.dur THEN 'suspeito'
              WHEN s.dur - (s.prof + s.rem + s.leve + s.acord) > 0.15 * s.dur THEN 'incompleto'
              ELSE 'bom' END,
         CASE WHEN s.acord > 0.3 * s.dur THEN format('Samsung Health marcou %s min acordado (%s%% da noite)', s.acord, round(100.0 * s.acord / s.dur))
              WHEN s.dur - (s.prof + s.rem + s.leve + s.acord) > 0.15 * s.dur THEN format('%s min sem fase identificada', s.dur - (s.prof + s.rem + s.leve + s.acord))
         END,
         s.atualizado_em
  FROM s
  WHERE s.noite >= (now() AT TIME ZONE p_tz)::date - p_dias
  ORDER BY s.noite;
$$;
REVOKE EXECUTE ON FUNCTION saude_sono(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_sono(UUID, INT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- prontidao-v2 (índice próprio, não é medida clínica)
--   começa em 100 e desconta: repouso acima do normal (até −25), VFC abaixo do normal (até −25),
--   sono DORMIDO abaixo de 7 h (até −25; só sessão do Samsung Health finalizada e coerente),
--   carga da semana > 1,3× o habitual (só com ≥ 21 dias de dados) e radar fora do normal.
--   Sem repouso e sem VFC da noite → sem nota. Confiança: alta (3 sinais e normal aprendido),
--   média (2 sinais ou normal provisório), baixa (1 sinal).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION saude_prontidao(p_workspace_id UUID, p_tz TEXT DEFAULT 'America/Sao_Paulo')
RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  hoje DATE := (now() AT TIME ZONE p_tz)::date;
  r RECORD;
  sn RECORD;
  nt RECORD;
  tem_radar BOOLEAN := false;
  tem_sono BOOLEAN := false;
  fatores JSONB := '[]'::jsonb;
  faltando JSONB := '[]'::jsonb;
  score NUMERIC := 100;
  sinais INT := 0;
  tem_fisio BOOLEAN := false;
  efeito NUMERIC;
  horas NUMERIC;
  sono_estado TEXT;
  sono_motivo TEXT;
  sono_uid TEXT;
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
  confianca TEXT;
  base_noites INT := 0;
  meta NUMERIC := 7.0;
  v_fc NUMERIC; v_fcn NUMERIC; v_vfc NUMERIC; v_vfcn NUMERIC;
BEGIN
  SELECT * INTO r FROM saude_radar(p_workspace_id, p_tz) x WHERE x.noite = hoje LIMIT 1;
  IF FOUND THEN
    tem_radar := true; base_noites := r.base;
    v_fc := r.fc; v_fcn := r.fc_normal; v_vfc := r.vfc; v_vfcn := r.vfc_normal;
  END IF;

  -- repouso e VFC: só comparam com o normal a partir de 3 noites
  IF tem_radar AND v_fc IS NOT NULL AND v_fcn IS NOT NULL AND base_noites >= 3 THEN
    tem_fisio := true; sinais := sinais + 1;
    efeito := -least(25, greatest(0, round((v_fc - v_fcn) * 5)));
    score := score + efeito;
    fatores := fatores || jsonb_build_object('sinal', 'repouso', 'efeito', efeito, 'valor', round(v_fc), 'normal', round(v_fcn),
      'texto', format('Repouso %s bpm (normal %s)', round(v_fc), round(v_fcn)));
  ELSE
    faltando := faltando || to_jsonb('repouso'::text);
  END IF;
  IF tem_radar AND v_vfc IS NOT NULL AND v_vfcn IS NOT NULL AND v_vfcn > 0 AND base_noites >= 3 THEN
    tem_fisio := true; sinais := sinais + 1;
    efeito := -least(25, greatest(0, round((1 - v_vfc / v_vfcn) * 100)));
    score := score + efeito;
    fatores := fatores || jsonb_build_object('sinal', 'vfc', 'efeito', efeito, 'valor', round(v_vfc), 'normal', round(v_vfcn),
      'texto', format('VFC %s ms (normal %s)', round(v_vfc), round(v_vfcn)));
  ELSE
    faltando := faltando || to_jsonb('vfc'::text);
  END IF;
  IF tem_radar AND r.nivel IN ('observar', 'estresse') THEN
    efeito := CASE r.nivel WHEN 'estresse' THEN -20 ELSE -5 END;
    score := score + efeito;
    fatores := fatores || jsonb_build_object('sinal', 'radar', 'efeito', efeito,
      'texto', CASE r.nivel WHEN 'estresse' THEN 'Radar: vários sinais fora do seu normal' ELSE 'Radar: um sinal fora do seu normal' END);
  END IF;

  -- sono: sessão canônica do Samsung Health da noite de hoje
  SELECT * INTO sn FROM saude_sono(p_workspace_id, 2, p_tz) x WHERE x.noite = hoje LIMIT 1;
  IF FOUND THEN
    tem_sono := true;
    sono_uid := sn.uid;
    horas := round(sn.dormido_min / 60.0, 1);
    sono_estado := sn.estado;
    IF sn.estado = 'parcial' THEN
      sono_motivo := 'sessão ainda sendo atualizada pelo Samsung Health';
      faltando := faltando || to_jsonb('sono'::text);
    ELSIF sn.qualidade = 'suspeito' THEN
      sono_estado := 'contraditorio'; sono_motivo := sn.motivo;
      faltando := faltando || to_jsonb('sono'::text);
      fatores := fatores || jsonb_build_object('sinal', 'sono', 'efeito', 0,
        'texto', 'Sono com registro contraditório — fora da nota');
    ELSE
      sinais := sinais + 1;
      efeito := -least(25, greatest(0, round((meta - horas) * 10)));
      score := score + efeito;
      fatores := fatores || jsonb_build_object('sinal', 'sono', 'efeito', efeito, 'valor', horas,
        'texto', format('%s h %s min dormidos', floor(horas), lpad(round((horas - floor(horas)) * 60)::text, 2, '0')));
    END IF;
  END IF;
  IF NOT tem_sono THEN
    SELECT * INTO nt FROM saude_noites(p_workspace_id, 2, p_tz) x WHERE x.noite = hoje AND x.sono_inicio IS NOT NULL LIMIT 1;
    sono_estado := CASE WHEN FOUND THEN 'aguardando' ELSE 'ausente' END;
    sono_motivo := CASE WHEN FOUND THEN 'aguardando o sono do Samsung Health (a estimativa do relógio não entra na nota)'
                        ELSE 'sem sono registrado nesta noite' END;
    faltando := faltando || to_jsonb('sono'::text);
  END IF;

  -- carga: 7 dias × média semanal dos 28 dias (só com ≥ 21 dias de dados)
  SELECT array_agg(e.inicio), array_agg(coalesce(e.fim, e.inicio)) INTO inis, fins
  FROM saude_eventos e
  WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado AND e.inicio >= now() - interval '28 days';
  IF inis IS NOT NULL THEN
    SELECT coalesce(sum(x.carga) FILTER (WHERE inis[x.idx] >= now() - interval '7 days'), 0), sum(x.carga)
    INTO aguda, cronica FROM saude_resumo_intervalos(p_workspace_id, inis, fins) x;
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

  -- horário: acordar típico (mediana de 21 noites do Samsung Health) − 7h30 − 15 min
  WITH x AS (
    SELECT extract(epoch FROM (s.fim AT TIME ZONE p_tz)::time)::int / 60 AS fim_min,
           (extract(epoch FROM (s.inicio AT TIME ZONE p_tz)::time)::int / 60 + 720) % 1440 AS ini_min_12
    FROM saude_sono(p_workspace_id, 21, p_tz) s WHERE s.estado = 'finalizado'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY fim_min)::int, stddev_samp(ini_min_12), count(*)
  INTO acordar, regular, qtd_noites FROM x;
  IF qtd_noites >= 3 THEN deitar := ((acordar - 465) % 1440 + 1440) % 1440; ELSE acordar := NULL; END IF;

  score := greatest(0, least(100, score));
  confianca := CASE WHEN NOT tem_fisio THEN NULL
                    WHEN sinais >= 3 AND base_noites >= 7 THEN 'alta'
                    WHEN sinais >= 2 THEN 'media' ELSE 'baixa' END;
  nivel := CASE WHEN NOT tem_fisio THEN NULL WHEN score >= 80 THEN 'alto' WHEN score >= 60 THEN 'moderado' ELSE 'baixo' END;
  RETURN jsonb_build_object(
    'algoritmo', 'prontidao-v2',
    'dia', hoje,
    'score', CASE WHEN tem_fisio THEN round(score) END,
    'nivel', nivel,
    'confianca', confianca,
    'calibrando', base_noites < 7,
    'base_noites', base_noites,
    'fatores', fatores,
    'faltando', faltando,
    'entradas', jsonb_build_object(
      'fc', round(v_fc, 1), 'fc_normal', round(v_fcn, 1), 'vfc', round(v_vfc, 1), 'vfc_normal', round(v_vfcn, 1),
      'sono_h', horas, 'sono_estado', sono_estado, 'sono_uid', sono_uid, 'base_noites', base_noites,
      'carga_aguda', aguda, 'carga_razao', razao),
    'carga', jsonb_build_object('aguda', aguda, 'cronica_semana', round(cronica), 'razao', razao),
    'sono', jsonb_build_object(
      'horas', horas, 'estado', sono_estado, 'motivo', sono_motivo, 'meta', meta,
      'acordar', CASE WHEN acordar IS NOT NULL THEN lpad((acordar / 60)::text, 2, '0') || ':' || lpad((acordar % 60)::text, 2, '0') END,
      'deitar', CASE WHEN acordar IS NOT NULL THEN lpad((deitar / 60)::text, 2, '0') || ':' || lpad((deitar % 60)::text, 2, '0') END,
      'regularidade_min', CASE WHEN qtd_noites >= 3 THEN round(regular) END,
      'noites', coalesce(qtd_noites, 0))
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION saude_prontidao(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_prontidao(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- treinos-v3: FC máx. do perfil (senão a maior vista), qualidade da recuperação, carga RPE, FC pouco confiável
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
    SELECT coalesce((SELECT pf.fcmax_manual FROM saude_perfil pf WHERE pf.workspace_id = p_workspace_id), greatest(
      170,
      coalesce((SELECT max((s.dados->>'fc_max')::real) FROM saude_samsung s
                WHERE s.workspace_id = p_workspace_id AND s.tipo = 'exercicio' AND s.inicio >= now() - interval '120 days'
                  AND (s.dados->>'fc_max')::real < 220), 0),
      coalesce((SELECT max(b.bpm_medio) FROM saude_eventos e
                JOIN saude_bpm_minuto b ON b.workspace_id = p_workspace_id AND b.minuto >= e.inicio AND b.minuto < e.fim AND b.amostras >= 20
                WHERE e.workspace_id = p_workspace_id AND e.tipo = 'treino' AND NOT e.descartado AND e.inicio >= now() - interval '120 days'), 0)
    ))::real AS fcmax,
    (SELECT pf.fcmax_manual IS NOT NULL FROM saude_perfil pf WHERE pf.workspace_id = p_workspace_id) AS manual
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
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.amostras >= 20
              AND b.minuto >= date_trunc('minute', ev.fim) - interval '1 minute' AND b.minuto <= date_trunc('minute', ev.fim)
            ORDER BY b.minuto DESC LIMIT 1) AS fc_fim,
           (SELECT b.amostras FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.amostras >= 20
              AND b.minuto >= date_trunc('minute', ev.fim) - interval '1 minute' AND b.minuto <= date_trunc('minute', ev.fim)
            ORDER BY b.minuto DESC LIMIT 1) AS n0,
           (SELECT b.amostras FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id
              AND b.minuto = date_trunc('minute', ev.fim) + interval '1 minute' LIMIT 1) AS n1,
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.amostras >= 5
              AND b.minuto = date_trunc('minute', ev.fim) + interval '1 minute' LIMIT 1) AS fc_1,
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.amostras >= 5
              AND b.minuto = date_trunc('minute', ev.fim) + interval '2 minutes' LIMIT 1) AS fc_2,
           EXISTS (SELECT 1 FROM ev o WHERE o.id <> ev.id AND o.inicio >= ev.fim - interval '1 minute'
                     AND o.inicio < ev.fim + interval '10 minutes'
                     AND coalesce(o.detalhes->>'modalidade', '') <> 'Caminhada') AS emendado
    FROM ev
  )
  SELECT jsonb_build_object(
    'algoritmo', 'treinos-v3', 'recuperacao_algoritmo', 'recuperacao-v2',
    'fcmax_fonte', (SELECT CASE WHEN coalesce(manual, false) THEN 'manual' ELSE 'automatica' END FROM fm),
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
      -- carga por esforço percebido (sRPE = RPE × minutos): unidade diferente da carga por FC, não somar
      'carga_rpe', (ev.detalhes->>'esforco')::int * round(extract(epoch FROM ev.fim - ev.inicio) / 60)::int,
      -- FC de pulso perde precisão na água e em lutas (pegadas, impacto, pulso preso)
      'fc_confiavel', coalesce(ev.detalhes->>'modalidade', '') NOT IN ('Natação', 'Judô', 'Jiu-jitsu'),
      'nota', ev.detalhes->>'nota', 'tecnica_min', (ev.detalhes->>'tecnica_min')::int, 'randori_min', (ev.detalhes->>'randori_min')::int,
      'recuperacao', CASE WHEN r.fc_fim >= 100 AND r.fc_1 IS NOT NULL AND r.fc_1 <= r.fc_fim AND NOT r.emendado
                               AND coalesce(ev.detalhes->>'modalidade', '') <> 'Natação'
                          THEN jsonb_strip_nulls(jsonb_build_object('fc_fim', round(r.fc_fim::numeric),
                                 'leituras', jsonb_build_array(r.n0, r.n1),
                                 'qualidade', CASE WHEN r.n0 >= 40 AND r.n1 >= 30 THEN 'boa' ELSE 'limitada' END,
                                 'queda1', round((r.fc_fim - r.fc_1)::numeric), 'queda2', round((r.fc_fim - r.fc_2)::numeric))) END
    )) ORDER BY ev.inicio DESC), '[]'::jsonb)
  )
  FROM ev JOIN z ON z.id = ev.id JOIN r ON r.id = ev.id;
$$;

REVOKE EXECUTE ON FUNCTION saude_treinos_painel(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_treinos_painel(UUID, INT, TEXT) TO authenticated, service_role;
