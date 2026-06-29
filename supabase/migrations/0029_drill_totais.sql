-- Totais dos drilldowns no banco (escala): os drilldowns somavam as linhas
-- buscadas (teto 1000 do PostgREST). Agora o TOTAL vem de uma agregação SQL
-- (correto em qualquer volume) e a lista exibida é capada no app. Mesmo guard
-- de workspace das demais RPCs (resumo_mes).

-- Total de despesas confirmadas do mês de uma categoria + suas subcategorias.
create or replace function total_categoria_mes(
  p_workspace_id uuid,
  p_categoria_id uuid,
  p_mes date default (date_trunc('month', now()))::date
)
returns numeric
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(t.valor), 0)
  from transacoes t
  where t.workspace_id = p_workspace_id
    and p_workspace_id in (select user_workspaces())
    and t.tipo = 'despesa'
    and t.status_revisao = 'confirmado'
    and (
      t.categoria_id = p_categoria_id
      or t.categoria_id in (select id from categorias where categoria_pai_id = p_categoria_id)
    )
    and t.data_transacao >= p_mes
    and t.data_transacao < (p_mes + interval '1 month');
$$;

-- Total de despesas confirmadas do mês de um beneficiário (null = "Não atribuído").
create or replace function total_pessoa_mes(
  p_workspace_id uuid,
  p_beneficiario_id uuid,
  p_mes date default (date_trunc('month', now()))::date
)
returns numeric
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(t.valor), 0)
  from transacoes t
  where t.workspace_id = p_workspace_id
    and p_workspace_id in (select user_workspaces())
    and t.tipo = 'despesa'
    and t.status_revisao = 'confirmado'
    and (case when p_beneficiario_id is null then t.beneficiario_id is null
              else t.beneficiario_id = p_beneficiario_id end)
    and t.data_transacao >= p_mes
    and t.data_transacao < (p_mes + interval '1 month');
$$;
