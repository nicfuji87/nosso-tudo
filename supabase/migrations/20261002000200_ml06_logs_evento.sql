-- ML06 — índice para o filtro "Evento do log" (Logs & Erros › Jobs), que consulta
-- ml_job_logs por data->>'evento'. Parcial: só linhas que carregam evento.
create index if not exists ml_job_logs_evento_idx
  on public.ml_job_logs ((data->>'evento'), id desc)
  where data ? 'evento';
