-- Perfil estruturado da família para a Nia: a identidade estável de quem é o
-- usuário/família (sobre, finanças, objetivos, observações). É sempre injetado
-- no contexto — separado dos `fatos` (memórias soltas, que são limitadas e
-- curadas). Só muda com sinal forte + confirmação.
alter table nia_contexto add column if not exists perfil jsonb not null default '{}'::jsonb;