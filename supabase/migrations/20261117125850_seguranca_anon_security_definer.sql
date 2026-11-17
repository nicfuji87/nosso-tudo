-- Higiene de segurança (alerta do linter 0028): funções SECURITY DEFINER executáveis por `anon`.
-- Todas conferem participação no workspace, então anon já não recebia dados; aqui tiramos o acesso
-- de vez. Usuários logados (authenticated) e a chave de serviço continuam podendo executar.
-- Ficam de fora user_workspaces() e is_platform_admin(): são usadas dentro de políticas RLS,
-- que também são avaliadas para visitantes.
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'audit_transacoes', 'comparativo_slugs', 'compras_pequenas_periodo', 'confirmar_match', 'consultar_item',
        'consultar_transacoes', 'desvincular_conta_fixa', 'dinheiro_sem_dono', 'gastos_por_categoria',
        'gastos_por_categoria_periodo', 'gastos_por_categoria_v2', 'gastos_por_contexto', 'gastos_por_essencialidade',
        'gastos_por_essencialidade_periodo', 'gastos_por_fornecedor', 'gastos_por_pessoa', 'gastos_por_slugs_periodo',
        'gastos_por_subcategoria_periodo', 'handle_new_user', 'handle_user_email_change', 'meses_com_dados',
        'parcelas_duplicadas', 'provisionar_workspace', 'resumo_mes', 'resumo_periodo', 'sync_categorias_canonicas',
        'total_categoria_mes', 'total_pessoa_mes', 'trg_conciliar_conta_fixa')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;
