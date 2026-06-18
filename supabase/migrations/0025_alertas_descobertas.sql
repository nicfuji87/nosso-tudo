-- =====================================================================
-- NOSSO TUDO — 0025: dois tipos novos de alerta proativo da Nia, vindos
-- das "Descobertas" do app (ver lib/insights + PLANO-RELATORIOS.md):
--   - assinaturas_fantasma: recorrências supérfluas → custo anual
--   - gastos_invisiveis:    compras pequenas que somam no mês
-- A regra determinística vive na Edge Function nia-alertas-cron.
-- =====================================================================

ALTER TABLE public.nia_alertas DROP CONSTRAINT IF EXISTS nia_alertas_tipo_check;
ALTER TABLE public.nia_alertas ADD CONSTRAINT nia_alertas_tipo_check CHECK (tipo IN (
  'saldo_negativo',
  'orcamento_estourado',
  'orcamento_perto',
  'cartao_limite',
  'resumo_semanal',
  'resumo_mensal',
  'personalizado',
  'assinaturas_fantasma',
  'gastos_invisiveis'
));
