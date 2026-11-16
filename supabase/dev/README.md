# Supabase de desenvolvimento — Nosso Tudo Saúde

Projeto **separado**, no plano Free, só para desenvolver e testar o módulo Saúde.
Nada daqui roda em produção (`ecwcqooogsvsrddwjavh`).

| | production | development |
|---|---|---|
| Projeto Supabase | `ecwcqooogsvsrddwjavh` | projeto Free próprio (ref em `apps/saude-android/local.properties` e `apps/web/.env.local` da worktree) |
| Relógio | flavor `prod` → `app.nossotudo.saude.wear` ("Saúde NT") | flavor `dev` → `app.nossotudo.saude.wear.dev` ("Saúde NT DEV"), medição automática desligada |
| Site | Vercel (`NEXT_PUBLIC_APP_ENV=production`) | `next dev` na worktree `nosso-tudo-saude` |
| Dados | reais | **sintéticos** (`seed_saude_sintetico.sql`) |

## Travas contra mistura de ambientes
- **Relógio:** o build falha se `saude.dev.url` apontar para produção. O app dev não envia nada sem URL configurada e recusa a URL de produção em tempo de execução.
- **Site:** em development, ações de Saúde que escrevem são bloqueadas se o Supabase configurado for o de produção. A página mostra um selo "DEV".
- **Banco:** `seed_saude_sintetico.sql` só roda onde existe a marca `public._ambiente = 'development'`, criada por `00_marcar_dev.sql`, que nunca é aplicado em produção.

## Montar o projeto dev (ordem)
1. Criar o projeto no painel da Supabase (org no plano Free, região São Paulo).
2. Aplicar `00_marcar_dev.sql`.
3. Aplicar as migrações de `supabase/migrations/` em ordem (schema base + `saude01_fundacao`).
4. Deploy da Edge Function `saude-relogio` com `verify_jwt = false`.
5. Criar um usuário de teste pelo site local (cadastro normal) e o workspace dele.
6. Aplicar `seed_saude_sintetico.sql`.

Nunca copie para cá: dados reais do relógio, chaves de produção, `.env.local` de produção.
