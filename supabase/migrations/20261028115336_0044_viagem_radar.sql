-- =====================================================================
-- Viagens: radar de rotas + promoções do dia + rotina diária.
--
-- Radar: rotas que a família define (origens → destinos, janela de datas,
-- duração, pessoas). Toda madrugada o app busca no seats.aero (milhas) e no
-- SerpApi/Google Flights (dinheiro) e grava o melhor achado do dia — vira
-- histórico de preço por rota.
--
-- Promoções: origens fixas por workspace. A rotina varre grupos de destinos e
-- marca como promoção o que está bem abaixo do preço normal daquela rota
-- (mediana do próprio histórico, que este app passa a guardar).
--
-- Disparo: pg_cron → pg_net → POST {app_url}/api/viagens/cron com segredo do
-- Vault (mesmo padrão do ml_cron_tick).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Config por workspace
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_radar_config (
  workspace_id          UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  origens_promo         TEXT[] NOT NULL DEFAULT '{}',          -- IATA fixas
  cabines_promo         TEXT[] NOT NULL DEFAULT '{economy}',
  programas             TEXT[] NOT NULL DEFAULT '{}',          -- fontes seats.aero aceitas; vazio = todas
  pessoas_promo         INT NOT NULL DEFAULT 1 CHECK (pessoas_promo BETWEEN 1 AND 9),
  desconto_minimo_pct   INT NOT NULL DEFAULT 25 CHECK (desconto_minimo_pct BETWEEN 0 AND 90),
  aviso_whatsapp        BOOLEAN NOT NULL DEFAULT true,
  dinheiro_promo        BOOLEAN NOT NULL DEFAULT true,         -- Google Travel Explore por origem
  serpapi_mensal_max    INT NOT NULL DEFAULT 240 CHECK (serpapi_mensal_max BETWEEN 0 AND 100000),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Rotas do radar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_radar_rotas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 80),
  origens               TEXT[] NOT NULL CHECK (cardinality(origens) BETWEEN 1 AND 10),
  destinos              TEXT[] NOT NULL CHECK (cardinality(destinos) BETWEEN 1 AND 40),
  data_inicio           DATE NOT NULL,
  data_fim              DATE NOT NULL,
  duracao_min           INT CHECK (duracao_min IS NULL OR duracao_min BETWEEN 1 AND 90),
  duracao_max           INT CHECK (duracao_max IS NULL OR duracao_max BETWEEN 1 AND 90),
  pessoas               INT NOT NULL DEFAULT 1 CHECK (pessoas BETWEEN 1 AND 9),
  cabine                TEXT NOT NULL DEFAULT 'economy'
                        CHECK (cabine IN ('economy','premium','business','first')),
  programas             TEXT[] NOT NULL DEFAULT '{}',          -- vazio = todos
  apenas_direto         BOOLEAN NOT NULL DEFAULT false,
  incluir_dinheiro      BOOLEAN NOT NULL DEFAULT true,
  alerta_milhas_pp      INT CHECK (alerta_milhas_pp IS NULL OR alerta_milhas_pp > 0),
  alerta_reais_pp_cents BIGINT CHECK (alerta_reais_pp_cents IS NULL OR alerta_reais_pp_cents > 0),
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  ultima_execucao       TIMESTAMPTZ,
  ultimo_erro           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio),
  CHECK (duracao_min IS NULL OR duracao_max IS NULL OR duracao_max >= duracao_min)
);
CREATE INDEX IF NOT EXISTS idx_viagem_radar_rotas_ws ON viagem_radar_rotas (workspace_id, ativo);

DROP TRIGGER IF EXISTS trg_viagem_radar_rotas_touch ON viagem_radar_rotas;
CREATE TRIGGER trg_viagem_radar_rotas_touch BEFORE UPDATE ON viagem_radar_rotas
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();
DROP TRIGGER IF EXISTS trg_viagem_radar_config_touch ON viagem_radar_config;
CREATE TRIGGER trg_viagem_radar_config_touch BEFORE UPDATE ON viagem_radar_config
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();

