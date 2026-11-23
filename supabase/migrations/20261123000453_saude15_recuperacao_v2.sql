-- saude15: recuperação cardíaca mais fiel (recuperacao-v2) — ver comentário abaixo.
-- ---------------------------------------------------------------------
-- treinos-v2: painel de treinos
--   FC máx. pessoal = maior valor visto nos treinos (Samsung Health ou média por minuto), mín. 170
--   zonas: Z1 < 60% · Z2 60–70% · Z3 70–80% · Z4 80–90% · Z5 ≥ 90% da FC máx.
--   carga: a mesma do painel (minutos ponderados pelo batimento) — prontidão e site usam a mesma
--   recuperação (recuperacao-v2): FC do minuto em que o treino acabou (antes: o maior dos 3 últimos minutos,
--   que inflava a queda) → quedas nos minutos +1 e +2, só com ≥ 5 leituras no minuto; fora d'água;
--   FC no fim ≥ 100; outro treino começando em até 10 min invalida, exceto Caminhada (volta à calma ativa)
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
           (SELECT b.bpm_medio FROM saude_bpm_minuto b WHERE b.workspace_id = p_workspace_id AND b.amostras >= 20
              AND b.minuto >= date_trunc('minute', ev.fim) - interval '1 minute' AND b.minuto <= date_trunc('minute', ev.fim)
            ORDER BY b.minuto DESC LIMIT 1) AS fc_fim,
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
    'algoritmo', 'treinos-v2', 'recuperacao_algoritmo', 'recuperacao-v2',
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
