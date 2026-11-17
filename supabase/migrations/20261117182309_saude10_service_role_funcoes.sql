-- Saúde 10 — a Edge Function (service_role) precisa executar as funções de cálculo.
-- O REVOKE ... FROM PUBLIC das migrações anteriores tirou esse acesso: o aviso do Radar no relógio
-- falhava em silêncio. Agora também alimenta a tela "Hoje" do app do celular.
GRANT EXECUTE ON FUNCTION saude_noites(UUID, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION saude_radar(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION saude_treinos_detectados(UUID, INT, REAL) TO service_role;
GRANT EXECUTE ON FUNCTION saude_resumo_intervalos(UUID, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO service_role;
GRANT EXECUTE ON FUNCTION saude_mediana(DOUBLE PRECISION[]) TO service_role;
GRANT EXECUTE ON FUNCTION saude_mad(DOUBLE PRECISION[]) TO service_role;
