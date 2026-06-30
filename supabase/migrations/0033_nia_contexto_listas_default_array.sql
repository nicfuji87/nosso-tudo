-- preferencias e fatos em nia_contexto são LISTAS, mas o default era '{}'
-- (objeto) — isso quebrava código que fazia .filter sem guard de Array.isArray
-- (derrubou a Nia em toda mensagem após o deploy de preferências). Corrige o
-- default para '[]' e normaliza as linhas existentes que estavam como objeto.
alter table nia_contexto alter column preferencias set default '[]'::jsonb;
alter table nia_contexto alter column fatos set default '[]'::jsonb;
update nia_contexto set preferencias = '[]'::jsonb where jsonb_typeof(preferencias) is distinct from 'array';
update nia_contexto set fatos = '[]'::jsonb where jsonb_typeof(fatos) is distinct from 'array';
