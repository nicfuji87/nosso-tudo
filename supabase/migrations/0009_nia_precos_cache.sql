-- =====================================================================
-- NOSSO TUDO — 0009: preço de cached input + tokens de cache por mensagem
-- Permite custo preciso para modelos com desconto de cache (ex.: GPT-5.x).
-- =====================================================================

ALTER TABLE nia_precos
  ADD COLUMN IF NOT EXISTS preco_entrada_cache_por_milhao NUMERIC;

ALTER TABLE mensagens_ia
  ADD COLUMN IF NOT EXISTS tokens_cache INT;

-- Seed da família GPT-5 (preços informados; ajustáveis no admin).
INSERT INTO nia_precos (provedor, modelo, preco_entrada_por_milhao, preco_saida_por_milhao, preco_entrada_cache_por_milhao) VALUES
  ('openai', 'gpt-5.5',      5.00, 30.00, 0.50),
  ('openai', 'gpt-5.4',      2.50, 15.00, 0.25),
  ('openai', 'gpt-5.4-mini', 0.75,  4.50, 0.075)
ON CONFLICT (provedor, modelo) DO NOTHING;
