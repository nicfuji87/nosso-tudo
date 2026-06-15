# @nosso-tudo/web

App Next.js (App Router) do Nosso Tudo — frontend + camada de acesso a dados.

## Scripts

```bash
pnpm dev        # desenvolvimento (http://localhost:3000)
pnpm build      # build de produção
pnpm start      # serve o build
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

- `NEXT_PUBLIC_SUPABASE_URL` — já apontando para o projeto `ecwcqooogsvsrddwjavh`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → `anon public`.
- `SUPABASE_SERVICE_ROLE_KEY` — só servidor (webhooks/jobs); opcional no dev.

## Estrutura

```
src/
├── app/
│   ├── (marketing)/        # landing, termos, privacidade
│   ├── (auth)/             # entrar, cadastrar, esqueci/redefinir senha
│   ├── auth/callback/      # troca de código OAuth/magic/recovery
│   ├── onboarding/         # RF-002
│   └── app/                # área autenticada (home, transações, cadastros, ...)
├── components/
│   ├── ui/                 # primitivos (Button, Input, Dialog, ...) → packages/ui
│   ├── patterns/           # EmptyState, PageHeader, CategoryIcon, StatTile
│   ├── marketing/ auth/ app/ cadastros/ transacoes/ dashboard/ perfil/ onboarding/
│   └── brand/              # Logo
├── lib/
│   ├── supabase/           # clients (browser, server, middleware, admin)
│   ├── schemas/            # Zod (auth, onboarding, transacao, cadastros)
│   ├── db/                 # queries tipadas (→ packages/db)
│   ├── types/db.ts         # enums + linhas espelhando o schema SQL
│   ├── auth.ts             # contexto de workspace + gating de plano
│   └── format.ts / utils.ts / normalize.ts
└── middleware.ts           # refresh de sessão + proteção de rotas
```

## Convenções (PRD §8.9)

- Domínio em português (`transacoes`, `entidades`), técnico em inglês (`handleSubmit`).
- Arquivos kebab-case, componentes PascalCase, hooks `use*`.
- **Zero cor hardcoded** — sempre tokens (`bg-primary`, `text-muted-foreground`).
- TypeScript strict, sem `any`.

> Nota: `node-linker=hoisted` no `.npmrc` é necessário porque o drive é exFAT
> (sem suporte a symlinks). Ver ADR 0002.
