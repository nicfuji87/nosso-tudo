-- ML08 — Fluxo simples "Criar Pin" (Estúdio) e "Desempenho".
--
-- 1. Busca de produtos por palavra-chave/link (resultado do Apify, com vendidos/preço/avaliação).
-- 2. Prompts salvos para gerar as imagens (reutilizáveis e editáveis).
-- 3. Pins da conta criados fora do app entram em ml_pins (origem = 'importado') para que as
--    métricas (job FETCH_PIN_ANALYTICS) e o Desempenho enxerguem TODOS os Pins.

-- -----------------------------------------------------------------------------
-- 1. Buscas
-- -----------------------------------------------------------------------------
create table public.ml_estudio_buscas (
  id           uuid primary key default gen_random_uuid(),
  termo        text not null check (char_length(termo) between 2 and 200),
  origem_link  text,                 -- link do ML colado (quando a busca partiu de um produto)
  produto_ref  jsonb,                -- produto do link (título, foto, preço) para mostrar no topo
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  resultados   jsonb not null default '[]'::jsonb check (jsonb_typeof(resultados) = 'array'),
  erro         text,
  job_id       uuid references public.ml_jobs(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ml_estudio_buscas_recentes_idx on public.ml_estudio_buscas (created_at desc);
create index ml_estudio_buscas_termo_idx on public.ml_estudio_buscas (lower(termo), created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Prompts salvos
-- -----------------------------------------------------------------------------
create table public.ml_estudio_prompts (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 2 and 80),
  texto       text not null check (char_length(texto) between 10 and 4000),
  usos        integer not null default 0,
  ultimo_uso  timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.ml_estudio_prompts (nome, texto) values
  ('Lifestyle claro',
   'Use a foto anexada como referência EXATA do produto "{produto}": mesma quantidade de peças, cor, formato, tamanho e acabamento. Não invente acessórios nem mude o produto. Crie uma foto vertical (2:3), realista e clara, do produto em uso num ambiente de casa bonito e organizado, com luz natural suave, estilo Pinterest. Sem texto, sem preço, sem logotipos, sem selos.'),
  ('Antes e depois',
   'Use a foto anexada como referência EXATA do produto "{produto}" (não altere peças, cor nem formato). Crie uma imagem vertical (2:3) dividida em duas metades: em cima o ambiente bagunçado, embaixo o mesmo ambiente organizado com o produto em uso. Fotografia realista, luz natural. Sem texto, sem preço, sem logotipos.'),
  ('Produto em destaque',
   'Use a foto anexada como referência EXATA do produto "{produto}". Mostre o produto em destaque sobre uma bancada ou superfície neutra e elegante, com poucos objetos de apoio que indiquem o uso, composição vertical (2:3), luz suave de estúdio, estética limpa de Pinterest. Não altere o produto. Sem texto, sem preço, sem logotipos.');

-- -----------------------------------------------------------------------------
-- 3. Pins importados da conta
-- -----------------------------------------------------------------------------
alter table public.ml_pins alter column creative_id drop not null;
alter table public.ml_pins alter column product_id drop not null;
alter table public.ml_pins add column if not exists origem text not null default 'app' check (origem in ('app', 'importado'));
alter table public.ml_pins add constraint ml_pins_app_tem_criativo check (origem = 'importado' or (creative_id is not null and product_id is not null));

-- -----------------------------------------------------------------------------
-- 4. updated_at + RLS
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ml_estudio_buscas', 'ml_estudio_prompts']
  loop
    execute format('create trigger tg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.trigger_set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ml_has_role(''viewer''))',
                   'p_' || t || '_read', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Desempenho: um resumo para decidir o próximo Pin (todos os Pins publicados, app + importados)
-- -----------------------------------------------------------------------------
create or replace function public.ml_desempenho(p_dias int default 30)
returns jsonb
language sql stable security definer set search_path = public as $$
  with
  periodo as (select (current_date - greatest(least(p_dias, 365), 1))::date as ini, current_date as fim),
  m as (
    select pin_id, sum(impressions)::bigint i, sum(saves)::bigint s, sum(pin_clicks)::bigint pc, sum(outbound_clicks)::bigint oc
    from ml_pin_metrics, periodo where date between periodo.ini and periodo.fim group by pin_id
  ),
  pins as (
    select p.id, p.external_pin_id, p.title, p.media_url, p.link_url, p.published_at, p.origem,
           b.name board, p.board_id, pr.title produto, pr.current_price preco, cat.name categoria,
           coalesce(m.i, 0) i, coalesce(m.s, 0) s, coalesce(m.pc, 0) pc, coalesce(m.oc, 0) oc
    from ml_pins p
    left join m on m.pin_id = p.id
    left join ml_pinterest_boards b on b.id = p.board_id
    left join ml_products pr on pr.id = p.product_id
    left join ml_categories cat on cat.id = pr.category_id
    where p.status = 'published' and p.environment = 'production'
  )
  select case when not public.ml_pode_ler() then null else jsonb_build_object(
    'dias', p_dias,
    'totais', (select jsonb_build_object(
        'pins', count(*), 'impressoes', sum(i), 'saves', sum(s), 'cliques', sum(pc), 'saidas', sum(oc),
        'pins_com_metrica', count(*) filter (where i > 0)) from pins),
    'por_board', coalesce((select jsonb_agg(x order by x->>'saidas' desc, x->>'impressoes' desc) from (
        select jsonb_build_object('board', coalesce(board, 'Sem board'), 'board_id', board_id, 'pins', count(*),
               'impressoes', sum(i), 'saves', sum(s), 'cliques', sum(pc), 'saidas', sum(oc)) x
        from pins group by board, board_id) q), '[]'::jsonb),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', origem, 'pins', n, 'impressoes', i, 'saves', s, 'saidas', oc)) from (
        select origem, count(*) n, sum(i) i, sum(s) s, sum(oc) oc from pins group by origem) q), '[]'::jsonb),
    'pins', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'external_pin_id', external_pin_id, 'titulo', title, 'imagem', media_url, 'link', link_url,
        'publicado_em', published_at, 'origem', origem, 'board', board, 'produto', produto, 'preco', preco,
        'categoria', categoria, 'impressoes', i, 'saves', s, 'cliques', pc, 'saidas', oc)
        order by oc desc, s desc, i desc) from pins), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.ml_desempenho(int) from public, anon;
grant execute on function public.ml_desempenho(int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Agendamento: importar os Pins da conta 1x/dia (antes da coleta de métricas)
-- -----------------------------------------------------------------------------
insert into public.ml_schedules (key, name, description, job_type, cron_expression, enabled, overlap_policy, config) values
  ('sync_account_pins', 'Importar Pins da conta', 'Traz os Pins criados direto no Pinterest para o Desempenho (métricas inclusas).',
   'SYNC_ACCOUNT_PINS', '30 6 * * *', true, 'skip', '{}')
on conflict (key) do nothing;
