-- Preço do Claude Haiku 5.5 (rate card de prompts ≤ 100K tokens; acima disso a
-- Anthropic cobra $0.50/$2.50 — a Nia nunca chega perto). Cache read = 0.1x.
insert into public.nia_precos
  (provedor, modelo, preco_entrada_por_milhao, preco_saida_por_milhao, preco_entrada_cache_por_milhao)
values
  ('anthropic', 'claude-haiku-5-5', 0.10, 0.50, 0.01)
on conflict (provedor, modelo) do update
  set preco_entrada_por_milhao = excluded.preco_entrada_por_milhao,
      preco_saida_por_milhao = excluded.preco_saida_por_milhao,
      preco_entrada_cache_por_milhao = excluded.preco_entrada_cache_por_milhao;
