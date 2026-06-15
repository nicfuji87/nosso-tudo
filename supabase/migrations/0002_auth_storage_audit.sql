-- =====================================================================
-- NOSSO TUDO — 0002: trigger de profile no signup, storage e auditoria
-- Complementa o 0001 com o que o app precisa mas não estava no schema base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Criação automática de profile ao registrar usuário (RF-001)
--    Lê nome do metadata do signup (options.data.nome) com fallback.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Mantém email do profile em sincronia se o usuário trocar (RF-113)
CREATE OR REPLACE FUNCTION handle_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_email_change();

-- ---------------------------------------------------------------------
-- 2. Storage buckets (PRD §9.3, SR-013)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('notas-fiscais', 'notas-fiscais', FALSE, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('faturas-pdf', 'faturas-pdf', FALSE, 10485760,
   ARRAY['application/pdf']),
  ('avatars', 'avatars', TRUE, 2097152,
   ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Helper: primeiro segmento do path = workspace_id (ex.: '<ws>/arquivo.pdf')
-- Buckets privados: acesso só a membros do workspace dono do arquivo.
CREATE POLICY "notas-fiscais membros leem"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

CREATE POLICY "notas-fiscais membros enviam"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

CREATE POLICY "faturas-pdf membros leem"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'faturas-pdf'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

CREATE POLICY "faturas-pdf membros enviam"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'faturas-pdf'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

-- Avatars: leitura pública, escrita só do próprio usuário (path = '<uid>/...')
CREATE POLICY "avatars leitura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars dono envia"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars dono atualiza"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 3. Auditoria de transações (RF-053, SR-050) — antes/depois
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_transacoes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_log (workspace_id, tabela, registro_id, acao, alterado_por, dados_antes)
    VALUES (OLD.workspace_id, 'transacoes', OLD.id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_log (workspace_id, tabela, registro_id, acao, alterado_por, dados_antes, dados_depois)
    VALUES (NEW.workspace_id, 'transacoes', NEW.id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_log (workspace_id, tabela, registro_id, acao, alterado_por, dados_depois)
    VALUES (NEW.workspace_id, 'transacoes', NEW.id, 'insert', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tg_audit_transacoes ON transacoes;
CREATE TRIGGER tg_audit_transacoes
  AFTER INSERT OR UPDATE OR DELETE ON transacoes
  FOR EACH ROW EXECUTE FUNCTION audit_transacoes();

-- ---------------------------------------------------------------------
-- 4. RPC: resumo financeiro do mês (Home) — agrega no servidor (perf)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resumo_mes(
  p_workspace_id UUID,
  p_mes DATE DEFAULT date_trunc('month', now())::date
) RETURNS TABLE(
  receitas NUMERIC,
  despesas NUMERIC,
  saldo NUMERIC,
  total_transacoes BIGINT
) AS $$
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'receita'), 0) AS receitas,
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'despesa'), 0) AS despesas,
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'receita'), 0)
      - COALESCE(SUM(valor) FILTER (WHERE tipo = 'despesa'), 0) AS saldo,
    COUNT(*) AS total_transacoes
  FROM transacoes
  WHERE workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT user_workspaces())
    AND data_transacao >= p_mes
    AND data_transacao < (p_mes + INTERVAL '1 month');
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- 5. RPC: gastos por categoria no mês (donut da Home)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gastos_por_categoria(
  p_workspace_id UUID,
  p_mes DATE DEFAULT date_trunc('month', now())::date
) RETURNS TABLE(
  categoria_id UUID,
  categoria_nome TEXT,
  cor TEXT,
  icone TEXT,
  total NUMERIC
) AS $$
  SELECT
    c.id, c.nome, c.cor, c.icone,
    COALESCE(SUM(t.valor), 0) AS total
  FROM transacoes t
  JOIN categorias c ON c.id = t.categoria_id
  WHERE t.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT user_workspaces())
    AND t.tipo = 'despesa'
    AND t.data_transacao >= p_mes
    AND t.data_transacao < (p_mes + INTERVAL '1 month')
  GROUP BY c.id, c.nome, c.cor, c.icone
  HAVING COALESCE(SUM(t.valor), 0) > 0
  ORDER BY total DESC;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
