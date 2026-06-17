-- =====================================================================
-- 0018. CONTROLE ADMIN DO CRON DE RECORRÊNCIAS
-- ---------------------------------------------------------------------
-- Funções SECURITY DEFINER (owner = postgres) para o painel admin
-- inspecionar e controlar o job pg_cron 'gerar-recorrencias-diario'.
-- Chamadas apenas pelo app via service_role (gate de platform admin no
-- server action); EXECUTE é negado a anon/authenticated.
-- =====================================================================

-- Status: se está agendado/ativo, agenda, última execução e contadores.
CREATE OR REPLACE FUNCTION admin_recorrencias_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_job   RECORD;
  v_last  RECORD;
  v_ativas INT;
  v_geradas INT;
BEGIN
  SELECT jobid, schedule, active INTO v_job
    FROM cron.job WHERE jobname = 'gerar-recorrencias-diario';

  SELECT status, end_time, return_message INTO v_last
    FROM cron.job_run_details
    WHERE jobid = v_job.jobid
    ORDER BY start_time DESC
    LIMIT 1;

  SELECT count(*) INTO v_ativas FROM recorrencias WHERE ativa = TRUE;
  SELECT count(*) INTO v_geradas FROM transacoes WHERE origem = 'recorrente';

  RETURN jsonb_build_object(
    'agendado', v_job.jobid IS NOT NULL,
    'ativo', COALESCE(v_job.active, FALSE),
    'schedule', v_job.schedule,
    'ultima_execucao', v_last.end_time,
    'ultimo_status', v_last.status,
    'ultima_mensagem', v_last.return_message,
    'recorrencias_ativas', v_ativas,
    'lancamentos_gerados', v_geradas
  );
END;
$fn$;

-- Liga/desliga o job sem apagá-lo.
CREATE OR REPLACE FUNCTION admin_recorrencias_set_active(p_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'gerar-recorrencias-diario';
  IF v_jobid IS NULL THEN RETURN FALSE; END IF;
  PERFORM cron.alter_job(v_jobid, active := p_active);
  RETURN TRUE;
END;
$fn$;

-- Roda a geração na hora (fora do horário do cron).
CREATE OR REPLACE FUNCTION admin_recorrencias_run_now()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN gerar_recorrencias_due();
END;
$fn$;

REVOKE ALL ON FUNCTION admin_recorrencias_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_recorrencias_set_active(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_recorrencias_run_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_recorrencias_status() TO service_role;
GRANT EXECUTE ON FUNCTION admin_recorrencias_set_active(BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION admin_recorrencias_run_now() TO service_role;
