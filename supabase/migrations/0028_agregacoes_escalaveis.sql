-- Agregações server-side (escalabilidade): mover somas que eram feitas no
-- cliente para o Postgres. Buscar linhas e somar em JS bate no teto de 1000
-- linhas do PostgREST → sub-contagem silenciosa quando o volume cresce. Estas
-- RPCs agregam no banco (sem teto) e mantêm o guard de workspace da resumo_mes.

-- Gasto por pessoa (beneficiário) no mês — null = "Não atribuído".
create or replace function gastos_por_pessoa(
  p_workspace_id uuid,
  p_mes date default (date_trunc('month', now()))::date
)
returns table(id uuid, nome text, total numeric)
language sql stable security definer set search_path to 'public'
as $$
  select e.id, coalesce(e.nome, 'Não atribuído') as nome, sum(t.valor) as total
  from transacoes t
  left join entidades e on e.id = t.beneficiario_id
  where t.workspace_id = p_workspace_id
    and p_workspace_id in (select user_workspaces())
    and t.tipo = 'despesa'
    and t.status_revisao = 'confirmado'
    and t.data_transacao >= p_mes
    and t.data_transacao < (p_mes + interval '1 month')
  group by e.id, e.nome
  having sum(t.valor) > 0
  order by total desc;
$$;

-- Concentração de gastos por fornecedor (estabelecimento) num período.
create or replace function gastos_por_fornecedor(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date
)
returns table(id uuid, nome text, total numeric, n bigint)
language sql stable security definer set search_path to 'public'
as $$
  select e.id, e.nome, sum(t.valor) as total, count(*) as n
  from transacoes t
  join estabelecimentos e on e.id = t.estabelecimento_id
  where t.workspace_id = p_workspace_id
    and p_workspace_id in (select user_workspaces())
    and t.tipo = 'despesa'
    and t.status_revisao = 'confirmado'
    and t.data_transacao >= p_inicio
    and t.data_transacao <= p_fim
  group by e.id, e.nome
  order by total desc;
$$;

-- Dinheiro sem dono: total + contagem de despesas confirmadas SEM categoria
-- (nem na transação, nem em itens) no período.
create or replace function dinheiro_sem_dono(
  p_workspace_id uuid,
  p_inicio date,
  p_fim date
)
returns table(total numeric, n bigint)
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(t.valor), 0) as total, count(*) as n
  from transacoes t
  where t.workspace_id = p_workspace_id
    and p_workspace_id in (select user_workspaces())
    and t.tipo = 'despesa'
    and t.status_revisao = 'confirmado'
    and t.categoria_id is null
    and t.data_transacao >= p_inicio
    and t.data_transacao <= p_fim
    and not exists (
      select 1 from itens_transacao it
      where it.transacao_id = t.id and it.categoria_id is not null
    );
$$;
