-- 0011_nia_alertas.sql
-- Nia proativa: alertas push por WhatsApp (uazapi), 100% no Supabase.
-- pg_cron (de hora em hora) -> pg_net -> Edge Function `nia-alertas-cron`,
-- que avalia regras determinísticas por workspace, renderiza o template e
-- envia via uazapi /send/text. O n8n NÃO participa deste fluxo (só do agente).
--
-- Admin (platform admin) gerencia as definições nas tabelas abaixo. RLS deny-all:
-- só o service_role (lib/admin/* e a Edge Function) lê/escreve.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Definições de alertas (catálogo editável no admin)
-- ---------------------------------------------------------------------------
create table if not exists public.nia_alertas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  -- regra determinística avaliada pela Edge Function:
  tipo          text not null check (tipo in (
                  'saldo_negativo',
                  'orcamento_estourado',
                  'orcamento_perto',
                  'cartao_limite',
                  'resumo_semanal',
                  'resumo_mensal',
                  'personalizado'
                )),
  ativo         boolean not null default true,
  canal         text not null default 'whatsapp' check (canal in ('whatsapp')),
  -- parâmetros da regra: { "limiar_pct": 80, "dias": 7 }
  parametros    jsonb not null default '{}'::jsonb,
  -- template da mensagem (placeholders {nome} {espaco} {valor} {categoria} {pct}
  -- {planejado} {gasto} {cartao} {limite} {saldo} {receitas} {despesas} {periodo}).
  -- null = usa o texto padrão do tipo (definido na Edge Function).
  template      text,
  frequencia    text not null default 'imediato' check (frequencia in (
                  'imediato', 'diario', 'semanal', 'mensal'
                )),
  dia_semana    smallint check (dia_semana between 0 and 6),   -- 0=domingo (semanal)
  dia_mes       smallint check (dia_mes between 1 and 28),     -- (mensal)
  hora          smallint not null default 9 check (hora between 0 and 23), -- America/Sao_Paulo
  publico_alvo  text not null default 'todos_pro' check (publico_alvo in (
                  'todos_pro', 'especificos'
                )),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Alvos específicos (quando publico_alvo = 'especificos').
-- profile_id null = todos os números verificados do workspace;
-- profile_id preenchido = só aquela pessoa.
create table if not exists public.nia_alertas_alvos (
  id            uuid primary key default gen_random_uuid(),
  alerta_id     uuid not null references public.nia_alertas(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade
);
create unique index if not exists nia_alertas_alvos_uniq
  on public.nia_alertas_alvos (alerta_id, workspace_id, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists nia_alertas_alvos_alerta on public.nia_alertas_alvos (alerta_id);

-- Log de envios (auditoria + deduplicação por bucket de tempo).
create table if not exists public.nia_alertas_envios (
  id            uuid primary key default gen_random_uuid(),
  alerta_id     uuid references public.nia_alertas(id) on delete set null,
  workspace_id  uuid,
  profile_id    uuid,
  telefone      text,
  chave_dedup   text not null unique,
  mensagem      text,
  status        text not null default 'enviado' check (status in ('enviado','falhou')),
  erro          text,
  enviado_em    timestamptz not null default now()
);
create index if not exists nia_alertas_envios_alerta on public.nia_alertas_envios (alerta_id, enviado_em desc);
create index if not exists nia_alertas_envios_recent on public.nia_alertas_envios (enviado_em desc);

-- RLS deny-all (só service_role passa).
alter table public.nia_alertas        enable row level security;
alter table public.nia_alertas_alvos  enable row level security;
alter table public.nia_alertas_envios enable row level security;

-- updated_at automático
create or replace function public.nia_alertas_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_nia_alertas_touch on public.nia_alertas;
create trigger trg_nia_alertas_touch before update on public.nia_alertas
  for each row execute function public.nia_alertas_touch();

-- ---------------------------------------------------------------------------
-- Seed: alertas padrão (todos desativados — o admin liga quando quiser)
-- ---------------------------------------------------------------------------
insert into public.nia_alertas (nome, tipo, ativo, parametros, frequencia, hora, publico_alvo)
select * from (values
  ('Saldo negativo',        'saldo_negativo',      false, '{}'::jsonb,                'imediato', 10::smallint, 'todos_pro'),
  ('Orçamento estourou',    'orcamento_estourado', false, '{}'::jsonb,                'imediato', 10::smallint, 'todos_pro'),
  ('Orçamento perto (80%)', 'orcamento_perto',     false, '{"limiar_pct":80}'::jsonb, 'imediato', 10::smallint, 'todos_pro'),
  ('Cartão perto do limite','cartao_limite',       false, '{"limiar_pct":80}'::jsonb, 'imediato', 10::smallint, 'todos_pro'),
  ('Resumo semanal',        'resumo_semanal',      false, '{"dias":7}'::jsonb,        'semanal',  9::smallint,  'todos_pro')
) as v(nome, tipo, ativo, parametros, frequencia, hora, publico_alvo)
where not exists (select 1 from public.nia_alertas);

-- Resumo semanal padrão dispara na segunda-feira.
update public.nia_alertas set dia_semana = 1
where tipo = 'resumo_semanal' and dia_semana is null;

-- ---------------------------------------------------------------------------
-- Config de disparo: URL das functions + secret do cron em integration_settings
-- ---------------------------------------------------------------------------
insert into public.integration_settings (key, valor, secrets)
values ('whatsapp', '{}'::jsonb, '{}'::jsonb)
on conflict (key) do nothing;

update public.integration_settings
set valor = coalesce(valor, '{}'::jsonb)
            || jsonb_build_object('functions_base_url',
                 'https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1'),
    secrets = coalesce(secrets, '{}'::jsonb)
            || case when secrets ? 'cron_secret'
                    then '{}'::jsonb
                    else jsonb_build_object('cron_secret',
                           encode(extensions.gen_random_bytes(24), 'hex'))
               end
where key = 'whatsapp';

-- ---------------------------------------------------------------------------
-- Dispatcher chamado pelo pg_cron: faz POST assíncrono na Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.nia_cron_disparar() returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base   text;
  v_secret text;
begin
  select valor->>'functions_base_url', secrets->>'cron_secret'
    into v_base, v_secret
  from public.integration_settings
  where key = 'whatsapp';

  if v_base is null or v_secret is null then
    return; -- não configurado ainda
  end if;

  perform net.http_post(
    url     := v_base || '/nia-alertas-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke all on function public.nia_cron_disparar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendamento: de hora em hora (no minuto 0). A Edge Function decide o que
-- está "na hora" conforme frequencia/hora/dia de cada alerta.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nia-alertas-hourly') then
    perform cron.unschedule('nia-alertas-hourly');
  end if;
  perform cron.schedule('nia-alertas-hourly', '0 * * * *', 'select public.nia_cron_disparar();');
end $$;

comment on table public.nia_alertas is 'Definições de alertas proativos da Nia (push WhatsApp via uazapi). Gerido no admin.';
comment on table public.nia_alertas_envios is 'Log/dedup de envios de alertas. chave_dedup garante 1 envio por bucket de tempo.';
