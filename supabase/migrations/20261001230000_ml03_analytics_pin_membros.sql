-- =============================================================================
-- ML — 03: dimensão "pin" e filtro por headline no analytics; membros com
-- nome/e-mail (profiles tem RLS só do próprio usuário); contagem por status.
-- =============================================================================

create or replace function public.ml_pins_filtrados(p_filters jsonb default '{}'::jsonb)
returns table (
  pin_id uuid, product_id uuid, board_id uuid, creative_id uuid, published_at timestamptz,
  headline text, angle_type text, category_id text, category_name text, title text,
  price numeric, price_band text, board_name text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.product_id, p.board_id, p.creative_id, p.published_at,
         c.headline, coalesce(a.type, 'sem_angulo'), pr.category_id, cat.name, pr.title,
         pr.current_price, public.ml_faixa_preco(pr.current_price), b.name
  from ml_pins p
  join ml_products pr on pr.id = p.product_id
  join ml_creatives c on c.id = p.creative_id
  left join ml_creative_angles a on a.id = c.angle_id
  left join ml_pinterest_boards b on b.id = p.board_id
  left join ml_categories cat on cat.id = pr.category_id
  where public.ml_pode_ler()
    and p.status = 'published'
    and (p_filters->>'category_id' is null or pr.category_id = p_filters->>'category_id'
         or exists (select 1 from jsonb_array_elements(coalesce(cat.path, '[]'::jsonb)) e where e->>'id' = p_filters->>'category_id'))
    and (p_filters->>'product_id' is null or p.product_id::text = p_filters->>'product_id')
    and (p_filters->>'board_id' is null or p.board_id::text = p_filters->>'board_id')
    and (p_filters->>'creative_id' is null or p.creative_id::text = p_filters->>'creative_id')
    and (p_filters->>'angle_type' is null or coalesce(a.type, 'sem_angulo') = p_filters->>'angle_type')
    and (p_filters->>'price_band' is null or public.ml_faixa_preco(pr.current_price) = p_filters->>'price_band')
    and (p_filters->>'environment' is null or p.environment = p_filters->>'environment')
    and (p_filters->>'headline' is null or c.headline = p_filters->>'headline');
$$;

create or replace function public.ml_analytics_breakdown(
  p_from date, p_to date, p_dimension text default 'all', p_filters jsonb default '{}'::jsonb
)
returns table (
  dimension text, key text, label text, pins bigint, impressions bigint, saves bigint,
  pin_clicks bigint, outbound_clicks bigint, ctr numeric, commission numeric
)
language sql stable security definer set search_path = public as $$
  with base as (select * from public.ml_pins_filtrados(p_filters)),
  m as (
    select pin_id, sum(impressions) i, sum(saves) s, sum(pin_clicks) pc, sum(outbound_clicks) oc
    from ml_pin_metrics where date between p_from and p_to group by pin_id
  ),
  cpin as (
    select pin_id, sum(commission) v from ml_commissions
    where pin_id is not null and period_start <= p_to and period_end >= p_from group by pin_id
  ),
  -- comissão lançada só por produto é rateada entre os Pins dele
  cprod as (
    select product_id, sum(commission) v from ml_commissions
    where pin_id is null and product_id is not null and period_start <= p_to and period_end >= p_from group by product_id
  ),
  pp as (select product_id, count(*) n from base group by product_id),
  j as (
    select b.*, coalesce(m.i, 0) i, coalesce(m.s, 0) s, coalesce(m.pc, 0) pc, coalesce(m.oc, 0) oc,
           coalesce(cpin.v, 0) + coalesce(cprod.v, 0) / pp.n cv
    from base b
    join pp on pp.product_id = b.product_id
    left join m on m.pin_id = b.pin_id
    left join cpin on cpin.pin_id = b.pin_id
    left join cprod on cprod.product_id = b.product_id
  ),
  x as (
    select 'category'::text dim, coalesce(category_id, '—') k, coalesce(max(category_name), 'Sem categoria') l,
           count(*) n, sum(i) i, sum(s) s, sum(pc) pc, sum(oc) oc, sum(cv) cv from j group by category_id
    union all
    select 'product', product_id::text, max(title), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by product_id
    union all
    select 'board', coalesce(board_id::text, '—'), coalesce(max(board_name), 'Sem board'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by board_id
    union all
    select 'angle', angle_type, angle_type, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by angle_type
    union all
    select 'headline', coalesce(headline, '—'), coalesce(headline, '—'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by headline
    union all
    select 'creative', creative_id::text, coalesce(max(headline), '—'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by creative_id
    union all
    select 'price_band', price_band, price_band, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by price_band
    union all
    select 'pin', pin_id::text, coalesce(max(headline), max(title)), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by pin_id
  )
  select dim, k, l, n, i::bigint, s::bigint, pc::bigint, oc::bigint,
         case when i > 0 then round(oc::numeric / i, 5) else null end,
         round(cv::numeric, 2)
  from x
  where p_dimension = 'all' or dim = p_dimension
  order by dim, oc desc, i desc;
$$;


-- Membros com nome/e-mail — só admin+ (a RLS de profiles esconde os demais).
create or replace function public.ml_members_list()
returns table (profile_id uuid, role text, nome text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.profile_id, m.role, p.nome, p.email, m.created_at
  from ml_members m join profiles p on p.id = m.profile_id
  where public.ml_has_role('admin')
  order by m.created_at;
$$;
revoke all on function public.ml_members_list() from public, anon;
grant execute on function public.ml_members_list() to authenticated, service_role;

-- Contagem de produtos por status (abas da tela Produtos) numa ida só.
create or replace function public.ml_product_status_counts(p_q text default null, p_categoria text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.ml_pode_ler() then null else coalesce(jsonb_object_agg(status, n), '{}'::jsonb) end
  from (
    select status, count(*) n from ml_products
    where (p_q is null or title ilike '%' || p_q || '%' or external_id ilike '%' || p_q || '%')
      and (p_categoria is null or category_id = p_categoria)
    group by status
  ) x;
$$;
revoke all on function public.ml_product_status_counts(text, text) from public, anon;
grant execute on function public.ml_product_status_counts(text, text) to authenticated, service_role;
