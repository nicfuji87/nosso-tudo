-- Dados SINTÉTICOS de Saúde para o projeto de desenvolvimento.
-- Gera 35 dias de batimento por minuto, janelas de VFC noturnas e registros, com cenários conhecidos
-- para testar os algoritmos:
--   * treinos seg/qua/sex 07:20–08:20 (FC 120–170, intervalos de descanso);
--   * um episódio de "desvio" (dias -12 a -10): FC de repouso +6 bpm, RMSSD −35%;
--   * lacunas (relógio fora do pulso) e minutos com poucas amostras.
-- Reexecutável: apaga e recria só o dispositivo sintético.
-- Usa o primeiro workspace do banco (crie seu usuário de teste pelo site antes).

DO $$
DECLARE
  v_ws UUID;
  v_owner UUID;
  v_disp UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'development') THEN
    RAISE EXCEPTION 'Este banco não está marcado como development (rode supabase/dev/00_marcar_dev.sql). Abortado.';
  END IF;

  SELECT id, owner_id INTO v_ws, v_owner FROM workspaces ORDER BY created_at LIMIT 1;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'Nenhum workspace. Cadastre um usuário de teste pelo site local primeiro.';
  END IF;

  DELETE FROM saude_dispositivos WHERE modelo = 'SINTETICO';

  -- Segredo de teste conhecido ("relogio-sintetico-dev-somente-teste-0001", 40 caracteres), só existe neste banco.
  INSERT INTO saude_dispositivos (workspace_id, profile_id, nome, modelo, segredo_hash, ultimo_envio_em)
  VALUES (v_ws, v_owner, 'Relógio sintético (DEV)', 'SINTETICO',
          encode(extensions.digest('relogio-sintetico-dev-somente-teste-0001', 'sha256'), 'hex'), now())
  RETURNING id INTO v_disp;

  PERFORM setseed(0.42);

  -- Batimento por minuto: 35 dias, em horário local de São Paulo
  INSERT INTO saude_bpm_minuto (dispositivo_id, workspace_id, minuto, bpm_medio, bpm_min, bpm_max, amostras)
  SELECT v_disp, v_ws, m, b, greatest(30, round(b - 3 - random() * 3)), least(230, round(b + 3 + random() * 4)),
         CASE WHEN random() < 0.03 THEN 3 + floor(random() * 10) ELSE 50 + floor(random() * 11) END
  FROM (
    SELECT m,
      round((
        CASE
          -- treino seg/qua/sex
          WHEN extract(isodow FROM l) IN (1, 3, 5) AND l::time BETWEEN '07:20' AND '08:20' THEN
            135 + 25 * sin(extract(epoch FROM l) / 240.0) + random() * 12
          -- noite
          WHEN l::time >= '23:00' OR l::time < '06:30' THEN 54 + random() * 6
          -- dia
          ELSE 72 + random() * 14
        END
        + CASE WHEN l::date BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date - 12
                                AND (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10 THEN 6 ELSE 0 END
      )::numeric, 1)::real AS b
    FROM (
      SELECT m, m AT TIME ZONE 'America/Sao_Paulo' AS l
      FROM generate_series(date_trunc('minute', now()) - interval '35 days', date_trunc('minute', now()), interval '1 minute') AS m
    ) t
    -- lacunas: ~2% dos minutos e uma tarde inteira sem relógio
    WHERE random() > 0.02
      AND NOT (l::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 5 AND l::time BETWEEN '13:00' AND '18:00')
  ) x;

  -- VFC: janelas de 5 min durante a noite (sono), cobertura 0.6–1.0
  INSERT INTO saude_vfc_janelas (dispositivo_id, workspace_id, inicio, rmssd_ms, cobertura)
  SELECT v_disp, v_ws, j,
    greatest(8, round((
      exp(ln(55) + 0.18 * (random() - 0.5) * 2)
      * CASE WHEN extract(isodow FROM l - interval '8 hours') IN (1, 3, 5) THEN 0.88 ELSE 1 END   -- noite após treino
      * CASE WHEN (l - interval '8 hours')::date BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date - 12
                                                    AND (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10 THEN 0.65 ELSE 1 END
    )::numeric, 1))::real,
    round((0.6 + random() * 0.4)::numeric, 2)::real
  FROM (
    SELECT j, j AT TIME ZONE 'America/Sao_Paulo' AS l
    FROM generate_series(date_trunc('hour', now()) - interval '35 days', now(), interval '5 minutes') AS j
  ) t
  WHERE (l::time >= '23:30' OR l::time < '06:00') AND random() > 0.35;

  -- Registros: check-in diário e alguns hábitos
  INSERT INTO saude_registros (dispositivo_id, workspace_id, id_local, ts, tipo, valor)
  SELECT v_disp, v_ws, 'sint-checkin-' || d::date, d + interval '10 hours 5 minutes', 'checkin',
         (ARRAY['bem', 'ok', 'cansado', 'ok', 'bem'])[1 + floor(random() * 5)::int]
  FROM generate_series(now() - interval '35 days', now() - interval '1 day', interval '1 day') AS d;

  INSERT INTO saude_registros (dispositivo_id, workspace_id, id_local, ts, tipo, valor)
  SELECT v_disp, v_ws, 'sint-habito-' || d::date, d + interval '15 hours', 'habito', 'Café'
  FROM generate_series(now() - interval '35 days', now() - interval '1 day', interval '1 day') AS d
  WHERE random() < 0.7;

  RAISE NOTICE 'Seed sintético criado no workspace % (dispositivo %)', v_ws, v_disp;
END $$;
