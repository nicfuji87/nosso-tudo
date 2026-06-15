-- =====================================================================
-- NOSSO TUDO — 0004: área admin + storage seguro de configuração de integrações
-- Fundação para Asaas (Edge Functions) e WhatsApp/uazapi (orquestrado no n8n).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PLATFORM ADMINS — quem pode editar segredos GLOBAIS de plataforma
--    (chave-mestra Asaas, token uazapi, secret do n8n). Owners de workspace
--    enxergam a área admin; segredos de plataforma ficam gated aqui.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_admins (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- O usuário pode ler apenas o próprio registro (para a UI saber se é admin).
-- Escrita: somente service_role (sem policy de INSERT/UPDATE/DELETE).
DROP POLICY IF EXISTS p_pa_self ON platform_admins;
CREATE POLICY p_pa_self ON platform_admins FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE profile_id = auth.uid());
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- Bootstrap auto-curável: ao criar o profile do fundador, promove a admin.
CREATE OR REPLACE FUNCTION promote_founder_admin() RETURNS TRIGGER AS $$
BEGIN
  IF lower(NEW.email) = 'fujimoto.nicolas@gmail.com' THEN
    INSERT INTO platform_admins (profile_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tg_promote_founder ON profiles;
CREATE TRIGGER tg_promote_founder AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION promote_founder_admin();

-- Seed imediato caso o profile já exista hoje.
INSERT INTO platform_admins (profile_id)
SELECT id FROM profiles WHERE lower(email) = 'fujimoto.nicolas@gmail.com'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. INTEGRATION_SETTINGS — config global por integração ('asaas','whatsapp')
--    valor: não-sensível (ambiente, urls, flags) · secrets: sensível (api keys)
--    RLS habilitado SEM policies => deny-all p/ anon/authenticated.
--    Acesso só via service_role (server actions admin + Edge Functions).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_settings (
  key        TEXT PRIMARY KEY,
  valor      JSONB NOT NULL DEFAULT '{}'::jsonb,
  secrets    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
-- (intencionalmente sem policies: nenhum acesso para authenticated/anon)

-- Linhas iniciais vazias para as duas integrações previstas.
INSERT INTO integration_settings (key, valor) VALUES
  ('asaas',    '{"environment":"sandbox"}'::jsonb),
  ('whatsapp', '{"provider":"uazapi"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. WHATSAPP ROUTING — resolução telefone -> workspace (usada pela Edge
--    Function ingest-whatsapp via service_role; helper conveniente e seguro).
--    Normaliza para apenas dígitos antes de comparar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION so_digitos(p TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g');
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION resolve_whatsapp(p_telefone TEXT)
RETURNS TABLE(workspace_id UUID, profile_id UUID, verificado BOOLEAN) AS $$
  SELECT wr.workspace_id, wr.profile_id, wr.verificado
  FROM whatsapp_routing wr
  WHERE so_digitos(wr.telefone) = so_digitos(p_telefone)
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- 4. Endurecimento de EXECUTE: funções acima só fazem sentido via service_role
--    (Edge Function) ou trigger interno. Evita enumeração telefone->workspace.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.resolve_whatsapp(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_founder_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.so_digitos(text) FROM anon, authenticated;
