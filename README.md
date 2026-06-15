# Nosso Tudo

> O sistema operacional da vida familiar — SaaS de controle financeiro familiar
> com captura por WhatsApp, conciliação de faturas e assistente de IA.

Implementação do [PRD v2.1](PRD-Nosso-Tudo.md) seguindo o
[Plano de Desenvolvimento](PLANO-DESENVOLVIMENTO.md), o
[design-system.md](design-system.md) e a [identidade-visual.md](identidade-visual.md).

## Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind v3 · Supabase
(Postgres + Auth + Storage + RLS) · Radix UI · Recharts · Zod · react-hook-form.

## Estrutura do repositório

```
apps/web/              # aplicação Next.js (ver apps/web/README.md)
supabase/
├── migrations/        # 0001_initial_schema.sql (= schema.sql) + 0002_auth_storage_audit.sql
└── config.toml
docs/adr/              # decisões de arquitetura (0001 paleta, 0002 estrutura)
*.md                   # PRD, plano, design system, identidade visual
schema.sql             # schema canônico do banco
```

## Como rodar

Pré-requisitos: Node 20+, pnpm 10+.

```bash
cd apps/web
cp .env.example .env.local      # preencha a NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm install
pnpm dev                        # http://localhost:3000
```

## Banco de dados

As migrations estão em `supabase/migrations/`. Para aplicar no projeto Supabase
(`ecwcqooogsvsrddwjavh`):

```bash
# via Supabase CLI (recomendado)
supabase link --project-ref ecwcqooogsvsrddwjavh
supabase db push
```

Ou cole o conteúdo de `0001_initial_schema.sql` e depois `0002_auth_storage_audit.sql`
no SQL Editor do dashboard, nessa ordem.

> ⚠️ **Atenção (bloqueador do plano §0.3):** existe um servidor MCP global `supabase`
> apontando para **outro projeto (RespiraKids, produção)** que pode sobrepor a config
> do projeto por colisão de nome. Antes de qualquer escrita via MCP, confirme com
> `get_project_url` → deve retornar `https://ecwcqooogsvsrddwjavh.supabase.co`.
> Por isso as migrations **não foram aplicadas automaticamente** — aplique você mesmo
> após resolver a colisão.

Depois de aplicar, configure no dashboard do Supabase:
- **Auth → URL Configuration:** Site URL `http://localhost:3000` e redirect
  `http://localhost:3000/auth/callback`.
- **Auth → Providers:** habilite Google (opcional) para o login social.

## O que está implementado

**Fundação + Fase 0 + Fase 1 (parcial Fase 2):**

- ✅ Design system (tokens da marca, primitivos, padrões) — zero cor hardcoded
- ✅ Landing page comercial completa (design-system §11.1)
- ✅ Auth: e-mail/senha, magic link, Google OAuth, recuperação de senha + middleware
- ✅ Onboarding (RF-002) com `provisionar_workspace`
- ✅ App shell responsivo (sidebar + bottom nav + FAB) e Home/dashboard (donut, saúde do mês)
- ✅ CRUD: transações (criar/listar/filtrar/excluir + audit), categorias, pessoas, contas, cartões
- ✅ Coleções (visualização) · Perfil · Termos/Privacidade (LGPD/DPO)
- ✅ Migrations: schema completo + triggers de profile/auditoria + buckets + RPCs da Home

**Pendente (fases 3–5, dependem de serviços externos):**

- ⬜ WhatsApp (Edge Function `processar-transacao`, HMAC) · matching/Inbox de Revisão
- ⬜ IA chat (Edge Function `ia-chat` + Anthropic) · modo detalhado
- ⬜ Conciliação de faturas PDF
- ⬜ Cobrança Asaas (checkout + webhooks) · gating de limites Free · anúncios
- ⬜ MFA · exportação/exclusão LGPD · convites multi-membro

## Segurança

- RLS em todas as tabelas com dado de usuário (isolamento por `workspace_id`).
- Validação Zod no servidor (Server Actions) além do cliente.
- `.gitignore` exclui `.claude/settings.json` (contém access token do Supabase) e `.env*`.

Ver [docs/adr](docs/adr/) para decisões de arquitetura.
