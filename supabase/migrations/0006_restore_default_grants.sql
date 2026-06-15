-- ============================================================
-- 0006 — Restaura os GRANTs padrão do Supabase no schema public.
--
-- O schema foi aplicado fora do controle de migrations e sem os grants
-- padrão que o Supabase concede automaticamente a anon/authenticated/
-- service_role. Sem eles, o PostgREST devolve 42501 ("permission denied
-- for table ...") em TODA query — o que derrubava o app com 500.
--
-- Segurança: o acesso real continua governado por RLS. As tabelas
-- sensíveis (integration_settings, whatsapp_ingest_log, asaas_webhook_events,
-- rate_limits) têm RLS deny-all (sem policy) — conceder GRANT de tabela a
-- authenticated/anon NÃO as expõe, pois o RLS bloqueia as linhas. O
-- service_role tem BYPASSRLS e é usado só no servidor/edge functions.
-- Pré-requisito verificado antes de aplicar: RLS ligado em todas as tabelas.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: acesso total de backend (ignora RLS).
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- authenticated/anon: acesso de tabela; o RLS é quem filtra as linhas.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Tabelas/sequences criadas no futuro herdam os mesmos grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;
