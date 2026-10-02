-- =============================================================================
-- ML — 05: analytics V2 (§11.9, §17) — família, variante, tipo visual, cena,
-- com/sem texto, método de fidelidade, IA; coortes por dias após publicação.
-- Substitui ml_pins_filtrados / ml_analytics_breakdown / ml_analytics_summary
-- mantendo as dimensões e filtros anteriores (sem regressão).
-- =============================================================================

drop function if exists public.ml_pins_filtrados(jsonb);

create function public.ml_pins_filtrados(p_filters jsonb default '{}'::jsonb)
returns table (
  pin_id uuid, product_id uuid, board_id uuid, creative_id uuid, published_at timestamptz,
  headline text, angle_type text, category_id text, category_name text, title text,
  price numeric, price_band text, board_name text,
  family_id uuid, family_name text, visual_type text, scene_key text, scene_name text,
  has_text boolean, fidelity_mode text, image_mode text, ai_modified boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.product_id, p.board_id, p.creative_id, p.published_at,
         c.headline, coalesce(a.type, 'sem_angulo'), pr.category_id, cat.name, pr.title,
         pr.current_price, public.ml_faixa_preco(pr.current_price), b.name,
         coalesce(p.family_id, c.family_id), f.name, c.visual_type, sp.key, sp.name,
         c.has_text_overlay, c.fidelity_mode, c.image_mode, coalesce(p.ai_modified, c.ai_modified)
  from ml_pins p
  join ml_products pr on pr.id = p.product_id
  join ml_creatives c on c.id = p.creative_id
  left join ml_creative_angles a on a.id = c.angle_id
  left join ml_pinterest_boards b on b.id = p.board_id
  left join ml_categories cat on cat.id = pr.category_id
  left join ml_creative_families f on f.id = coalesce(p.family_id, c.family_id)
  left join ml_scene_presets sp on sp.id = c.scene_preset_id
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
    and (p_filters->>'headline' is null or c.headline = p_filters->>'headline')
    and (p_filters->>'family_id' is null or coalesce(p.family_id, c.family_id)::text = p_filters->>'family_id')
    and (p_filters->>'visual_type' is null or c.visual_type = p_filters->>'visual_type')
    and (p_filters->>'scene' is null or sp.key = p_filters->>'scene')
    and (p_filters->>'has_text' is null or c.has_text_overlay = (p_filters->>'has_text')::boolean)
    and (p_filters->>'fidelity_mode' is null or c.fidelity_mode = p_filters->>'fidelity_mode');
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
    union all select 'product', product_id::text, max(title), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by product_id
    union all select 'board', coalesce(board_id::text, '—'), coalesce(max(board_name), 'Sem board'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by board_id
    union all select 'angle', angle_type, angle_type, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by angle_type
    union all select 'headline', coalesce(headline, '—'), coalesce(headline, '—'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by headline
    union all select 'creative', creative_id::text, coalesce(max(headline), '—'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by creative_id
    union all select 'price_band', price_band, price_band, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by price_band
    union all select 'pin', pin_id::text, coalesce(max(headline), max(title)), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by pin_id
    union all select 'family', coalesce(family_id::text, '—'), coalesce(max(family_name), 'Sem família'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by family_id
    union all select 'visual_type', visual_type, visual_type, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by visual_type
    union all select 'scene', coalesce(scene_key, '—'), coalesce(max(scene_name), 'Sem cena (foto original)'), count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by scene_key
    union all select 'text', case when has_text then 'com_texto' else 'sem_texto' end, case when has_text then 'Com texto na imagem' else 'Sem texto na imagem' end,
                     count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by has_text
    union all select 'method', fidelity_mode, fidelity_mode, count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by fidelity_mode
    union all select 'ai', case when ai_modified then 'ia' else 'sem_ia' end, case when ai_modified then 'Gerado/modificado por IA' else 'Sem IA' end,
                     count(*), sum(i), sum(s), sum(pc), sum(oc), sum(cv) from j group by ai_modified
  )
  select dim, k, l, n, i::bigint, s::bigint, pc::bigint, oc::bigint,
         case when i > 0 then round(oc::numeric / i, 5) else null end,
         round(cv::numeric, 2)
  from x
  where p_dimension = 'all' or dim = p_dimension
  order by dim, oc desc, i desc;
$$;

-- Coorte: desempenho nos primeiros N dias de vida de cada Pin (só Pins com N dias completos).
create or replace function public.ml_analytics_cohort(p_dias int, p_dimension text, p_filters jsonb default '{}'::jsonb)
returns table (
  dimension text, key text, label text, pins bigint, impressions bigint, saves bigint,
  pin_clicks bigint, outbound_clicks bigint, ctr numeric
)
language sql stable security definer set search_path = public as $$
  with base as (
    select * from public.ml_pins_filtrados(p_filters)
    where published_at <= now() - make_interval(days => p_dias)
  ),
  m as (
    select b.pin_id, sum(pm.impressions) i, sum(pm.saves) s, sum(pm.pin_clicks) pc, sum(pm.outbound_clicks) oc
    from base b join ml_pin_metrics pm on pm.pin_id = b.pin_id
     and pm.date >= b.published_at::date and pm.date < b.published_at::date + p_dias
    group by b.pin_id
  ),
  j as (
    select b.*, coalesce(m.i, 0) i, coalesce(m.s, 0) s, coalesce(m.pc, 0) pc, coalesce(m.oc, 0) oc
    from base b left join m on m.pin_id = b.pin_id
  ),
  x as (
    select 'family'::text dim, coalesce(family_id::text, '—') k, coalesce(max(family_name), 'Sem família') l, count(*) n, sum(i) i, sum(s) s, sum(pc) pc, sum(oc) oc from j group by family_id
    union all select 'creative', creative_id::text, coalesce(max(headline), '—'), count(*), sum(i), sum(s), sum(pc), sum(oc) from j group by creative_id
    union all select 'visual_type', visual_type, visual_type, count(*), sum(i), sum(s), sum(pc), sum(oc) from j group by visual_type
    union all select 'scene', coalesce(scene_key, '—'), coalesce(max(scene_name), 'Sem cena (foto original)'), count(*), sum(i), sum(s), sum(pc), sum(oc) from j group by scene_key
    union all select 'text', case when has_text then 'com_texto' else 'sem_texto' end, case when has_text then 'Com texto na imagem' else 'Sem texto na imagem' end, count(*), sum(i), sum(s), sum(pc), sum(oc) from j group by has_text
    union all select 'product', product_id::text, max(title), count(*), sum(i), sum(s), sum(pc), sum(oc) from j group by product_id
  )
  select dim, k, l, n, i::bigint, s::bigint, pc::bigint, oc::bigint,
         case when i > 0 then round(oc::numeric / i, 5) else null end
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
  fam as (select count(distinct family_id) n from base where family_id is not null),
  serie as (
    select coalesce(jsonb_agg(jsonb_build_object('date', d, 'impressions', i, 'saves', s, 'pin_clicks', pc, 'outbound_clicks', oc) order by d), '[]'::jsonb) j
    from (select date d, sum(impressions) i, sum(saves) s, sum(pin_clicks) pc, sum(outbound_clicks) oc from m group by date) z
  )
  select case when not public.ml_pode_ler() then null else jsonb_build_object(
    'pins_publicados', (select n from pub),
    'pins_com_metricas', (select count(distinct pin_id) from m),
    'familias', (select n from fam),
    'impressions', tot.i, 'saves', tot.s, 'pin_clicks', tot.pc, 'outbound_clicks', tot.oc,
    'ctr_outbound', case when tot.i > 0 then round(tot.oc::numeric / tot.i, 5) else null end,
    'outbound_por_mil', case when tot.i > 0 then round(tot.oc::numeric * 1000 / tot.i, 3) else null end,
    'comissao', com.v, 'gmv', com.g, 'pedidos', com.o,
    'receita_por_pin', case when (select count(*) from base) > 0 then round(com.v / (select count(*) from base), 2) else null end,
    'receita_por_familia', case when (select n from fam) > 0 then round(com.v / (select n from fam), 2) else null end,
    'epc', case when tot.oc > 0 and com.v > 0 then round(com.v / tot.oc, 4) else null end,
    'serie', serie.j
  ) end
  from tot, com, serie;
$$;

-- Dashboard V2: contadores novos somados aos anteriores (§11.1)
create or replace function public.ml_dashboard_v2()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.ml_pode_ler() then null else jsonb_build_object(
    'familias_em_teste', (select count(*) from ml_creative_families where status in ('generating', 'active')),
    'produtos_sem_referencia', (
      select count(*) from ml_products p
      where p.status in ('ready_for_creative', 'creative_draft', 'ready_to_schedule', 'waiting_affiliate_link', 'approved')
        and not exists (select 1 from ml_product_media m where m.product_id = p.id and m.media_role = 'primary_reference')),
    'criativos_alerta_fidelidade', (select count(*) from ml_creatives where fidelity_status in ('warning', 'failed') and status not in ('rejected', 'archived')),
    'criativos_fidelidade_pendente', (select count(*) from ml_creatives where fidelity_status = 'pending' and status = 'review'),
    'pacotes_pendentes', (select count(*) from ml_creatives where status = 'approved' and package_status in ('missing', 'incomplete', 'invalid')),
    'publicados_por_tipo', (
      select coalesce(jsonb_object_agg(visual_type, n), '{}'::jsonb)
      from (select c.visual_type, count(*) n from ml_pins p join ml_creatives c on c.id = p.creative_id
            where p.status = 'published' and p.published_at > now() - interval '30 days' group by c.visual_type) z)
  ) end;
$$;

revoke all on function public.ml_pins_filtrados(jsonb) from public, anon;
revoke all on function public.ml_analytics_cohort(int, text, jsonb) from public, anon;
revoke all on function public.ml_dashboard_v2() from public, anon;
grant execute on function public.ml_pins_filtrados(jsonb) to authenticated, service_role;
grant execute on function public.ml_analytics_cohort(int, text, jsonb) to authenticated, service_role;
grant execute on function public.ml_dashboard_v2() to authenticated, service_role;
