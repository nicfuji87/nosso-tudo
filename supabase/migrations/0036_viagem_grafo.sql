-- =====================================================================
-- 0036. NOSSA VIAGEM — GRAFO DE PROGRAMAS E TRANSFERÊNCIAS
-- ---------------------------------------------------------------------
-- Fase 0 do PLANO-VIAGENS.md. Duas tabelas GLOBAIS (não por workspace):
-- o catálogo de programas de milhas e as arestas de transferência entre
-- eles (Esfera → Avios Iberia → British, etc.).
--
-- POR QUE ISTO É TABELA E NÃO PROMPT: transferência de milhas é
-- irreversível. Um ratio alucinado pela LLM faz o usuário mover pontos
-- sem volta e perder dinheiro real. O caminho mais barato sai de busca
-- em grafo, em código (lib/viagens/caminho.ts); a Nia só EXPLICA o
-- resultado que o código produziu.
--
-- RLS deny-all (mesma postura de nia_config): só service_role lê/escreve.
-- Curadoria é do admin de plataforma, em /app/admin/viagens. Escolha
-- conservadora — é fácil relaxar depois, impossível "des-vazar" a curadoria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Programas (os nós do grafo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_programas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  nome              TEXT NOT NULL,
  -- 'aereo': programa de cia (Smiles, Aeroplan). 'banco': pontos de banco/cartão
  -- (Esfera, Livelo). 'coalizao': multi-parceiro. 'hotel': fora do v1, já previsto.
  tipo              TEXT NOT NULL CHECK (tipo IN ('aereo', 'banco', 'coalizao', 'hotel')),
  pais              TEXT,
  alianca           TEXT CHECK (alianca IN ('star', 'oneworld', 'skyteam')),
  -- Nome da fonte no seats.aero (ex.: 'smiles', 'aeroplan'). NULL = programa
  -- existe no grafo mas não é buscável lá (típico dos programas de banco).
  fonte_seats_aero  TEXT,
  -- Valor estimado de 1.000 milhas em centavos de BRL. É o que torna comparável
  -- gastar Smiles vs gastar Esfera — sem isso, ranquear caminhos de origens
  -- diferentes não faz sentido. NULL = desconhecido (o motor degrada para
  -- ranquear por milhas/saltos e avisa).
  valor_por_mil_cents INTEGER CHECK (valor_por_mil_cents IS NULL OR valor_por_mil_cents >= 0),
  observacoes       TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viagem_programas_ativo ON viagem_programas (ativo) WHERE ativo;

-- ---------------------------------------------------------------------
-- Transferências (as arestas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viagem_transferencias (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id             UUID NOT NULL REFERENCES viagem_programas(id) ON DELETE CASCADE,
  destino_id            UUID NOT NULL REFERENCES viagem_programas(id) ON DELETE CASCADE,

  -- Ratio como par de inteiros: ratio_origem milhas na origem viram
  -- ratio_destino no destino. 1000:800 fica literal, sem float traiçoeiro.
  ratio_origem          INTEGER NOT NULL CHECK (ratio_origem > 0),
  ratio_destino         INTEGER NOT NULL CHECK (ratio_destino > 0),

  -- Bônus promocional. É sazonal e MUDA TUDO (30% de bônus vira ou não vira
  -- a viabilidade de uma emissão), por isso tem validade própria: expirado,
  -- o motor ignora o bônus mas mantém a aresta.
  bonus_percent         NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (bonus_percent >= 0),
  bonus_valido_ate      DATE,

  minimo_transferencia  INTEGER NOT NULL DEFAULT 0 CHECK (minimo_transferencia >= 0),
  -- Transferência só em múltiplos de N (quase sempre 1.000). 1 = sem restrição.
  multiplo              INTEGER NOT NULL DEFAULT 1 CHECK (multiplo > 0),

  prazo_dias_min        INTEGER NOT NULL DEFAULT 0 CHECK (prazo_dias_min >= 0),
  prazo_dias_max        INTEGER NOT NULL DEFAULT 0 CHECK (prazo_dias_max >= 0),

  ativa                 BOOLEAN NOT NULL DEFAULT TRUE,
  -- Rastreabilidade da curadoria: de onde veio e quando foi conferido.
  -- O motor marca como "dado velho" o que passa de 90 dias (não esconde).
  fonte_url             TEXT,
  verificado_em         DATE,
  observacoes           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT viagem_transf_nao_reflexiva CHECK (origem_id <> destino_id),
  CONSTRAINT viagem_transf_prazo_coerente CHECK (prazo_dias_max >= prazo_dias_min),
  -- Um par origem→destino só pode existir uma vez: senão o motor enumera
  -- caminhos duplicados e a curadoria fica ambígua.
  CONSTRAINT viagem_transf_par_unico UNIQUE (origem_id, destino_id)
);

CREATE INDEX IF NOT EXISTS idx_viagem_transf_origem ON viagem_transferencias (origem_id) WHERE ativa;
CREATE INDEX IF NOT EXISTS idx_viagem_transf_destino ON viagem_transferencias (destino_id) WHERE ativa;

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION viagem_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_viagem_programas_updated ON viagem_programas;
CREATE TRIGGER trg_viagem_programas_updated
  BEFORE UPDATE ON viagem_programas
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();

DROP TRIGGER IF EXISTS trg_viagem_transferencias_updated ON viagem_transferencias;
CREATE TRIGGER trg_viagem_transferencias_updated
  BEFORE UPDATE ON viagem_transferencias
  FOR EACH ROW EXECUTE FUNCTION viagem_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS deny-all: nenhuma policy = ninguém passa, exceto service_role
-- (que bypassa RLS). Mesma postura de nia_config / integration_settings.
-- ---------------------------------------------------------------------
ALTER TABLE viagem_programas ENABLE ROW LEVEL SECURITY;
ALTER TABLE viagem_transferencias ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON viagem_programas FROM anon, authenticated;
REVOKE ALL ON viagem_transferencias FROM anon, authenticated;
