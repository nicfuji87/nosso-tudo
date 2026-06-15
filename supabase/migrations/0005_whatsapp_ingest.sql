-- Idempotência da ingestão WhatsApp (n8n pode reenviar). Deny-all: só service_role.
CREATE TABLE IF NOT EXISTS whatsapp_ingest_log (
  idempotency_key TEXT PRIMARY KEY,
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  transacao_id    UUID REFERENCES transacoes(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE whatsapp_ingest_log ENABLE ROW LEVEL SECURITY;

-- Correção do hardening: o REVOKE anterior (anon/authenticated) era inócuo pois o
-- grant PUBLIC permanecia. Revoga de PUBLIC e concede explicitamente a service_role.
REVOKE EXECUTE ON FUNCTION public.resolve_whatsapp(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_whatsapp(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.so_digitos(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.so_digitos(text) TO service_role, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_founder_admin() FROM PUBLIC;
