-- =============================================================================
-- ML — Afiliados Mercado Livre × Pinterest — 01: fundação
--
-- Módulo isolado do Nosso Tudo. Tudo aqui é prefixado ml_. Reaproveita do
-- projeto apenas: auth.users/profiles (login), platform_admins (dono da
-- plataforma = owner do ML), trigger_set_updated_at(), pg_cron, pg_net e
-- supabase_vault (segredos cifrados em repouso).
--
-- Escopo: operação ÚNICA (não é por workspace). Acesso por papel em
-- ml_members; platform admins são owner implícitos. Ver docs/ml/DECISOES.md.
--
-- Status são TEXT + CHECK (não ENUM) para evoluir sem ALTER TYPE.
-- Escritas vêm SEMPRE do servidor (service_role) depois de autorização no
-- código; o browser só lê (RLS de SELECT por papel). Ver ADR-ML-004.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Acesso
-- -----------------------------------------------------------------------------
create table public.ml_members (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.ml_members is
  'Quem acessa a área ML e com qual papel. Platform admins são owner implícitos.';

-- Papel efetivo do usuário logado (null = sem acesso).
create or replace function public.ml_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from platform_admins where profile_id = auth.uid()) then 'owner'
    else (select role from ml_members where profile_id = auth.uid())
  end;
$$;

-- Tem pelo menos o papel p_min? Hierarquia: viewer < operator < admin < owner.
create or replace function public.ml_has_role(p_min text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (array_position(array['viewer','operator','admin','owner'], public.ml_role()))
      >= array_position(array['viewer','operator','admin','owner'], p_min),
    false);
$$;

