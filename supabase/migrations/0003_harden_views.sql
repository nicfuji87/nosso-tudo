-- =====================================================================
-- NOSSO TUDO — 0003: endurecer views (RLS)
-- No Supabase, views criadas pelo owner rodam como SECURITY DEFINER e
-- IGNORAM a RLS das tabelas-base. security_invoker=on faz a view respeitar
-- a RLS do usuário que consulta (PG15+). Defesa em profundidade (SR-005).
-- =====================================================================

ALTER VIEW v_inbox_revisao SET (security_invoker = on);
ALTER VIEW v_pendentes_revisao SET (security_invoker = on);
ALTER VIEW v_colecoes_em_aberto SET (security_invoker = on);
