-- ML07 — Páginas de produto (destino do Pin no Pinterest).
--
-- Por que existe: o Pinterest recusa links do Mercado Livre direto no Pin e proíbe usar
-- redirecionamento para chegar a um site que ele não aceita. Então o Pin aponta para uma
-- página NOSSA com conteúdo real (foto, texto, aviso de afiliado) e um botão que a pessoa
-- clica para ir ao Mercado Livre. Não há redirecionamento automático em lugar nenhum.
--
-- Segurança: o destino do botão é gravado aqui pelo servidor (só hosts do Mercado Livre,
-- validados no app). A página pública nunca lê URL de parâmetro — não existe open redirect.
-- Escrita só via service_role; leitura do painel por papel; o público lê pelo servidor.

create table public.ml_paginas (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 90),
  product_id        uuid references public.ml_products(id) on delete set null,
  affiliate_link_id uuid references public.ml_affiliate_links(id) on delete set null,
  affiliate_url     text not null check (affiliate_url ~ '^https://'),
  product_url       text check (product_url is null or product_url ~ '^https://'),
  external_id       text,
  titulo            text not null check (char_length(titulo) between 3 and 120),
  resumo            text check (resumo is null or char_length(resumo) <= 600),
  destaques         jsonb not null default '[]'::jsonb check (jsonb_typeof(destaques) = 'array'),
  imagens           jsonb not null default '[]'::jsonb check (jsonb_typeof(imagens) = 'array'),
  cta               text not null default 'Ver no Mercado Livre' check (char_length(cta) between 2 and 40),
  status            text not null default 'draft' check (status in ('draft', 'published', 'paused')),
  visitas           integer not null default 0,
  cliques           integer not null default 0,
  ultimo_clique_em  timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index ml_paginas_product_idx on public.ml_paginas (product_id) where product_id is not null;
create index ml_paginas_status_idx on public.ml_paginas (status, updated_at desc);

create trigger tg_ml_paginas_updated_at before update on public.ml_paginas
  for each row execute function public.trigger_set_updated_at();

alter table public.ml_paginas enable row level security;
create policy p_ml_paginas_read on public.ml_paginas for select to authenticated using (public.ml_has_role('viewer'));

-- Contador de visitas/cliques: chamado pelo servidor (rota da página), nunca pelo navegador direto.
create or replace function public.ml_pagina_contar(p_slug text, p_tipo text)
returns void
language sql
security definer
set search_path = public
as $$
  update ml_paginas
     set visitas = visitas + case when p_tipo = 'visita' then 1 else 0 end,
         cliques = cliques + case when p_tipo = 'clique' then 1 else 0 end,
         ultimo_clique_em = case when p_tipo = 'clique' then now() else ultimo_clique_em end
   where slug = p_slug and status = 'published';
$$;
revoke all on function public.ml_pagina_contar(text, text) from public, anon, authenticated;
grant execute on function public.ml_pagina_contar(text, text) to service_role;
