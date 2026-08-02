-- =====================================================================
-- 0037. NOSSA VIAGEM — SEED INICIAL DO GRAFO
-- ---------------------------------------------------------------------
-- ⚠️  LEIA ANTES DE CONFIAR NESTES DADOS  ⚠️
--
-- Este seed é ANDAIME, não verdade. Ratios de transferência e bônus mudam
-- o tempo todo, e transferir milhas é IRREVERSÍVEL: um ratio errado aqui
-- vira dinheiro perdido do usuário.
--
-- Por isso quase toda aresta entra com `verificado_em = NULL`, que o motor
-- (lib/viagens/caminho.ts) trata como NÃO VERIFICADA e sinaliza em todo
-- caminho que a use. O admin confirma cada uma em /app/admin/viagens,
-- colando a fonte, antes que o caminho valha alguma coisa.
--
-- Exceção: o pool Avios (Iberia ↔ British ↔ Qatar ↔ Aer Lingus, 1:1) é
-- fato estrutural estável do programa, não promoção — entra verificado.
--
-- `valor_por_mil_cents` são estimativas de mercado BR para dar ao motor
-- uma base de comparação entre origens diferentes. Ajuste no admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nós: programas
-- ---------------------------------------------------------------------
INSERT INTO viagem_programas (slug, nome, tipo, pais, alianca, fonte_seats_aero, valor_por_mil_cents, observacoes)
VALUES
  -- Bancos / coalizões brasileiras (origem da maioria dos caminhos)
  ('livelo',      'Livelo',              'coalizao', 'BR', NULL,      NULL, 2200,
   'Coalizão Bradesco/BB. Bônus de transferência frequentes (80–100%+) — é neles que mora a economia.'),
  ('esfera',      'Esfera',              'coalizao', 'BR', NULL,      NULL, 2200,
   'Coalizão Santander. Mesma lógica de bônus sazonal da Livelo.'),
  ('itau',        'Itaú Sempre Presente','banco',    'BR', NULL,      NULL, 2500,
   'Pontos Itaú. Transferências variam bastante por produto de cartão.'),

  -- Programas aéreos brasileiros
  ('smiles',      'Smiles (GOL)',        'aereo',    'BR', NULL,      'smiles',    2000,
   'Buscável no seats.aero como `smiles`.'),
  ('latam-pass',  'LATAM Pass',          'aereo',    'BR', 'oneworld', NULL,       2300,
   'Não é fonte do seats.aero. Disponibilidade LATAM aparece via parceiros oneworld.'),
  ('azul',        'TudoAzul',            'aereo',    'BR', NULL,      NULL,        2000, NULL),

  -- Avios: quatro programas, um pool. É o coração dos caminhos para a Europa.
  ('avios-iberia',  'Iberia Plus (Avios)',           'aereo', 'ES', 'oneworld', 'iberia',    NULL,
   'Avios são poolados entre Iberia, British, Qatar e Aer Lingus (Combine my Avios).'),
  ('avios-british', 'British Airways Club (Avios)',  'aereo', 'GB', 'oneworld', 'british',   NULL,
   'Emite Finnair, Qatar, Iberia e demais oneworld.'),
  ('avios-qatar',   'Qatar Privilege Club (Avios)',  'aereo', 'QA', 'oneworld', 'qatar',     NULL, NULL),
  ('avios-aer',     'Aer Lingus AerClub (Avios)',    'aereo', 'IE', 'oneworld', 'aerlingus', NULL, NULL),

  -- Demais programas relevantes para emissão a partir do Brasil
  ('aeroplan',    'Aeroplan (Air Canada)', 'aereo', 'CA', 'star',    'aeroplan',   NULL,
   'Tabela por distância, sem taxa de combustível — costuma ser o melhor custo-benefício Star.'),
  ('flyingblue',  'Flying Blue (AF/KLM)',  'aereo', 'FR', 'skyteam', 'flyingblue', NULL, NULL),
  ('united',      'United MileagePlus',    'aereo', 'US', 'star',    'united',     NULL, NULL),
  ('virginatl',   'Virgin Atlantic Flying Club', 'aereo', 'GB', NULL, 'virginatlantic', NULL, NULL),
  ('aa',          'American AAdvantage',   'aereo', 'US', 'oneworld', 'american',  NULL, NULL),
  ('alaska',      'Alaska Mileage Plan',   'aereo', 'US', 'oneworld', 'alaska',    NULL, NULL),
  ('emirates',    'Emirates Skywards',     'aereo', 'AE', NULL,      'emirates',   NULL, NULL),
  ('etihad',      'Etihad Guest',          'aereo', 'AE', NULL,      'etihad',     NULL, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- Arestas: transferências
-- ---------------------------------------------------------------------
-- Helper: insere por slug, sem quebrar se a aresta já existir.
CREATE OR REPLACE FUNCTION viagem_seed_aresta(
  p_origem TEXT, p_destino TEXT,
  p_ratio_origem INT, p_ratio_destino INT,
  p_minimo INT DEFAULT 1000, p_multiplo INT DEFAULT 1000,
  p_prazo_min INT DEFAULT 0, p_prazo_max INT DEFAULT 2,
  p_verificado DATE DEFAULT NULL, p_fonte TEXT DEFAULT NULL,
  p_obs TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE v_o UUID; v_d UUID;
BEGIN
  SELECT id INTO v_o FROM viagem_programas WHERE slug = p_origem;
  SELECT id INTO v_d FROM viagem_programas WHERE slug = p_destino;
  IF v_o IS NULL OR v_d IS NULL THEN RETURN; END IF;

  INSERT INTO viagem_transferencias (
    origem_id, destino_id, ratio_origem, ratio_destino,
    minimo_transferencia, multiplo, prazo_dias_min, prazo_dias_max,
    verificado_em, fonte_url, observacoes
  ) VALUES (
    v_o, v_d, p_ratio_origem, p_ratio_destino,
    p_minimo, p_multiplo, p_prazo_min, p_prazo_max,
    p_verificado, p_fonte, p_obs
  )
  ON CONFLICT (origem_id, destino_id) DO NOTHING;
END;
$fn$;

-- Pool Avios: fato estrutural, 1:1, instantâneo. Entra VERIFICADO.
-- (Grafo completo entre os quatro — é o que permite "junta na Iberia,
-- emite pela British".)
DO $seed$
DECLARE
  v_avios TEXT[] := ARRAY['avios-iberia', 'avios-british', 'avios-qatar', 'avios-aer'];
  a TEXT; b TEXT;
BEGIN
  FOREACH a IN ARRAY v_avios LOOP
    FOREACH b IN ARRAY v_avios LOOP
      IF a <> b THEN
        PERFORM viagem_seed_aresta(
          a, b, 1, 1, 1, 1, 0, 1,
          CURRENT_DATE,
          'https://www.iberia.com/es/iberia-plus/combinar-avios/',
          'Pool Avios (Combine my Avios). Estrutural, 1:1, praticamente instantâneo.'
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$seed$;

-- Coalizões BR → programas aéreos. TODAS NÃO VERIFICADAS de propósito:
-- o ratio base costuma ser 1:1, mas o que decide é o bônus da semana.
-- O admin confirma e cadastra o bônus vigente antes de confiar.
SELECT viagem_seed_aresta('livelo', 'smiles',      1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Bônus sazonais frequentes — cadastre o vigente com validade.');
SELECT viagem_seed_aresta('livelo', 'latam-pass',  1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Confirmar antes de usar.');
SELECT viagem_seed_aresta('livelo', 'azul',        1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Confirmar antes de usar.');

SELECT viagem_seed_aresta('esfera', 'smiles',      1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Confirmar antes de usar.');
SELECT viagem_seed_aresta('esfera', 'latam-pass',  1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Confirmar antes de usar.');
SELECT viagem_seed_aresta('esfera', 'azul',        1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio base 1:1. Confirmar antes de usar.');
SELECT viagem_seed_aresta('esfera', 'avios-iberia', 1, 1, 1000, 1000, 0, 3, NULL, NULL,
  'Caminho BR → Avios. VERIFICAR ratio e disponibilidade: é a aresta que abre a Europa via oneworld.');

SELECT viagem_seed_aresta('itau', 'smiles',        1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio depende do produto de cartão. Confirmar.');
SELECT viagem_seed_aresta('itau', 'latam-pass',    1, 1, 1000, 1000, 0, 2, NULL, NULL,
  'Ratio depende do produto de cartão. Confirmar.');

-- Helper foi só para o seed; não deve virar superfície permanente.
DROP FUNCTION IF EXISTS viagem_seed_aresta(TEXT, TEXT, INT, INT, INT, INT, INT, INT, DATE, TEXT, TEXT);
