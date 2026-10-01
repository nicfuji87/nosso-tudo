-- =============================================================================
-- ML — 02: agregações de analytics e dashboard (no banco, nunca somando no
-- cliente — padrão do projeto: PostgREST corta em 1000 linhas).
-- Guard: membro do ML (viewer+) ou service_role.
-- =============================================================================

create or replace function public.ml_pode_ler() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false) or public.ml_has_role('viewer');
$$;
revoke all on function public.ml_pode_ler() from public, anon;
grant execute on function public.ml_pode_ler() to authenticated, service_role;

-- Faixa de preço usada em filtros e relatórios.
create or replace function public.ml_faixa_preco(p numeric) returns text
language sql immutable as $$
  select case
    when p is null then 'sem preço'
    when p < 50 then 'até R$ 50'
    when p < 100 then 'R$ 50–100'
    when p < 200 then 'R$ 100–200'
    when p < 500 then 'R$ 200–500'
    else 'R$ 500+'
  end;
$$;

-- Pins publicados + atributos de corte, já filtrados. Base de todos os relatórios.
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
    and (p_filters->>'environment' is null or p.environment = p_filters->>'environment');
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
  )
  select dim, k, l, n, i::bigint, s::bigint, pc::bigint, oc::bigint,
         case when i > 0 then round(oc::numeric / i, 5) else null end,
         round(cv::numeric, 2)
  from x
  where p_dimension = 'all' or dim = p_dimension
  order by dim, oc desc, i desc;
$$;

create or replace function public.ml_analytics_summary(p_from date, p_to date, p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (select * from public.ml_pins_filtrados(p_filters)),
  m as (
    select pm.* from ml_pin_metrics pm join base b on b.pin_id = pm.pin_id
    where pm.date between p_from and p_to
  ),
  tot as (
    select coalesce(sum(impressions), 0) i, coalesce(sum(saves), 0) s, coalesce(sum(pin_clicks), 0) pc,
           coalesce(sum(outbound_clicks), 0) oc from m
  ),
  com as (
    select coalesce(sum(c.commission), 0) v, coalesce(sum(c.gmv), 0) g, coalesce(sum(c.orders), 0) o
    from ml_commissions c
    where c.period_start <= p_to and c.period_end >= p_from
      and (c.pin_id in (select pin_id from base) or (c.pin_id is null and c.product_id in (select product_id from base))
           or (p_filters = '{}'::jsonb and c.pin_id is null and c.product_id is null))
  ),
  pub as (select count(*) n from base where published_at::date between p_from and p_to),
  serie as (
    select coalesce(jsonb_agg(jsonb_build_object('date', d, 'impressions', i, 'saves', s, 'pin_clicks', pc, 'outbound_clicks', oc) order by d), '[]'::jsonb) j
    from (select date d, sum(impressions) i, sum(saves) s, sum(pin_clicks) pc, sum(outbound_clicks) oc from m group by date) z
  )
  select case when not public.ml_pode_ler() then null else jsonb_build_object(
    'pins_publicados', (select n from pub),
    'pins_com_metricas', (select count(distinct pin_id) from m),
    'impressions', tot.i, 'saves', tot.s, 'pin_clicks', tot.pc, 'outbound_clicks', tot.oc,
    'ctr_outbound', case when tot.i > 0 then round(tot.oc::numeric / tot.i, 5) else null end,
    'comissao', com.v, 'gmv', com.g, 'pedidos', com.o,
    'receita_por_pin', case when (select count(*) from base) > 0 then round(com.v / (select count(*) from base), 2) else null end,
    'epc', case when tot.oc > 0 and com.v > 0 then round(com.v / tot.oc, 4) else null end,
    'serie', serie.j
  ) end
  from tot, com, serie;
$$;

-- Contadores do dashboard numa ida só.
create or replace function public.ml_dashboard()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.ml_pode_ler() then null else jsonb_build_object(
    'descobertos_24h', (select count(*) from ml_products where first_seen_at > now() - interval '24 hours'),
    'descobertos_7d', (select count(*) from ml_products where first_seen_at > now() - interval '7 days'),
    'aguardando_analise', (select count(*) from ml_products where status in ('discovered', 'enriching')),
    'aguardando_aprovacao', (select count(*) from ml_products where status = 'analyzed' and coalesce(eligible, true)),
    'aguardando_link', (select count(*) from ml_products where status = 'waiting_affiliate_link'),
    'criativos_revisao', (select count(*) from ml_creatives where status = 'review'),
    'imagens_manuais', (select count(*) from ml_creatives where status = 'waiting_manual_image'),
    'criativos_em_geracao', (select count(*) from ml_creatives where status in ('to_generate', 'generating')),
    'pins_aprovacao', (select count(*) from ml_pins where status = 'pending_approval'),
    'pins_agendados', (select count(*) from ml_pins where status = 'scheduled'),
    'pins_publicados_7d', (select count(*) from ml_pins where status = 'published' and published_at > now() - interval '7 days'),
    'pins_publicados_total', (select count(*) from ml_pins where status = 'published'),
    'pins_hoje', (select count(*) from ml_pins where status = 'published' and published_at > date_trunc('day', now())),
    'aprovados_hoje', (select count(*) from ml_products where approved_at > date_trunc('day', now())),
    'pins_falha', (select count(*) from ml_pins where status in ('failed', 'blocked')),
    'jobs_falha_7d', (select count(*) from ml_jobs where status = 'dead' and finished_at > now() - interval '7 days'),
    'jobs_ativos', (select count(*) from ml_jobs where status in ('queued', 'running')),
    'pendencias_abertas', (select count(*) from ml_tasks where status = 'open' or (status = 'snoozed' and snoozed_until < now())),
    'metricas_7d', (
      select jsonb_build_object('impressions', coalesce(sum(impressions), 0), 'saves', coalesce(sum(saves), 0),
                                'pin_clicks', coalesce(sum(pin_clicks), 0), 'outbound_clicks', coalesce(sum(outbound_clicks), 0))
      from ml_pin_metrics where date > current_date - 7
    )
  ) end;
$$;

revoke all on function public.ml_pins_filtrados(jsonb) from public, anon;
revoke all on function public.ml_analytics_breakdown(date, date, text, jsonb) from public, anon;
revoke all on function public.ml_analytics_summary(date, date, jsonb) from public, anon;
revoke all on function public.ml_dashboard() from public, anon;
grant execute on function public.ml_pins_filtrados(jsonb) to authenticated, service_role;
grant execute on function public.ml_analytics_breakdown(date, date, text, jsonb) to authenticated, service_role;
grant execute on function public.ml_analytics_summary(date, date, jsonb) to authenticated, service_role;
grant execute on function public.ml_dashboard() to authenticated, service_role;
