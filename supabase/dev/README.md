# Ambiente de desenvolvimento — Nosso Tudo Saúde

Decisão (16/11/2026): o desenvolvimento usa o **mesmo projeto Supabase do Nosso Tudo**
(`ecwcqooogsvsrddwjavh`). A separação é feita por **workspace de teste + Edge Function própria**,
não por projeto.

| | production | development |
|---|---|---|
| Usuário / workspace | seus workspaces reais | usuário só de teste, workspace com `settings.saude_ambiente = "development"` |
| Edge Function | `saude-relogio` (v0.3, não muda até a promoção) | `saude-relogio-dev` (recebe as mudanças da v0.4 primeiro) |
| Relógio | flavor `prod` → `app.nossotudo.saude.wear` ("Saúde NT") | flavor `dev` → `app.nossotudo.saude.wear.dev` ("Saúde NT DEV"), medição automática desligada |
| Site | Vercel (`NEXT_PUBLIC_APP_ENV=production`) | `next dev` na worktree `nosso-tudo-saude`, logado com o usuário de teste |
| Dados | reais | **sintéticos** (`seed_saude_sintetico.sql`) |

## Travas contra mistura
- **Relógio:** cada flavor só fala com a sua função (checado no build e em tempo de execução).
- **Edge Function dev:** só aceita relógio vinculado a workspace de teste; senão 403 e o relógio volta a pedir pareamento.
- **Site:** em development, ações de Saúde só escrevem em workspace de teste. Selo "DEV" na página.
- **Seed:** só grava no único workspace de teste e aborta se o dono dele também estiver num workspace real.

## Regras para mudanças de schema (v0.4 em diante)
Como o banco é o de produção, toda migração nova:
1. é apresentada antes (diagnóstico + plano) e só roda com OK;
2. é **aditiva** (tabela/coluna nova com default) — nada de alterar ou apagar o que a v0.3 usa;
3. entra no histórico de migrações (`supabase/migrations/`), nunca SQL solto.

## Montar (ordem)
1. Criar um usuário de teste no Nosso Tudo (cadastro normal) e concluir o onboarding → workspace de teste.
2. Marcar só esse workspace: `settings = settings || '{"saude_ambiente":"development"}'`.
3. Deploy da Edge Function `saude-relogio-dev` (`verify_jwt = false`).
4. Rodar `seed_saude_sintetico.sql`.
5. Instalar o flavor `dev` no relógio e parear com o workspace de teste.

Nunca: copiar dados reais para o workspace de teste, nem parear o relógio dev com um workspace real.
