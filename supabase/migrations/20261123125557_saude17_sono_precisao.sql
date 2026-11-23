-- saude17: horas de sono na prontidão com 2 casas (antes 1 casa: 436 min viravam 7,3 h = "7h18" em vez de 7h16)
DO $$
DECLARE def TEXT;
BEGIN
  SELECT pg_get_functiondef('saude_prontidao(uuid,text)'::regprocedure) INTO def;
  IF position('round(sn.dormido_min / 60.0, 1)' IN def) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  EXECUTE replace(def, 'round(sn.dormido_min / 60.0, 1)', 'round(sn.dormido_min / 60.0, 2)');
END $$;
