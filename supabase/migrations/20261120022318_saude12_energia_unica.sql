-- Saúde 12 — Energy Score: um por dia.
-- O Samsung Health recalcula o Energy Score do dia com um uid NOVO e apaga o antigo; aqui o antigo ficava,
-- e o painel mostrava um dos dois ao acaso (19/11: 77 e 84). Ao gravar um Energy Score, os outros do mesmo
-- dia e aparelho saem.
CREATE OR REPLACE FUNCTION saude_energia_unica() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM saude_samsung
  WHERE dispositivo_id = NEW.dispositivo_id AND tipo = 'energia' AND inicio = NEW.inicio AND uid <> NEW.uid;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION saude_energia_unica() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_saude_energia_unica ON saude_samsung;
CREATE TRIGGER trg_saude_energia_unica
  AFTER INSERT OR UPDATE ON saude_samsung
  FOR EACH ROW WHEN (NEW.tipo = 'energia')
  EXECUTE FUNCTION saude_energia_unica();

-- limpeza: fica o atualizado por último em cada dia
DELETE FROM saude_samsung s
USING saude_samsung t
WHERE s.tipo = 'energia' AND t.tipo = 'energia' AND s.dispositivo_id = t.dispositivo_id AND s.inicio = t.inicio
  AND s.uid <> t.uid AND (s.atualizado_em, s.uid) < (t.atualizado_em, t.uid);
