-- Consulta/soma precisa de transações por filtros (pessoa/beneficiário,
-- descritor, período) — para "quanto custou o presente da Gabriela?",
-- "quanto gastei com a Bruna em maio?", "quanto gastamos no Pão de Açúcar?".
-- O banco soma: total_geral = sum() OVER () é calculado sobre TODO o conjunto
-- que casa (window roda antes do LIMIT), então o total é exato mesmo retornando
-- só uma amostra de linhas. O descritor casa por substring normalizada em
-- descrição / estabelecimento / categoria (recall bom p/ termo livre; a pessoa
-- + período já dão a precisão do recorte).
create or replace function consultar_transacoes(
  p_workspace_id uuid,
  p_termo text default null,
  p_beneficiario_id uuid default null,
  p_tipo text default 'despesa',
  p_inicio date default null,
  p_fim date default null,
  p_limite int default 8
)
returns table(
  id uuid,
  descricao text,
  valor numeric,
  data date,
  local text,
  total_geral numeric,
  n_geral bigint
)
language sql stable security definer set search_path to 'public'
as $$
  with q as (
    select case when p_termo is null or btrim(p_termo) = '' then null
                else '%' || normalizar_texto(p_termo) || '%' end as pat
  ),
  base as (
    select t.id, t.descricao, t.valor, t.data_transacao, e.nome as local
    from transacoes t
    left join estabelecimentos e on e.id = t.estabelecimento_id
    left join categorias c on c.id = t.categoria_id
    cross join q
    where t.workspace_id = p_workspace_id
      and p_workspace_id in (select user_workspaces())
      and t.status_revisao = 'confirmado'
      and (p_tipo is null or t.tipo::text = p_tipo)
      and (p_beneficiario_id is null or t.beneficiario_id = p_beneficiario_id)
      and (
        q.pat is null
        or normalizar_texto(t.descricao) like q.pat
        or (e.nome is not null and normalizar_texto(e.nome) like q.pat)
        or (c.nome is not null and normalizar_texto(c.nome) like q.pat)
      )
      and (p_inicio is null or t.data_transacao >= p_inicio)
      and (p_fim is null or t.data_transacao <= p_fim)
  )
  select
    id, descricao, valor, data_transacao, local,
    (sum(valor) over ())::numeric as total_geral,
    (count(*) over ())::bigint as n_geral
  from base
  order by data_transacao desc
  limit p_limite;
$$;