-- ---------------------------------------------------------------------
-- Snapshot diário por rota: o melhor achado do dia (milhas e/ou dinheiro).
-- Valores em centavos de REAL, por pessoa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_radar_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rota_id               UUID NOT NULL REFERENCES viagem_radar_rotas(id) ON DELETE CASCADE,
  data_ref              DATE NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('milhas','dinheiro')),
  milhas_pp             INT,
  taxas_pp_cents        BIGINT,
  custo_pp_cents        BIGINT,                 -- milhas → R$ (custo por mil) + taxas; ou preço em dinheiro
  programas             TEXT[] NOT NULL DEFAULT '{}',
  melhor                JSONB NOT NULL,
  alternativas          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rota_id, data_ref, tipo)
);
CREATE INDEX IF NOT EXISTS idx_viagem_radar_snap_rota ON viagem_radar_snapshots (rota_id, data_ref DESC);

-- ---------------------------------------------------------------------
-- Promoções do dia por workspace
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_promocoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data_ref              DATE NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('milhas','dinheiro')),
  origem                TEXT NOT NULL,
  destino               TEXT NOT NULL,
  destino_nome          TEXT,
  regiao                TEXT,
  programa              TEXT NOT NULL DEFAULT '',          -- '' para dinheiro
  cabine                TEXT NOT NULL DEFAULT 'economy',
  data_voo              DATE,
  milhas                INT,
  taxas_cents           BIGINT,                           -- R$
  preco_cents           BIGINT,                           -- R$ (dinheiro)
  custo_cents           BIGINT,                           -- R$ equivalente, por pessoa
  referencia_cents      BIGINT,                           -- "preço normal" usado na comparação
  referencia_fonte      TEXT,                             -- 'historico' | 'mercado_hoje'
  desconto_pct          NUMERIC(5,1),
  assentos              INT,
  direto                BOOLEAN,
  companhias            TEXT,
  score                 NUMERIC(7,2) NOT NULL DEFAULT 0,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  notificado_em         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, data_ref, tipo, origem, destino, programa, cabine)
);
CREATE INDEX IF NOT EXISTS idx_viagem_promocoes_ws_dia ON viagem_promocoes (workspace_id, data_ref DESC, score DESC);

-- ---------------------------------------------------------------------
-- Histórico global de preço mínimo (dado de mercado, sem workspace).
-- Base da comparação "isso está barato?". Milhas por programa; dinheiro com
-- programa = 'dinheiro' e preco_min_cents em R$.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_precos_historico (
  data_ref              DATE NOT NULL,
  origem                TEXT NOT NULL,
  destino               TEXT NOT NULL,
  programa              TEXT NOT NULL,
  cabine                TEXT NOT NULL,
  mes_voo               DATE NOT NULL,                    -- 1º dia do mês do voo
  milhas_min            INT,
  taxas_min_cents       BIGINT,                           -- moeda da fonte (USD no seats.aero)
  preco_min_cents       BIGINT,                           -- R$ (dinheiro)
  n                     INT NOT NULL DEFAULT 1,
  PRIMARY KEY (data_ref, origem, destino, programa, cabine, mes_voo)
);
CREATE INDEX IF NOT EXISTS idx_viagem_hist_chave
  ON viagem_precos_historico (origem, destino, programa, cabine, mes_voo, data_ref DESC);

-- ---------------------------------------------------------------------
-- Uso de cota por fonte e dia + log de execuções da rotina.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_api_uso (
  dia                   DATE NOT NULL,
  fonte                 TEXT NOT NULL CHECK (fonte IN ('seats_aero','serpapi')),
  chamadas              INT NOT NULL DEFAULT 0,
  restante_informado    INT,                              -- header X-RateLimit-Remaining
  PRIMARY KEY (dia, fonte)
);

CREATE TABLE IF NOT EXISTS viagem_cron_execucoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem                TEXT NOT NULL DEFAULT 'pg_cron',  -- pg_cron | manual
  workspace_id          UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  iniciado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_em          TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando','ok','parcial','erro')),
  resumo                JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_viagem_cron_exec ON viagem_cron_execucoes (iniciado_em DESC);

