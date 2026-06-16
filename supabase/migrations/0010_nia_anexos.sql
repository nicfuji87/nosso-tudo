-- =====================================================================
-- NOSSO TUDO — 0010: anexos da Nia (imagem, PDF, áudio) + multimodal
-- Bucket privado por workspace; mídias entram no histórico (mensagens_ia.midias).
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nia-anexos', 'nia-anexos', FALSE, 26214400,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/x-m4a','audio/aac'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path = '<workspace_id>/<arquivo>' — só membros do workspace leem/enviam.
DROP POLICY IF EXISTS "nia-anexos membros leem" ON storage.objects;
CREATE POLICY "nia-anexos membros leem"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'nia-anexos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

DROP POLICY IF EXISTS "nia-anexos membros enviam" ON storage.objects;
CREATE POLICY "nia-anexos membros enviam"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nia-anexos'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_workspaces()));

-- Referências dos anexos na própria mensagem (para o histórico).
ALTER TABLE mensagens_ia ADD COLUMN IF NOT EXISTS midias JSONB DEFAULT '[]';