revoke all on function public.ml_role() from public, anon;
revoke all on function public.ml_has_role(text) from public, anon;
grant execute on function public.ml_role() to authenticated, service_role;
grant execute on function public.ml_has_role(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Configuração e integrações
-- -----------------------------------------------------------------------------
-- Overrides das configurações (os defaults moram no código, validados por Zod).
create table public.ml_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  version     int not null default 1,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Estado das integrações. NENHUM segredo aqui: tokens/keys ficam no Vault
-- (nomes 'ml/<provider>/<campo>'), acessados só por ml_secret_* (service_role).
create table public.ml_integrations (
  provider           text primary key
                     check (provider in ('mercadolivre', 'pinterest', 'openai', 'apify')),
  status             text not null default 'disconnected'
                     check (status in ('disconnected', 'connected', 'expiring', 'error',
                                       'invalid', 'insufficient_scope')),
  account_id         text,
  account_name       text,
  scopes             text[] not null default '{}',
  config             jsonb not null default '{}'::jsonb,  -- não sensível: client_id, modelo, actor, ambiente
  secret_hints       jsonb not null default '{}'::jsonb,  -- {"api_key": "••••abcd"} — só a máscara
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz,
  connected_at       timestamptz,
  last_refresh_at    timestamptz,
  last_checked_at    timestamptz,
  last_error         text,
  lock_until         timestamptz,                          -- trava de refresh (token ML é de uso único)
  updated_at         timestamptz not null default now()
);

insert into public.ml_integrations (provider) values
  ('mercadolivre'), ('pinterest'), ('openai'), ('apify')
on conflict do nothing;

-- Trava curta por provedor: serializa o refresh de token (o refresh token do
-- Mercado Livre é de uso único — dois refreshes simultâneos queimam a sessão).
create or replace function public.ml_integration_try_lock(p_provider text, p_seconds int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update ml_integrations set lock_until = now() + make_interval(secs => p_seconds)
   where provider = p_provider and (lock_until is null or lock_until < now());
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.ml_integration_unlock(p_provider text) returns void
language sql security definer set search_path = public as $$
  update ml_integrations set lock_until = null where provider = p_provider;
$$;

revoke all on function public.ml_integration_try_lock(text, int) from public, anon, authenticated;
revoke all on function public.ml_integration_unlock(text) from public, anon, authenticated;
grant execute on function public.ml_integration_try_lock(text, int) to service_role;
grant execute on function public.ml_integration_unlock(text) to service_role;

-- State/PKCE do OAuth (vida curta, deny-all).
create table public.ml_oauth_states (
  state          text primary key,
  provider       text not null check (provider in ('mercadolivre', 'pinterest')),
  code_verifier  text,
  profile_id     uuid references public.profiles(id) on delete cascade,
  return_to      text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '15 minutes'
);

-- Segredos no Supabase Vault (cifrados em repouso). Só service_role executa.
create or replace function public.ml_secret_set(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_id uuid;
begin
  if p_name is null or left(p_name, 3) <> 'ml/' then
    raise exception 'nome de segredo inválido';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if p_value is null or p_value = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end $$;

create or replace function public.ml_secret_get(p_name text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and left(p_name, 3) = 'ml/';
$$;

revoke all on function public.ml_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.ml_secret_get(text) from public, anon, authenticated;
grant execute on function public.ml_secret_set(text, text) to service_role;
grant execute on function public.ml_secret_get(text) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Catálogo Mercado Livre
-- -----------------------------------------------------------------------------
create table public.ml_categories (
  id                 text primary key,               -- ex.: MLB1574
  site_id            text not null default 'MLB',
  name               text not null,
  parent_id          text,
  path               jsonb not null default '[]'::jsonb,   -- [{id,name}] da raiz até aqui
  has_children       boolean,
  tracked            boolean not null default false,       -- acompanhar na descoberta
  prohibited         boolean not null default false,       -- regra dura: nunca recomendar
  max_products       int check (max_products is null or max_products between 1 and 200),
  priority           int not null default 0,
  commission_pct     numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  last_discovered_at timestamptz,
  last_trends_at     timestamptz,
  synced_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ml_categories_tracked_idx on public.ml_categories (tracked) where tracked;
create index ml_categories_parent_idx on public.ml_categories (parent_id);

create table public.ml_products (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text not null unique,                -- MLB… (item ou produto de catálogo)
  external_type       text not null default 'item'
                      check (external_type in ('item', 'product', 'user_product')),
  item_id             text,                                -- anúncio que vende (buy box) quando for produto
  title               text not null,
  permalink           text,                                -- URL ORIGINAL do Mercado Livre
  category_id         text references public.ml_categories(id) on delete set null,
  domain_id           text,
  brand               text,
  thumbnail           text,
  pictures            jsonb not null default '[]'::jsonb,  -- [{url,width,height}]
  attributes          jsonb not null default '[]'::jsonb,
  description         text,
  currency            text not null default 'BRL',
  current_price       numeric(12,2),
  original_price      numeric(12,2),
  discount_pct        numeric(5,2),
  rating              numeric(3,2),
  reviews_count       int,
  sold_quantity       int,
  available           boolean,
  availability_reason text,
  condition           text,
  free_shipping       boolean,
  seller              jsonb,
  current_rank        int,
  previous_rank       int,
  best_rank           int,
  rank_delta          int,                                  -- >0 = subiu posições
  trend_keywords      text[] not null default '{}',
  sources             text[] not null default '{}',         -- bestseller | trend | search | manual
  status              text not null default 'discovered'
                      check (status in ('discovered', 'enriching', 'analyzed', 'approved',
                                        'waiting_affiliate_link', 'ready_for_creative',
                                        'creative_draft', 'ready_to_schedule', 'scheduled',
                                        'published', 'paused', 'rejected', 'error')),
  status_reason       text,
  status_changed_at   timestamptz not null default now(),
  paused_from         text,                                 -- status a restaurar ao despausar
  score               numeric(5,2),
  score_confidence    numeric(4,3),
  score_id            uuid,
  eligible            boolean,                              -- passou nas regras duras?
  ai_analysis         jsonb,
  ai_analyzed_at      timestamptz,
  enrichment          jsonb,                                -- dados extras (ex.: Apify), com fonte
  enriched_at         timestamptz,
  last_checked_at     timestamptz,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  times_seen          int not null default 1,
  approved_at         timestamptz,
  approved_by         uuid references public.profiles(id) on delete set null,
  rejected_at         timestamptz,
  rejected_by         uuid references public.profiles(id) on delete set null,
  rejection_reason    text,
  rejection_note      text,
  cooldown_until      timestamptz,
  last_promoted_at    timestamptz,
  times_promoted      int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ml_products_status_idx on public.ml_products (status, score desc nulls last);
create index ml_products_category_idx on public.ml_products (category_id);
create index ml_products_first_seen_idx on public.ml_products (first_seen_at desc);
create index ml_products_title_trgm_idx on public.ml_products using gin (title gin_trgm_ops);

-- Histórico: um snapshot a cada observação relevante (ranking, enriquecimento, checagem).
create table public.ml_product_snapshots (
  id               bigint generated always as identity primary key,
  product_id       uuid not null references public.ml_products(id) on delete cascade,
  captured_at      timestamptz not null default now(),
  source           text not null check (source in ('highlights', 'trends', 'enrich', 'check', 'apify', 'manual')),
  price            numeric(12,2),
  original_price   numeric(12,2),
  discount_pct     numeric(5,2),
  rank_position    int,
  rank_category_id text,
  rating           numeric(3,2),
  reviews_count    int,
  sold_quantity    int,
  available        boolean,
  raw              jsonb
);
create index ml_product_snapshots_product_idx on public.ml_product_snapshots (product_id, captured_at desc);

-- Fotografia diária de cada lista de mais vendidos (base para "subindo/caindo").
create table public.ml_product_rankings (
  id           bigint generated always as identity primary key,
  category_id  text not null,
  collected_on date not null,
  external_id  text not null,
  item_type    text,
  product_id   uuid references public.ml_products(id) on delete set null,
  position     int not null,
  collected_at timestamptz not null default now(),
  unique (category_id, collected_on, external_id)
);
create index ml_product_rankings_product_idx on public.ml_product_rankings (product_id, collected_on desc);

create table public.ml_trends (
  id          bigint generated always as identity primary key,
  category_id text,                         -- null = tendência geral do site
  keyword     text not null,
  url         text,
  position    int,
  trend_type  text not null default 'trend',
  captured_on date not null default current_date,
  week_start  date not null,
  source_url  text,
  created_at  timestamptz not null default now()
);
create unique index ml_trends_unique_idx
  on public.ml_trends (coalesce(category_id, ''), lower(keyword), week_start);
create index ml_trends_week_idx on public.ml_trends (week_start desc);

-- -----------------------------------------------------------------------------
-- 4. Scoring
-- -----------------------------------------------------------------------------
create table public.ml_scoring_versions (
  version     int primary key,
  weights     jsonb not null,
  params      jsonb not null default '{}'::jsonb,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.ml_product_scores (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.ml_products(id) on delete cascade,
  score              numeric(5,2) not null,
  confidence         numeric(4,3) not null,
  eligible           boolean not null,
  components         jsonb not null,        -- [{key,label,weight,value,points,detail,missing}]
  positives          jsonb not null default '[]'::jsonb,
  alerts             jsonb not null default '[]'::jsonb,
  missing_data       text[] not null default '{}',
  hard_rule_failures text[] not null default '{}',
  formula_version    int not null,
  weights            jsonb not null,
  model              text,
  prompt_version     text,
  reason             text,
  created_at         timestamptz not null default now()
);
create index ml_product_scores_product_idx on public.ml_product_scores (product_id, created_at desc);

alter table public.ml_products
  add constraint ml_products_score_fk foreign key (score_id)
  references public.ml_product_scores(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 5. Links de afiliado
-- -----------------------------------------------------------------------------
create table public.ml_affiliate_links (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.ml_products(id) on delete cascade,
  original_url   text,
  affiliate_url  text not null,
  label          text,
  source         text not null default 'manual' check (source in ('manual', 'api')),
  active         boolean not null default true,
  validated_at   timestamptz,
  validation     jsonb,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  deactivated_at timestamptz
);
create unique index ml_affiliate_links_active_idx
  on public.ml_affiliate_links (product_id) where active;

-- -----------------------------------------------------------------------------
-- 6. Pinterest: boards
-- -----------------------------------------------------------------------------
create table public.ml_pinterest_boards (
  id             uuid primary key default gen_random_uuid(),
  external_id    text not null unique,
  name           text not null,
  description    text,
  privacy        text,
  pin_count      int,
  follower_count int,
  image_url      text,
  category_ids   text[] not null default '{}',   -- categorias ML mapeadas para este board
  is_default     boolean not null default false,
  active         boolean not null default true,
  synced_at      timestamptz,
  removed_at     timestamptz,                    -- sumiu do Pinterest na última sync
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. Conteúdo e criativos
-- -----------------------------------------------------------------------------
create table public.ml_creative_angles (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.ml_products(id) on delete cascade,
  type           text not null,
  hook           text not null,
  audience       text,
  keyword        text,
  rationale      text,
  score          numeric(5,2),
  status         text not null default 'suggested'
                 check (status in ('suggested', 'selected', 'discarded', 'used')),
  source         text not null default 'ai' check (source in ('ai', 'template', 'manual')),
  model          text,
  prompt_version text,
  batch          int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index ml_creative_angles_product_idx on public.ml_creative_angles (product_id, status);

create table public.ml_creatives (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.ml_products(id) on delete cascade,
  angle_id            uuid references public.ml_creative_angles(id) on delete set null,
  variant_of          uuid references public.ml_creatives(id) on delete set null,
  headline            text,          -- texto curto na arte
  title               text,          -- título do Pin
  description         text,
  alt_text            text,
  cta                 text,
  keywords            text[] not null default '{}',
  board_id            uuid references public.ml_pinterest_boards(id) on delete set null,
  format              text not null default '2:3',
  image_mode          text not null default 'composition'
                      check (image_mode in ('api', 'manual_chatgpt', 'upload', 'composition')),
  image_prompt        text,
  reference_image_url text,
  current_asset_id    uuid,
  copy_status         text not null default 'none'
                      check (copy_status in ('none', 'queued', 'generating', 'ready', 'failed')),
  image_status        text not null default 'none'
                      check (image_status in ('none', 'queued', 'generating', 'waiting_manual', 'ready', 'failed')),
  status              text not null default 'to_generate'
                      check (status in ('to_generate', 'generating', 'waiting_manual_image', 'review',
                                        'approved', 'rejected', 'published', 'archived')),
  quality_score       numeric(5,2),
  quality_notes       jsonb,
  rejection_reason    text,
  approved_at         timestamptz,
  approved_by         uuid references public.profiles(id) on delete set null,
  model               text,
  prompt_version      text,
  last_error          text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ml_creatives_status_idx on public.ml_creatives (status, updated_at desc);
create index ml_creatives_product_idx on public.ml_creatives (product_id);

-- Toda imagem gerada/enviada vira um asset; trocar a imagem nunca apaga a anterior.
create table public.ml_creative_assets (
  id           uuid primary key default gen_random_uuid(),
  creative_id  uuid not null references public.ml_creatives(id) on delete cascade,
  storage_path text not null,
  public_url   text not null,
  mode         text not null check (mode in ('api', 'manual_chatgpt', 'upload', 'composition')),
  prompt       text,
  model        text,
  width        int,
  height       int,
  bytes        int,
  mime         text,
  sha256       text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index ml_creative_assets_creative_idx on public.ml_creative_assets (creative_id, created_at desc);

alter table public.ml_creatives
  add constraint ml_creatives_asset_fk foreign key (current_asset_id)
  references public.ml_creative_assets(id) on delete set null;

-- Histórico de texto/imagem a cada edição, regeneração ou substituição.
create table public.ml_creative_revisions (
  id          bigint generated always as identity primary key,
  creative_id uuid not null references public.ml_creatives(id) on delete cascade,
  reason      text not null check (reason in ('edit', 'regenerate_copy', 'regenerate_image',
                                              'replace_image', 'generated')),
  snapshot    jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index ml_creative_revisions_creative_idx on public.ml_creative_revisions (creative_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 8. Pins / publicações e métricas
-- -----------------------------------------------------------------------------
create table public.ml_pins (
  id                uuid primary key default gen_random_uuid(),
  creative_id       uuid not null references public.ml_creatives(id) on delete restrict,
  product_id        uuid not null references public.ml_products(id) on delete restrict,
  board_id          uuid references public.ml_pinterest_boards(id) on delete set null,
  affiliate_link_id uuid references public.ml_affiliate_links(id) on delete set null,
  title             text,
  description       text,
  alt_text          text,
  link_url          text,
  media_url         text,
  status            text not null default 'draft'
                    check (status in ('draft', 'pending_approval', 'scheduled', 'publishing',
                                      'published', 'failed', 'blocked', 'canceled', 'paused')),
  scheduled_at      timestamptz,
  timezone          text,
  published_at      timestamptz,
  external_pin_id   text unique,
  external_url      text,
  environment       text check (environment in ('production', 'sandbox')),
  idempotency_key   text not null unique default gen_random_uuid()::text,
  attempts          int not null default 0,
  last_error        text,
  validation        jsonb,
  validated_at      timestamptz,
  duplicated_from   uuid references public.ml_pins(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ml_pins_status_idx on public.ml_pins (status, scheduled_at);
create index ml_pins_product_idx on public.ml_pins (product_id);
create index ml_pins_published_idx on public.ml_pins (published_at desc) where published_at is not null;

create table public.ml_pin_metrics (
  pin_id          uuid not null references public.ml_pins(id) on delete cascade,
  date            date not null,
  impressions     int not null default 0,
  saves           int not null default 0,
  pin_clicks      int not null default 0,
  outbound_clicks int not null default 0,
  raw             jsonb,
  fetched_at      timestamptz not null default now(),
  primary key (pin_id, date)
);
create index ml_pin_metrics_date_idx on public.ml_pin_metrics (date);

-- Comissão/receita importada (o ML não expõe API de comissões de afiliado).
create table public.ml_commissions (
  id            uuid primary key default gen_random_uuid(),
  period_start  date not null,
  period_end    date not null,
  product_id    uuid references public.ml_products(id) on delete set null,
  pin_id        uuid references public.ml_pins(id) on delete set null,
  external_ref  text,
  clicks        int,
  orders        int,
  gmv           numeric(12,2),
  commission    numeric(12,2) not null default 0,
  source        text not null default 'manual' check (source in ('manual', 'csv', 'api')),
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index ml_commissions_ref_idx on public.ml_commissions (external_ref) where external_ref is not null;

-- Estatística de performance observada (separada do score editorial — §21).
create table public.ml_performance_stats (
  dimension       text not null,   -- category | product | angle | board | headline | creative | price_band
  key             text not null,
  period_days     int not null,
  pins            int not null default 0,
  impressions     bigint not null default 0,
  saves           bigint not null default 0,
  pin_clicks      bigint not null default 0,
  outbound_clicks bigint not null default 0,
  commission      numeric(12,2) not null default 0,
  ctr             numeric(8,5),
  perf_score      numeric(5,2),
  computed_at     timestamptz not null default now(),
  primary key (dimension, key, period_days)
);

-- -----------------------------------------------------------------------------
-- 9. Jobs, filas e agendamentos
-- -----------------------------------------------------------------------------
create table public.ml_schedules (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  name             text not null,
  description      text,
  job_type         text not null,
  cron_expression  text not null,
  timezone         text not null default 'America/Sao_Paulo',
  enabled          boolean not null default true,
  overlap_policy   text not null default 'skip' check (overlap_policy in ('skip', 'queue', 'cancel_previous')),
  config           jsonb not null default '{}'::jsonb,
  ui               jsonb,                        -- representação do modo simples
  next_run_at      timestamptz,
  last_run_at      timestamptz,
  last_status      text,
  last_job_id      uuid,
  last_duration_ms int,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.ml_jobs (
  id                uuid primary key default gen_random_uuid(),
  type              text not null,
  payload           jsonb not null default '{}'::jsonb,
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'succeeded', 'failed', 'dead', 'canceled')),
  priority          int not null default 100,             -- menor = antes
  attempts          int not null default 0,
  max_attempts      int not null default 5,
  run_at            timestamptz not null default now(),
  timeout_seconds   int not null default 240,
  locked_by         text,
  lock_expires_at   timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       int,
  last_error        text,
  error_detail      jsonb,
  result            jsonb,
  progress          jsonb,
  idempotency_key   text,
  concurrency_key   text,
  cancel_requested  boolean not null default false,
  schedule_id       uuid references public.ml_schedules(id) on delete set null,
  parent_id         uuid references public.ml_jobs(id) on delete set null,
  entity_type       text,
  entity_id         text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Idempotência: no máximo um job ATIVO por chave.
create unique index ml_jobs_idem_active_idx
  on public.ml_jobs (idempotency_key) where idempotency_key is not null and status in ('queued', 'running');
create index ml_jobs_claim_idx on public.ml_jobs (priority, run_at) where status = 'queued';
create index ml_jobs_running_idx on public.ml_jobs (lock_expires_at) where status = 'running';
create index ml_jobs_type_idx on public.ml_jobs (type, created_at desc);
create index ml_jobs_status_idx on public.ml_jobs (status, created_at desc);
create index ml_jobs_entity_idx on public.ml_jobs (entity_type, entity_id);
create index ml_jobs_schedule_idx on public.ml_jobs (schedule_id, created_at desc);

create table public.ml_job_logs (
  id         bigint generated always as identity primary key,
  job_id     uuid not null references public.ml_jobs(id) on delete cascade,
  level      text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message    text not null,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index ml_job_logs_job_idx on public.ml_job_logs (job_id, id);

create table public.ml_schedule_runs (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.ml_schedules(id) on delete cascade,
  trigger     text not null check (trigger in ('cron', 'manual')),
  outcome     text not null check (outcome in ('enqueued', 'skipped_overlap', 'queued_behind',
                                               'canceled_previous', 'skipped_paused', 'error')),
  job_id      uuid references public.ml_jobs(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index ml_schedule_runs_schedule_idx on public.ml_schedule_runs (schedule_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 10. Pendências, histórico, auditoria e observabilidade
-- -----------------------------------------------------------------------------
-- Pendências EXCEPCIONAIS (erro que pede decisão, publicação bloqueada, auth,
-- configuração). Pendências de fluxo (link, aprovação, imagem manual) derivam do
-- status das entidades — fonte única da verdade, nada para sincronizar.
create table public.ml_tasks (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('publish_blocked', 'integration_auth', 'config_incomplete',
                                                'job_failed', 'product_changed', 'other')),
  title         text not null,
  detail        text,
  entity_type   text,
  entity_id     text,
  payload       jsonb not null default '{}'::jsonb,
  priority      int not null default 50,
  status        text not null default 'open' check (status in ('open', 'done', 'dismissed', 'snoozed')),
  dedupe_key    text,
  snoozed_until timestamptz,
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index ml_tasks_dedupe_idx
  on public.ml_tasks (dedupe_key) where dedupe_key is not null and status in ('open', 'snoozed');
create index ml_tasks_status_idx on public.ml_tasks (status, priority, created_at);

create table public.ml_status_history (
  id          bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('product', 'creative', 'pin')),
  entity_id   uuid not null,
  from_status text,
  to_status   text not null,
  reason      text,
  actor_type  text not null default 'user' check (actor_type in ('user', 'system', 'automation')),
  actor_id    uuid references public.profiles(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index ml_status_history_entity_idx on public.ml_status_history (entity_type, entity_id, created_at desc);

create table public.ml_feedback (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product', 'creative', 'pin')),
  entity_id   uuid not null,
  kind        text not null check (kind in ('reject', 'approve', 'edit')),
  reason      text,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index ml_feedback_entity_idx on public.ml_feedback (entity_type, entity_id);

create table public.ml_audit_log (
  id          bigint generated always as identity primary key,
  actor_type  text not null default 'user' check (actor_type in ('user', 'system', 'automation')),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index ml_audit_log_created_idx on public.ml_audit_log (created_at desc);
create index ml_audit_log_entity_idx on public.ml_audit_log (entity_type, entity_id);

-- Chamadas a APIs externas (sem segredo: URL sem query, sem headers).
create table public.ml_api_calls (
  id          bigint generated always as identity primary key,
  provider    text not null,
  operation   text not null,
  method      text not null,
  url         text not null,
  status      int,
  duration_ms int,
  request_id  text,
  error       text,
  job_id      uuid references public.ml_jobs(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index ml_api_calls_created_idx on public.ml_api_calls (created_at desc);
create index ml_api_calls_provider_idx on public.ml_api_calls (provider, created_at desc);

-- -----------------------------------------------------------------------------
-- 11. updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ml_categories', 'ml_products', 'ml_pinterest_boards', 'ml_creative_angles',
                           'ml_creatives', 'ml_pins', 'ml_schedules', 'ml_jobs', 'ml_tasks',
                           'ml_integrations', 'ml_settings']
  loop
    execute format('create trigger tg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.trigger_set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 12. RLS: leitura por papel; escrita só pelo servidor (service_role)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- leitura para qualquer membro (viewer+)
  foreach t in array array['ml_settings', 'ml_integrations', 'ml_categories', 'ml_products',
                           'ml_product_snapshots', 'ml_product_rankings', 'ml_trends',
                           'ml_scoring_versions', 'ml_product_scores', 'ml_affiliate_links',
                           'ml_pinterest_boards', 'ml_creative_angles', 'ml_creatives',
                           'ml_creative_assets', 'ml_creative_revisions', 'ml_pins', 'ml_pin_metrics',
                           'ml_commissions', 'ml_performance_stats', 'ml_schedules', 'ml_schedule_runs',
                           'ml_tasks', 'ml_status_history', 'ml_feedback']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ml_has_role(''viewer''))',
                   'p_' || t || '_read', t);
  end loop;
  -- leitura técnica (jobs/logs/auditoria/chamadas): operator+
  foreach t in array array['ml_jobs', 'ml_job_logs', 'ml_audit_log', 'ml_api_calls']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ml_has_role(''operator''))',
                   'p_' || t || '_read', t);
  end loop;
end $$;

alter table public.ml_members enable row level security;
create policy p_ml_members_read on public.ml_members for select to authenticated
  using (profile_id = auth.uid() or public.ml_has_role('admin'));

-- deny-all (só service_role)
alter table public.ml_oauth_states enable row level security;

-- -----------------------------------------------------------------------------
-- 13. Fila: claim atômico, reaper e agendador
-- -----------------------------------------------------------------------------
-- Reivindica até p_limit jobs prontos. SKIP LOCKED evita dois workers no mesmo
-- job; o advisory lock serializa o claim para respeitar concurrency_key
-- (no máximo um job "running" por chave — política "aguardar/enfileirar").
create or replace function public.ml_claim_jobs(p_worker text, p_limit int default 5, p_types text[] default null)
returns setof public.ml_jobs
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('ml_claim_jobs'));
  return query
  with candidatos as (
    select j.id, j.concurrency_key,
           row_number() over (partition by coalesce(j.concurrency_key, j.id::text)
                              order by j.priority, j.run_at) as rn
    from ml_jobs j
    where j.status = 'queued'
      and j.run_at <= now()
      and not j.cancel_requested
      and (p_types is null or j.type = any(p_types))
      and (j.concurrency_key is null or not exists (
            select 1 from ml_jobs r where r.status = 'running' and r.concurrency_key = j.concurrency_key))
  ),
  escolhidos as (
    select j.id from ml_jobs j join candidatos c on c.id = j.id
    where c.rn = 1
    order by j.priority, j.run_at
    limit greatest(p_limit, 0)
    for update of j skip locked
  )
  update ml_jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_by = p_worker,
         started_at = now(),
         finished_at = null,
         lock_expires_at = now() + make_interval(secs => j.timeout_seconds + 30)
    from escolhidos e
   where j.id = e.id
  returning j.*;
end $$;

-- Jobs "running" com lease vencido (worker morreu/timeout): volta para a fila
-- com backoff ou vai para dead-letter se esgotou tentativas.
create or replace function public.ml_reap_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with vencidos as (
    select id from ml_jobs
    where status = 'running' and lock_expires_at < now()
    for update skip locked
  )
  update ml_jobs j
     set status = case when j.attempts >= j.max_attempts then 'dead' else 'queued' end,
         run_at = now() + make_interval(secs => least(3600, 30 * power(2, j.attempts)::int)),
         last_error = 'Tempo limite excedido (lease expirou) — reprocessado automaticamente.',
         locked_by = null,
         lock_expires_at = null,
         finished_at = case when j.attempts >= j.max_attempts then now() else null end
    from vencidos v
   where j.id = v.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Reivindica agendamentos vencidos (lock curto para não disparar duas vezes).
create or replace function public.ml_claim_due_schedules(p_limit int default 20)
returns setof public.ml_schedules
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from ml_schedules
    where enabled and next_run_at is not null and next_run_at <= now()
      and (locked_until is null or locked_until < now())
    order by next_run_at
    limit p_limit
    for update skip locked
  )
  update ml_schedules s set locked_until = now() + interval '2 minutes'
    from due where s.id = due.id
  returning s.*;
end $$;

revoke all on function public.ml_claim_jobs(text, int, text[]) from public, anon, authenticated;
revoke all on function public.ml_reap_jobs() from public, anon, authenticated;
revoke all on function public.ml_claim_due_schedules(int) from public, anon, authenticated;
grant execute on function public.ml_claim_jobs(text, int, text[]) to service_role;
grant execute on function public.ml_reap_jobs() to service_role;
grant execute on function public.ml_claim_due_schedules(int) to service_role;

-- -----------------------------------------------------------------------------
-- 14. Batida do worker: pg_cron (1/min) → POST no app (/api/ml/worker)
-- -----------------------------------------------------------------------------
-- O segredo do worker nasce aqui, aleatório, dentro do Vault — ninguém precisa
-- configurar env var. A URL do app fica em ml_settings('runtime').app_url e é
-- preenchida pelo próprio app em produção (nunca localhost).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ml/worker/secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ml/worker/secret');
  end if;
end $$;

create or replace function public.ml_cron_tick() returns void
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_url    text;
  v_secret text;
begin
  select value->>'app_url' into v_url from ml_settings where key = 'runtime';
  if v_url is null or v_url = '' or coalesce((select (value->>'tick_enabled')::boolean from ml_settings where key = 'runtime'), true) = false then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ml/worker/secret';
  if v_secret is null then return; end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/api/ml/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ml-worker-secret', v_secret),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 5000
  );
end $$;

revoke all on function public.ml_cron_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ml-worker-tick') then
    perform cron.unschedule('ml-worker-tick');
  end if;
  perform cron.schedule('ml-worker-tick', '* * * * *', 'select public.ml_cron_tick();');
end $$;

-- -----------------------------------------------------------------------------
-- 15. Storage: mídia dos criativos (pública: o Pinterest precisa de URL estável)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ml-media', 'ml-media', true, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- Sem policies de escrita para authenticated: upload só pelo servidor, validado.

-- -----------------------------------------------------------------------------
-- 16. Dados iniciais (editáveis no painel — nada fica fixo no código)
-- -----------------------------------------------------------------------------
insert into public.ml_scoring_versions (version, weights, note) values
  (1, '{"bestseller_rank":20,"trend":15,"pinterest_fit":20,"reviews":10,"commission":10,"price_range":5,"discount":5,"image_quality":10,"novelty":5,"performance":0}'::jsonb,
   'Pesos iniciais da especificação (§15) — hipótese, não verdade.')
on conflict do nothing;

insert into public.ml_schedules (key, name, description, job_type, cron_expression, enabled, overlap_policy, config) values
  ('discover_bestsellers', 'Descoberta de mais vendidos', 'Coleta os mais vendidos das categorias acompanhadas.',
   'DISCOVER_BESTSELLERS', '0 6 * * *', true, 'skip', '{"limit_per_category":20}'),
  ('discover_trends', 'Coleta de tendências', 'Coleta as buscas em alta do Mercado Livre.',
   'DISCOVER_TRENDS', '30 6 * * 1', true, 'skip', '{}'),
  ('process_pipeline', 'Processar pipeline', 'Enriquece e pontua produtos pendentes; avança o que estiver elegível.',
   'PROCESS_PIPELINE', '*/15 * * * *', true, 'skip', '{"batch":25}'),
  ('generate_creatives', 'Geração automática de criativos', 'Gera ângulos e criativos para produtos prontos (quando a automação estiver ligada).',
   'GENERATE_PENDING_CREATIVES', '0 * * * *', false, 'skip', '{"per_run":5}'),
  ('publish_dispatch', 'Publicação', 'Publica Pins agendados que venceram e distribui os aprovados nas janelas.',
   'DISPATCH_PUBLICATIONS', '*/5 * * * *', true, 'skip', '{}'),
  ('revalidate_scheduled', 'Revalidar agendados', 'Revalida produtos de Pins que vão publicar em breve.',
   'REVALIDATE_SCHEDULED', '*/15 * * * *', true, 'skip', '{"lead_minutes":60}'),
  ('pinterest_analytics', 'Analytics do Pinterest', 'Coleta métricas dos Pins publicados.',
   'FETCH_PIN_ANALYTICS', '0 2 * * *', true, 'skip', '{"lookback_days":30}'),
  ('revalidate_catalog', 'Revalidar catálogo publicado', 'Confere preço e disponibilidade de produtos já publicados.',
   'REVALIDATE_CATALOG', '0 4 * * *', true, 'skip', '{"batch":50}'),
  ('refresh_tokens', 'Renovar tokens', 'Renova tokens OAuth antes de expirarem.',
   'REFRESH_TOKENS', '0 */2 * * *', true, 'skip', '{}'),
  ('sync_boards', 'Sincronizar boards', 'Sincroniza os boards do Pinterest.',
   'SYNC_BOARDS', '0 5 * * *', true, 'skip', '{}'),
  ('compute_performance', 'Aprendizado de performance', 'Calcula a performance histórica por categoria, produto, ângulo e criativo.',
   'COMPUTE_PERFORMANCE', '30 2 * * *', true, 'skip', '{}'),
  ('cleanup', 'Limpeza', 'Remove mídia temporária, logs e jobs antigos conforme a retenção.',
   'CLEANUP', '0 3 * * 0', true, 'skip', '{"retention_days":30}')
on conflict (key) do nothing;