-- Incremento atômico de uso (chamado pelo app via service_role).
CREATE OR REPLACE FUNCTION viagem_registrar_uso(p_fonte TEXT, p_chamadas INT, p_restante INT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO viagem_api_uso (dia, fonte, chamadas, restante_informado)
  VALUES ((now() AT TIME ZONE 'UTC')::date, p_fonte, p_chamadas, p_restante)
  ON CONFLICT (dia, fonte) DO UPDATE
    SET chamadas = viagem_api_uso.chamadas + EXCLUDED.chamadas,
        restante_informado = COALESCE(EXCLUDED.restante_informado, viagem_api_uso.restante_informado);
$$;

-- ---------------------------------------------------------------------
-- RLS
--   Config, rotas, snapshots e promoções: escopo de workspace (p_ws).
--   Histórico, uso e execuções: deny-all (só service_role).
-- ---------------------------------------------------------------------
ALTER TABLE viagem_radar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_radar_rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_radar_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_precos_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_api_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_cron_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ws ON viagem_radar_config;
CREATE POLICY p_ws ON viagem_radar_config
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws ON viagem_radar_rotas;
CREATE POLICY p_ws ON viagem_radar_rotas
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws ON viagem_radar_snapshots;
CREATE POLICY p_ws ON viagem_radar_snapshots
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws ON viagem_promocoes;
CREATE POLICY p_ws ON viagem_promocoes
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

REVOKE ALL ON viagem_precos_historico FROM anon, authenticated;
REVOKE ALL ON viagem_api_uso FROM anon, authenticated;
REVOKE ALL ON viagem_cron_execucoes FROM anon, authenticated;
REVOKE ALL ON FUNCTION viagem_registrar_uso(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION viagem_registrar_uso(TEXT, INT, INT) TO service_role;

-- ---------------------------------------------------------------------
-- Segredos do módulo no Vault (prefixo 'viagens/'): segredo da rotina e a
-- chave do SerpApi (cadastrada pela tela). Só service_role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION viagem_secret_get(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = p_name AND left(p_name, 8) = 'viagens/';
$$;

CREATE OR REPLACE FUNCTION viagem_secret_set(p_name TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_name IS NULL OR left(p_name, 8) <> 'viagens/' THEN
    RAISE EXCEPTION 'nome de segredo inválido';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF p_value IS NULL OR p_value = '' THEN
    IF v_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_id; END IF;
    RETURN;
  END IF;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name);
  ELSE
    PERFORM vault.update_secret(v_id, p_value);
  END IF;
END $$;

REVOKE ALL ON FUNCTION viagem_secret_get(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION viagem_secret_set(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION viagem_secret_get(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION viagem_secret_set(TEXT, TEXT) TO service_role;

-- Segredo da rotina, gerado pelo próprio banco (nunca sai daqui em claro).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'viagens/cron/secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'viagens/cron/secret',
      'Autentica o pg_cron na rota /api/viagens/cron');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Disparo diário: pg_cron → pg_net. Reusa o app_url do ml_settings (mesmo app).
-- Batidas a cada 5 min entre 09:00 e 10:55 UTC (06:00–07:55 em Brasília).
-- Cada batida processa só o que ainda está pendente no dia, com orçamento de
-- tempo curto — idempotente, então batidas extras não gastam cota.
-- Se a rota ainda não existir no ar (antes do merge), o POST só dá 404.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION viagem_cron_disparar()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT value->>'app_url' INTO v_url FROM ml_settings WHERE key = 'runtime';
  IF v_url IS NULL OR v_url = '' THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'viagens/cron/secret';
  IF v_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := rtrim(v_url, '/') || '/api/viagens/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-viagens-cron-secret', v_secret),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 5000
  );
END $$;

REVOKE ALL ON FUNCTION viagem_cron_disparar() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'viagens-diario') THEN
    PERFORM cron.unschedule('viagens-diario');
  END IF;
  PERFORM cron.schedule('viagens-diario', '*/5 9-10 * * *', 'select public.viagem_cron_disparar();');
END $$;
