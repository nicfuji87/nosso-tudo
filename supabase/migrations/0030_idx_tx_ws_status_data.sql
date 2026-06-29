-- Índice do caminho mais quente: agregações e listas filtram
-- workspace + status='confirmado' + janela de data (resumo_mes,
-- gastos_por_*, drilldowns). O índice existente idx_tx_ws_data (ws, data)
-- cobre ws+data, mas deixa o filtro de status para o heap; com muitas linhas
-- 'sugerido' (recorrências pendentes) isso desperdiça leituras. Este composto
-- (equality ws+status, range data DESC) serve direto as confirmadas por período
-- e complementa — não substitui — o idx_tx_ws_data (usado quando não há filtro
-- de status, ex.: paginação da lista de Transações).
create index if not exists idx_tx_ws_status_data
  on public.transacoes (workspace_id, status_revisao, data_transacao desc);
