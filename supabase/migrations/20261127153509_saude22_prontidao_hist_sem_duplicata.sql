-- saude22 (27/11/2026): histórico da prontidão sem duplicatas.
-- Com a Edge v15 o histórico passou a ser gravado em todo cálculo; às 12:32 dois envios simultâneos do relógio
-- conferiram "mudou?" antes de qualquer um inserir e gravaram a mesma nota duas vezes. O trigger serializa por
-- workspace+dia (advisory lock da transação) e descarta a linha igual à última registrada.

CREATE OR REPLACE FUNCTION saude_prontidao_hist_sem_duplicata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  u RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('saude_prontidao_hist:' || NEW.workspace_id::text || ':' || NEW.dia::text, 0));
  SELECT h.score, h.confianca, h.algoritmo INTO u
  FROM saude_prontidao_hist h
  WHERE h.workspace_id = NEW.workspace_id AND h.dia = NEW.dia
  ORDER BY h.calculado_em DESC
  LIMIT 1;
  IF FOUND AND u.score IS NOT DISTINCT FROM NEW.score AND u.confianca IS NOT DISTINCT FROM NEW.confianca
     AND u.algoritmo IS NOT DISTINCT FROM NEW.algoritmo THEN
    RETURN NULL; -- igual à última: não grava
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION saude_prontidao_hist_sem_duplicata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS saude_prontidao_hist_sem_duplicata ON saude_prontidao_hist;
CREATE TRIGGER saude_prontidao_hist_sem_duplicata
  BEFORE INSERT ON saude_prontidao_hist
  FOR EACH ROW EXECUTE FUNCTION saude_prontidao_hist_sem_duplicata();

-- limpeza: a cópia idêntica gravada às 12:32 de 27/11 (mantém a primeira de cada par consecutivo igual)
DELETE FROM saude_prontidao_hist h
USING saude_prontidao_hist o
WHERE h.workspace_id = o.workspace_id AND h.dia = o.dia AND h.dia = '2026-11-27'
  AND h.score IS NOT DISTINCT FROM o.score AND h.confianca IS NOT DISTINCT FROM o.confianca AND h.algoritmo = o.algoritmo
  AND (h.calculado_em, h.id::text) > (o.calculado_em, o.id::text)
  AND h.calculado_em - o.calculado_em < interval '5 seconds';
