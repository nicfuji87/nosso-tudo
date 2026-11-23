-- saude18: confiança da prontidão justificada
--   "alta" só com os 3 sinais medidos E referência pessoal de 21+ noites (antes bastavam 7);
--   referência fica "provisória" até 21 noites; devolve o motivo da confiança em texto.
DO $$
DECLARE def TEXT;
BEGIN
  SELECT pg_get_functiondef('saude_prontidao(uuid,text)'::regprocedure) INTO def;
  IF position('WHEN sinais >= 3 AND base_noites >= 7 THEN ''alta''' IN def) = 0 THEN RAISE EXCEPTION 'regra de confiança não encontrada'; END IF;
  IF position('''calibrando'', base_noites < 7,' IN def) = 0 THEN RAISE EXCEPTION 'campo calibrando não encontrado'; END IF;
  def := replace(def, 'WHEN sinais >= 3 AND base_noites >= 7 THEN ''alta''', 'WHEN sinais >= 3 AND base_noites >= 21 THEN ''alta''');
  def := replace(def, '''calibrando'', base_noites < 7,',
    '''calibrando'', base_noites < 7, ''referencia_provisoria'', base_noites < 21, ' ||
    '''confianca_motivo'', format(''%s de 3 sinais medidos (repouso, VFC, sono) · referência de %s noites%s'', sinais, base_noites, CASE WHEN base_noites < 21 THEN '' (provisória até 21)'' ELSE '''' END),');
  EXECUTE def;
END $$;
