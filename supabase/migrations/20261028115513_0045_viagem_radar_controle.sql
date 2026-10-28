-- Controle da rotina diária de viagens: marca quando a varredura de promoções
-- e o resumo de WhatsApp do dia já rodaram, para as batidas seguintes do
-- pg_cron (a cada 5 min entre 09h e 11h UTC) não repetirem trabalho nem cota.
ALTER TABLE viagem_radar_config
  ADD COLUMN IF NOT EXISTS ultima_promo_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_aviso_em TIMESTAMPTZ;

COMMENT ON COLUMN viagem_radar_config.ultima_promo_em IS 'Última varredura de promoções concluída (a rotina roda 1x por dia).';
COMMENT ON COLUMN viagem_radar_config.ultimo_aviso_em IS 'Último resumo enviado no WhatsApp (no máximo 1 por dia).';
