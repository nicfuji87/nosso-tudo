-- Consulta precisa de um ITEM comprado (quando, quanto, quantas vezes, total),
-- agregando no banco — a Nia não soma "de cabeça". Casa por PALAVRA INTEIRA no
-- texto normalizado (e no nome do produto vinculado), então "sal" pega "com sal"
-- mas NÃO "salada"/"salgada" — precisão sem falso-positivo de substring.
-- normalizar_texto remove acentos/pontuação, então o termo nunca traz metachar
-- de regex (só [a-z0-9 ]). Janela opcional [p_inicio, p_fim].
create or replace function consultar_item(
  p_workspace_id uuid,
  p_termo text,
  p_inicio date default null,
  p_fim date default null
)
returns table(
  n_compras bigint,
  total numeric,
  qtd_total numeric,
  ultima_data date,
  ultimo_valor numeric,
  ultimo_local text,
  primeira_data date,
  preco_medio numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with alvo as (select ('\m' || normalizar_texto(p_termo) || '\M') as rx),
  itens as (
    select it.valor_total, it.quantidade, t.data_transacao, e.nome as local
    from itens_transacao it
    join transacoes t on t.id = it.transacao_id
    left join estabelecimentos e on e.id = t.estabelecimento_id
    left join produtos p on p.id = it.produto_id
    cross join alvo
    where it.workspace_id = p_workspace_id
      and p_workspace_id in (select user_workspaces())
      and t.status_revisao = 'confirmado'
      and (
        normalizar_texto(it.descricao_original) ~ alvo.rx
        or (p.nome is not null and normalizar_texto(p.nome) ~ alvo.rx)
      )
      and (p_inicio is null or t.data_transacao >= p_inicio)
      and (p_fim is null or t.data_transacao <= p_fim)
  )
  select
    count(*)::bigint,
    coalesce(sum(valor_total), 0)::numeric,
    coalesce(sum(quantidade), 0)::numeric,
    max(data_transacao),
    (array_agg(valor_total order by data_transacao desc nulls last))[1],
    (array_agg(local order by data_transacao desc nulls last))[1],
    min(data_transacao),
    round(avg(valor_total) filter (where valor_total is not null), 2)
  from itens;
$$;
