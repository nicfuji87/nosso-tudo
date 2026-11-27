-- saude21 (27/11/2026): prontidão e cobertura dizem quando a noite ainda está incompleta.
--
-- * Prontidão (prontidao-v2, mesma nota): ganha dois avisos sem efeito na nota.
--     - "dados": o relógio não envia desde antes do fim da noite (ex.: 25/11, sem internet das 05:20 às 09:52;
--       a nota das 07:37 saiu com VFC 24,3 e virou 25,5 às 11:18). Campos dados_incompletos / relogio_ultimo_envio.
--     - "vfc": a VFC ficou fora porque o sinal batimento a batimento foi fraco (27/11: 85 janelas, cobertura média 60%,
--       nenhuma ≥ 80%), em vez de só aparecer em "faltando".
-- * Cobertura das noites: minutos depois do último envio do relógio viram "aguardando_envio" (não são lacuna nem
--   entram no cálculo). Nova coluna no fim: minutos_aguardando_envio.

-- ------------------------------------------------------------------ último envio do relógio
CREATE OR REPLACE FUNCTION saude_relogio_ultimo_envio(p_workspace_id uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT max(d.ultimo_envio_em) FROM saude_dispositivos d
  WHERE d.workspace_id = p_workspace_id AND d.revogado_em IS NULL
    AND NOT (coalesce(d.nome, '') ~* 'celular|phone' OR coalesce(d.modelo, '') ~* 'SM-S|phone'
             OR coalesce(d.diagnostico, '{}'::jsonb) ? 'otimizacao_bateria');
$$;
REVOKE EXECUTE ON FUNCTION saude_relogio_ultimo_envio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION saude_relogio_ultimo_envio(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ prontidão
CREATE OR REPLACE FUNCTION public.saude_prontidao(p_workspace_id uuid, p_tz text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
  -- saude21
  noite_ini TIMESTAMPTZ;
  noite_fim TIMESTAMPTZ;
  envio_relogio TIMESTAMPTZ;
  incompleta BOOLEAN := false;
  jan_total INT := 0;
  jan_boas INT := 0;
  jan_cob NUMERIC;
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
    noite_ini := sn.inicio; noite_fim := sn.fim;
    horas := round(sn.dormido_min / 60.0, 2);
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

  -- saude21: janela da noite (sono do Samsung ou 22h–6h) e último envio do relógio
  noite_ini := coalesce(noite_ini, ((hoje - 1) + time '22:00') AT TIME ZONE p_tz);
  noite_fim := coalesce(noite_fim, (hoje + time '06:00') AT TIME ZONE p_tz);
  envio_relogio := saude_relogio_ultimo_envio(p_workspace_id);
  IF envio_relogio IS NOT NULL AND envio_relogio < noite_fim AND noite_fim <= now() THEN
    incompleta := true;
    fatores := fatores || jsonb_build_object('sinal', 'dados', 'efeito', 0,
      'texto', format('Noite incompleta: o relógio não envia desde %s — a nota pode mudar quando ele sincronizar',
                      to_char(envio_relogio AT TIME ZONE p_tz, 'HH24:MI')));
  END IF;

  -- saude21: por que a VFC ficou fora (sinal batimento a batimento fraco)
  IF v_vfc IS NULL THEN
    SELECT count(*), count(*) FILTER (WHERE j.cobertura >= 0.8), avg(j.cobertura)
    INTO jan_total, jan_boas, jan_cob
    FROM saude_vfc_janelas j
    WHERE j.workspace_id = p_workspace_id AND j.inicio >= noite_ini AND j.inicio < noite_fim;
    IF jan_total >= 6 AND jan_boas < 6 THEN
      fatores := fatores || jsonb_build_object('sinal', 'vfc', 'efeito', 0, 'valor', round(jan_cob * 100),
        'texto', format('VFC fora da nota: sinal batimento a batimento fraco (%s%% da noite; mínimo 80%%) — confira o ajuste da pulseira',
                        round(jan_cob * 100)));
    END IF;
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
                    WHEN sinais >= 3 AND base_noites >= 21 THEN 'alta'
                    WHEN sinais >= 2 THEN 'media' ELSE 'baixa' END;
  nivel := CASE WHEN NOT tem_fisio THEN NULL WHEN score >= 80 THEN 'alto' WHEN score >= 60 THEN 'moderado' ELSE 'baixo' END;
  RETURN jsonb_build_object(
    'algoritmo', 'prontidao-v2',
    'dia', hoje,
    'score', CASE WHEN tem_fisio THEN round(score) END,
    'nivel', nivel,
    'confianca', confianca,
    'calibrando', base_noites < 7, 'referencia_provisoria', base_noites < 21,
    'confianca_motivo', format('%s de 3 sinais medidos (repouso, VFC, sono) · referência de %s noites%s%s', sinais, base_noites,
      CASE WHEN base_noites < 21 THEN ' (provisória até 21)' ELSE '' END,
      CASE WHEN incompleta THEN ' · noite ainda incompleta' ELSE '' END),
    'base_noites', base_noites,
    'fatores', fatores,
    'faltando', faltando,
    'dados_incompletos', incompleta,
    'relogio_ultimo_envio', envio_relogio,
    'entradas', jsonb_build_object(
      'fc', round(v_fc, 1), 'fc_normal', round(v_fcn, 1), 'vfc', round(v_vfc, 1), 'vfc_normal', round(v_vfcn, 1),
      'sono_h', horas, 'sono_estado', sono_estado, 'sono_uid', sono_uid, 'base_noites', base_noites,
      'carga_aguda', aguda, 'carga_razao', razao, 'dados_incompletos', incompleta,
      'vfc_janelas', jan_total, 'vfc_janelas_boas', jan_boas),
    'carga', jsonb_build_object('aguda', aguda, 'cronica_semana', round(cronica), 'razao', razao),
    'sono', jsonb_build_object(
      'horas', horas, 'estado', sono_estado, 'motivo', sono_motivo, 'meta', meta,
      'acordar', CASE WHEN acordar IS NOT NULL THEN lpad((acordar / 60)::text, 2, '0') || ':' || lpad((acordar % 60)::text, 2, '0') END,
      'deitar', CASE WHEN acordar IS NOT NULL THEN lpad((deitar / 60)::text, 2, '0') || ':' || lpad((deitar % 60)::text, 2, '0') END,
      'regularidade_min', CASE WHEN qtd_noites >= 3 THEN round(regular) END,
      'noites', coalesce(qtd_noites, 0))
  );
END;
$function$;

-- ------------------------------------------------------------------ cobertura (nova coluna → recriar)
DROP FUNCTION IF EXISTS public.saude_cobertura_noites(uuid, integer, text);
CREATE FUNCTION public.saude_cobertura_noites(p_workspace_id uuid, p_dias integer DEFAULT 7, p_tz text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS TABLE(noite date, inicio timestamp with time zone, fim timestamp with time zone, fonte_janela text, minutos_janela integer, minutos_cobertos integer, minutos_carregando integer, minutos_fora_pulso integer, minutos_sem_dado_no_pulso integer, minutos_desconhecidos integer, cobertura_comprovada numeric, cobertura_conservadora numeric, maior_lacuna_min integer, maior_lacuna_comprovada_min integer, lacunas_acima_10 integer, lacunas_relogio integer, minutos_aguardando_envio integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH dias AS (
    SELECT generate_series((now() AT TIME ZONE p_tz)::date - (p_dias - 1), (now() AT TIME ZONE p_tz)::date, '1 day')::date AS noite
  ),
  envio AS (SELECT saude_relogio_ultimo_envio(p_workspace_id) AS em),
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
             -- saude21: depois do último envio do relógio o dado pode estar na fila (sem internet): ainda não é lacuna
             WHEN (SELECT em FROM envio) IS NOT NULL AND m.m >= date_trunc('minute', (SELECT em FROM envio)) - interval '10 minutes' THEN 'aguardando_envio'
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
         (SELECT count(*) FROM saude_coleta_lacunas l WHERE l.workspace_id = p_workspace_id AND l.inicio < j.fim AND l.fim > j.inicio)::int,
         count(*) FILTER (WHERE g.classe = 'aguardando_envio')::int
  FROM janelas j JOIN grade g ON g.noite = j.noite
  GROUP BY j.noite, j.inicio, j.fim, j.fonte
  ORDER BY j.noite;
$function$;
REVOKE EXECUTE ON FUNCTION public.saude_cobertura_noites(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saude_cobertura_noites(uuid, integer, text) TO authenticated, service_role;
