-- Marca este banco como DESENVOLVIMENTO. NUNCA aplicar no projeto de produção (ecwcqooogsvsrddwjavh).
-- Scripts de dados sintéticos exigem esta marca para rodar.
CREATE TABLE IF NOT EXISTS public._ambiente (nome TEXT PRIMARY KEY CHECK (nome = 'development'));
INSERT INTO public._ambiente VALUES ('development') ON CONFLICT DO NOTHING;
REVOKE ALL ON public._ambiente FROM anon, authenticated;
ALTER TABLE public._ambiente ENABLE ROW LEVEL SECURITY;
