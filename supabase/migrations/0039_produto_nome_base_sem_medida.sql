-- =====================================================================
-- 0039. IDENTIDADE DO PRODUTO SEM A MEDIDA
-- ---------------------------------------------------------------------
-- "Picanha Fatiada Angus 0,544kg" e "...0,590kg" eram dois produtos.
-- O peso da balança nunca repete, então cada compra criava um cadastro
-- novo e uma pergunta nova na Pré-conferência — sem convergir nunca.
--
-- Aqui o peso/volume deixa de fazer parte da IDENTIDADE e passa a ser
-- atributo da compra (itens_transacao.quantidade/unidade, que já existem).
-- O produto passa a ser identificado por `nome_base`: sem medida, sem
-- palavras vazias e com os tokens ORDENADOS — assim "Suco Integral Uva
-- Tinto Aurora" e "Suco de Uva Tinto Integral Aurora" viram a mesma chave.
--
-- Efeito colateral desejado: com o peso fora do nome, R$/kg e R$/l ficam
-- comparáveis entre compras, que é o que faltava para os relatórios de preço.
--
-- Contrapartida assumida: "Coca 350ml" e "Coca 2l" também colapsam num
-- produto só, com medidas diferentes. Para gasto e preço unitário isso é
-- melhor; se um dia precisar separar por embalagem, o dado está em
-- `medida_valor`/`medida_unidade`.
--
-- Espelho no app: nomeBaseProduto() e extrairMedida() em lib/normalize.ts.
-- Mudou aqui, mude lá.
-- =====================================================================

-- Unidades sinônimas → forma canônica (espelha normalizarUnidade() do app).
CREATE OR REPLACE FUNCTION public.canonizar_unidade(p_u text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE lower(regexp_replace(unaccent(coalesce(p_u,'')), '[^a-zA-Z]', '', 'g'))
    WHEN '' THEN NULL
    WHEN 'kg' THEN 'kg' WHEN 'kgs' THEN 'kg' WHEN 'quilo' THEN 'kg' WHEN 'quilos' THEN 'kg'
    WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg'
    WHEN 'g' THEN 'g' WHEN 'gr' THEN 'g' WHEN 'grs' THEN 'g' WHEN 'grama' THEN 'g' WHEN 'gramas' THEN 'g'
    WHEN 'mg' THEN 'mg'
    WHEN 'l' THEN 'l' WHEN 'lt' THEN 'l' WHEN 'lts' THEN 'l' WHEN 'litro' THEN 'l' WHEN 'litros' THEN 'l'
    WHEN 'ml' THEN 'ml' WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
    WHEN 'un' THEN 'un' WHEN 'und' THEN 'un' WHEN 'uni' THEN 'un' WHEN 'unid' THEN 'un'
    WHEN 'unidade' THEN 'un' WHEN 'unidades' THEN 'un' WHEN 'pc' THEN 'un' WHEN 'pcs' THEN 'un'
    WHEN 'peca' THEN 'un' WHEN 'pecas' THEN 'un'
    WHEN 'cx' THEN 'cx' WHEN 'caixa' THEN 'cx' WHEN 'pct' THEN 'pct' WHEN 'pacote' THEN 'pct'
    ELSE lower(regexp_replace(unaccent(coalesce(p_u,'')), '[^a-zA-Z]', '', 'g'))
  END;
$fn$;

-- Padrão de medida embutida no nome: "0,544kg", "1,5 l", "258g", "(2un)".
-- Exige a unidade colada/adjacente ao número para não comer números que
-- fazem parte do nome ("Ype 3 em 1", "Coca 600").
CREATE OR REPLACE FUNCTION public.medida_regex()
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '(\d+([.,]\d+)?)\s*(kgs?|quilos?|kilos?|gramas?|grs?|g|mg|litros?|lts?|l|ml|unidades?|unid|und|un|pcs?|pecas?|cx|caixas?|pct|pacotes?)([^a-z0-9]|$)';
$fn$;

/** Valor numérico da medida embutida no nome; NULL se não houver. */
CREATE OR REPLACE FUNCTION public.medida_valor(p_texto text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE m text[];
BEGIN
  m := regexp_match(lower(unaccent(coalesce(p_texto,''))), medida_regex());
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN replace(m[1], ',', '.')::numeric;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$fn$;

/** Unidade canônica da medida embutida no nome; NULL se não houver. */
CREATE OR REPLACE FUNCTION public.medida_unidade(p_texto text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE m text[];
BEGIN
  m := regexp_match(lower(unaccent(coalesce(p_texto,''))), medida_regex());
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN canonizar_unidade(m[3]);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$fn$;

/**
 * Chave de identidade do produto: minúsculo, sem acento, SEM a medida,
 * sem palavras vazias e com os tokens em ordem alfabética.
 *   'Picanha Fatiada Angus 0,590kg'      -> 'angus fatiada picanha'
 *   'Suco de Uva Tinto Integral Aurora'  -> 'aurora integral suco tinto uva'
 */
CREATE OR REPLACE FUNCTION public.nome_base_produto(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT string_agg(tok, ' ' ORDER BY tok)
       FROM unnest(string_to_array(
         trim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(unaccent(coalesce(p_texto,''))), medida_regex(), ' ', 'g'),
             '[^a-z0-9 ]+', ' ', 'g'),
           '\s+', ' ', 'g')), ' ')) AS tok
      WHERE tok <> ''
        AND tok NOT IN ('de','da','do','dos','das','com','e','em','a','o','os','as',
                        'tipo','sem','para','pra','no','na','nos','nas','un','kg','g','ml','l')
        AND tok !~ '^\d+$'),
    '');
$fn$;

-- ---------------------------------------------------------------------
-- Coluna de identidade + medida no cadastro de produto
-- ---------------------------------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS nome_base      TEXT,
  ADD COLUMN IF NOT EXISTS medida_valor   NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS medida_unidade TEXT;

/** Mantém nome_base/medida em dia a cada insert/update do nome. */
CREATE OR REPLACE FUNCTION public.trg_produto_nome_base()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.nome_base := nome_base_produto(NEW.nome);
  IF NEW.medida_valor IS NULL THEN
    NEW.medida_valor := medida_valor(NEW.nome);
  END IF;
  IF NEW.medida_unidade IS NULL THEN
    NEW.medida_unidade := COALESCE(medida_unidade(NEW.nome), canonizar_unidade(NEW.unidade_padrao));
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS produto_nome_base_biu ON public.produtos;
CREATE TRIGGER produto_nome_base_biu
BEFORE INSERT OR UPDATE OF nome ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.trg_produto_nome_base();

UPDATE public.produtos SET nome = nome;   -- dispara o trigger e preenche o retroativo

CREATE INDEX IF NOT EXISTS idx_produtos_nome_base
  ON public.produtos (workspace_id, nome_base);
CREATE INDEX IF NOT EXISTS idx_produtos_nome_base_trgm
  ON public.produtos USING gin (nome_base gin_trgm_ops);
