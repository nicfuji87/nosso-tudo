-- =====================================================================
-- 0038. NOSSA VIAGEM — CARTEIRA DE MILHAS COM CUSTO DE AQUISIÇÃO
-- ---------------------------------------------------------------------
-- Corrige uma decisão errada da 0036: `viagem_programas.valor_por_mil_cents`
-- é uma estimativa GLOBAL de mercado ("Livelo vale R$22/mil"). Isso é chute.
--
-- O número que importa é O QUE VOCÊ PAGOU — e ele não é um por programa, é
-- um por LOTE de aquisição. 100k Livelo comprados em promoção por R$2.000
-- custaram R$20/mil; 30k acumulados por gasto no cartão custaram ~zero. A
-- média ponderada dos lotes restantes é o custo real da sua milha.
--
-- E o custo ATRAVESSA a transferência: 48k Livelo que custaram R$1.056,
-- transferidos com 100% de bônus, viram 96k Smiles a R$11/mil. É esse número
-- que responde "vale emitir ou pagar em dinheiro?".
--
-- `valor_por_mil_cents` no programa vira apenas FALLBACK, para simular
-- programa onde a família não tem milha nenhuma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extratos importados: rastreabilidade + reconciliação
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_extratos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  programa_id       UUID REFERENCES viagem_programas(id) ON DELETE SET NULL,
  titular_id        UUID REFERENCES entidades(id) ON DELETE SET NULL,

  -- Mídia original (PDF/print) que a Nia leu. Reusa a tabela de anexos.
  midia_id          UUID REFERENCES midias(id) ON DELETE SET NULL,

  periodo_inicio    DATE,
  periodo_fim       DATE,

  -- Saldo que o PRÓPRIO extrato declara. Serve para conferir contra a soma
  -- dos lotes: se divergir, avisamos em vez de discordar em silêncio.
  saldo_declarado   BIGINT,

  observacoes       TEXT,
  importado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por     UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_viagem_extratos_ws ON viagem_extratos (workspace_id, importado_em DESC);

-- ---------------------------------------------------------------------
-- Lotes de aquisição — o coração do custo real
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_lotes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  programa_id         UUID NOT NULL REFERENCES viagem_programas(id) ON DELETE CASCADE,
  -- Programa de milhas é por CPF: saber de quem é a conta importa para
  -- transferência entre titulares (que costuma ter regra própria).
  titular_id          UUID REFERENCES entidades(id) ON DELETE SET NULL,

  quantidade          BIGINT NOT NULL CHECK (quantidade > 0),
  -- Consumo é FIFO: o lote mais velho sai primeiro (e é o que vence antes).
  quantidade_restante BIGINT NOT NULL CHECK (quantidade_restante >= 0),

  -- Custo da quantidade ORIGINAL. O custo do que resta é proporcional:
  -- custo_cents * quantidade_restante / quantidade.
  custo_cents         BIGINT NOT NULL DEFAULT 0 CHECK (custo_cents >= 0),

  origem              TEXT NOT NULL CHECK (origem IN (
                        'compra',        -- comprou pontos
                        'transferencia', -- veio de outro programa (custo herdado)
                        'bonus',         -- crédito promocional avulso
                        'acumulo',       -- gasto no cartão, voo, parceiro
                        'promocao',      -- campanha
                        'ajuste',        -- correção manual
                        'estorno'        -- devolução
                      )),
  -- Quando origem = 'transferencia', de qual lote veio. Preserva a corrente
  -- de custo: um lote de destino por lote de origem consumido (1:1), o que
  -- mantém a base de custo exata em vez de achatar numa média.
  lote_origem_id      UUID REFERENCES viagem_lotes(id) ON DELETE SET NULL,

  data                DATE NOT NULL,
  -- Milha vence. E vencer milha CARA dói mais que vencer milha barata —
  -- por isso a validade mora no lote, junto do custo dele.
  expira_em           DATE,

  descricao           TEXT,
  extrato_id          UUID REFERENCES viagem_extratos(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT viagem_lote_restante_coerente CHECK (quantidade_restante <= quantidade)
);

CREATE INDEX IF NOT EXISTS idx_viagem_lotes_carteira
  ON viagem_lotes (workspace_id, programa_id, data)
  WHERE quantidade_restante > 0;

CREATE INDEX IF NOT EXISTS idx_viagem_lotes_expiracao
  ON viagem_lotes (workspace_id, expira_em)
  WHERE quantidade_restante > 0 AND expira_em IS NOT NULL;

DROP TRIGGER IF EXISTS trg_viagem_lotes_updated ON viagem_lotes;
CREATE TRIGGER trg_viagem_lotes_updated
  BEFORE UPDATE ON viagem_lotes
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();

-- ---------------------------------------------------------------------
-- Carteira consolidada: saldo + custo médio real por programa
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_viagem_carteira AS
SELECT
  l.workspace_id,
  l.programa_id,
  p.slug                AS programa_slug,
  p.nome                AS programa_nome,
  SUM(l.quantidade_restante)::BIGINT AS saldo,
  -- Custo do que AINDA resta (proporcional ao consumido).
  SUM(l.custo_cents::NUMERIC * l.quantidade_restante / l.quantidade)::BIGINT AS custo_restante_cents,
  -- Custo médio por mil milhas. NULL quando não há saldo (evita divisão por zero).
  CASE WHEN SUM(l.quantidade_restante) > 0
    THEN ROUND(
      SUM(l.custo_cents::NUMERIC * l.quantidade_restante / l.quantidade)
      / SUM(l.quantidade_restante) * 1000
    )::BIGINT
    ELSE NULL
  END AS custo_por_mil_cents,
  COUNT(*) FILTER (WHERE l.quantidade_restante > 0)::INT AS lotes_ativos,
  MIN(l.expira_em) FILTER (WHERE l.quantidade_restante > 0) AS proxima_expiracao
FROM viagem_lotes l
JOIN viagem_programas p ON p.id = l.programa_id
WHERE l.quantidade_restante > 0
GROUP BY l.workspace_id, l.programa_id, p.slug, p.nome;

-- ---------------------------------------------------------------------
-- RLS: escopo de workspace, mesmo padrão de `entidades` (policy p_ws).
-- ---------------------------------------------------------------------
ALTER TABLE viagem_extratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ws ON viagem_extratos;
CREATE POLICY p_ws ON viagem_extratos
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS p_ws ON viagem_lotes;
CREATE POLICY p_ws ON viagem_lotes
  USING (workspace_id IN (SELECT user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT user_workspaces()));

-- A view herda o RLS das tabelas base (security_invoker).
ALTER VIEW v_viagem_carteira SET (security_invoker = true);
