-- =====================================================================
-- 0039. NOSSA VIAGEM — ASSINATURAS QUE GERAM MILHAS
-- ---------------------------------------------------------------------
-- Descoberto ao ler os extratos reais do Nicolas (ago/2026): as milhas dele
-- não vêm de COMPRA avulsa, vêm de ASSINATURA recorrente —
--   · Clube Livelo Top 20.000 → 20.000/mês + 25.000/trimestre
--   · Clube LATAM Pass        → 11.500/mês
--   · ALL Signature Essential → 500 Reward/mês + 500/trimestre
--
-- Sem isto, cada linha "+20.000 Clube Livelo" do extrato entra com custo
-- desconhecido e a média fica errada para baixo. A assinatura é a REGRA DE
-- PREÇO: ela diz quanto custa o milheiro daquele programa, e o extrato diz
-- quando os pontos entraram.
--
-- Exemplo real: R$ 9.598,80/ano ÷ 340.000 pontos/ano = R$ 28,23 por mil.
-- Um crédito mensal de 20.000 nasce, então, custando R$ 564,64.
--
-- A divisão de responsabilidade é deliberada: assinatura = preço,
-- extrato = evento. Gerar lote por agendamento (como o cron de recorrências)
-- descolaria da realidade assim que o programa atrasasse um crédito.
-- =====================================================================

CREATE TABLE IF NOT EXISTS viagem_assinaturas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  programa_id         UUID NOT NULL REFERENCES viagem_programas(id) ON DELETE CASCADE,
  titular_id          UUID REFERENCES entidades(id) ON DELETE SET NULL,

  nome                TEXT NOT NULL,

  -- Tudo normalizado para o ANO. Plano mensal vira custo × 12; assim o
  -- custo por mil sai de uma divisão só, sem tratar cadência em todo lugar.
  custo_anual_cents   BIGINT NOT NULL CHECK (custo_anual_cents >= 0),
  pontos_ano          BIGINT NOT NULL CHECK (pontos_ano > 0),

  -- Coluna gerada: a regra de preço em si. Fica no banco (e não só no app)
  -- para qualquer leitor — inclusive uma query manual — ver o mesmo número.
  custo_por_mil_cents BIGINT GENERATED ALWAYS AS (
                        ROUND(custo_anual_cents::NUMERIC / pontos_ano * 1000)
                      ) STORED,

  -- Como a linha do extrato se identifica (ex.: 'Clube Livelo'). É o que
  -- permite precificar a importação sozinho, sem perguntar linha a linha.
  padrao_extrato      TEXT,

  inicio              DATE NOT NULL,
  fim                 DATE,
  ativa               BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT viagem_assin_periodo_coerente CHECK (fim IS NULL OR fim >= inicio)
);

CREATE INDEX IF NOT EXISTS idx_viagem_assinaturas_ws
  ON viagem_assinaturas (workspace_id, programa_id) WHERE ativa;

DROP TRIGGER IF EXISTS trg_viagem_assinaturas_updated ON viagem_assinaturas;
CREATE TRIGGER trg_viagem_assinaturas_updated
  BEFORE UPDATE ON viagem_assinaturas
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();

-- Liga o lote à assinatura que o precificou: dá para auditar de onde saiu
-- o custo de cada milha, e recalcular se o preço da assinatura mudar.
ALTER TABLE viagem_lotes
  ADD COLUMN IF NOT EXISTS assinatura_id UUID REFERENCES viagem_assinaturas(id) ON DELETE SET NULL;

ALTER TABLE viagem_assinaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ws ON viagem_assinaturas;
CREATE POLICY p_ws ON viagem_assinaturas
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));
