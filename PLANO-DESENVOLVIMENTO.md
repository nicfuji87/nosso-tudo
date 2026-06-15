# Plano de Desenvolvimento — Nosso Tudo

> Plano executável que traduz o [PRD v2.1](PRD-Nosso-Tudo.md), o [design-system.md](design-system.md), a [identidade-visual.md](identidade-visual.md) e o [schema.sql](schema.sql) em passos concretos de engenharia, do zero ao lançamento público.
>
> **Data:** 14/06/2026 · **Status:** proposta inicial

---

## 0. Estado atual e bloqueadores

### 0.1 O que já existe
- **Documentação completa:** PRD v2.1, design system, manual de marca, schema SQL completo (tabelas, ENUMs, funções `buscar_match_*` / `confirmar_match` / `provisionar_workspace`, views `v_inbox_revisao` / `v_pendentes_revisao`, RLS).
- **Assets de marca:** logos em `public/assets/logo/` (ícone, dark, white — PNG + PDF).
- **Configuração Claude/MCP:** `.claude/settings.json`.

### 0.2 O que NÃO existe ainda
- Nenhum código (sem `package.json`, sem monorepo, sem app). Projeto greenfield.
- Schema **não aplicado** em nenhum banco do Nosso Tudo.

### 0.3 ⛔ Bloqueador — conexão MCP do Supabase aponta para o projeto errado
O projeto Supabase do Nosso Tudo é **`ecwcqooogsvsrddwjavh`** (vazio, pronto para receber o schema). Está corretamente configurado no `.claude/settings.json` do projeto.

**O problema:** existem dois servidores MCP com o mesmo nome `supabase` e a config global vence:
- Global (`~/.claude/settings.json` e `~/.claude.json`) → `jqegoentcusnbcykgtxg` = **RespiraKids** (outro sistema em produção, não usar aqui).
- Projeto (`.claude/settings.json`) → `ecwcqooogsvsrddwjavh` = **Nosso Tudo** (correto, mas ignorado por colisão de nome).

Resultado: a sessão lê o RespiraKids em vez do Nosso Tudo.

**Ação obrigatória antes da Fase 0:** desfazer a colisão de nomes (ex.: dar nomes distintos aos servidores, ou mover o MCP do RespiraKids para a config do projeto dele) e **reiniciar o Claude Code** para a conexão passar a apontar para `ecwcqooogsvsrddwjavh`. Confirmar com `get_project_url` → deve retornar `https://ecwcqooogsvsrddwjavh.supabase.co`.

---

## 1. Decisões a tomar antes de codar

| # | Decisão | Recomendação | Impacto |
|---|---|---|---|
| D1 | Projeto Supabase | **Novo projeto dedicado** (ver 0.3) | Bloqueia tudo |
| D2 | Repositório/versionamento | Inicializar **git + GitHub** (o projeto hoje não é repo) | Habilita CI/CD, code review, Dependabot (SR-060/062) |
| D3 | Gerenciador do monorepo | **pnpm + Turborepo** | Workspaces + cache de build |
| D4 | Capacidade da equipe | Definir (solo vs equipe) | Os prazos do PRD assumem dev dedicado; solo ≈ 1.5–2× |
| D5 | Agente de WhatsApp | É serviço externo "já existente" (PRD §9.1) — confirmar contrato/API | Necessário p/ Fase 3 |
| D6 | Contas de serviço | Criar cedo (ver §2) | Asaas sandbox e Anthropic bloqueiam Fases 4–5 |

---

## 2. Pré-requisitos — contas e serviços a provisionar

Criar no início (a maioria tem free tier para dev):

- **Supabase** — projeto novo (Postgres + Auth + Storage + Edge Functions + Realtime).
- **Vercel** — hospedagem do front + previews por PR.
- **GitHub** — repo privado, Dependabot, branch protection, CI (Actions).
- **Anthropic** — API key para o assistente IA (`claude-haiku-4-5` no chat).
- **Asaas** — conta **sandbox** primeiro; API keys e segredo de webhook.
- **Resend** — e-mails transacionais (domínio verificado).
- **PostHog** — analytics privacy-first (opt-out / DNT).
- **Sentry** — monitoramento de erros (front + Edge Functions).
- **Cloudflare Turnstile** — captcha (cadastro/login/reset).
- **Domínio** — produção + e-mail.

Guardar segredos só em env vars (Vercel/Supabase). Nunca commitar `.env` (SR-063). Chaves separadas por ambiente (dev/staging/prod).

---

## 3. Princípios que valem para todas as fases

Extraídos do PRD §7 (Segurança) e §8 (Engenharia) — não são fase, são fundação contínua:

- **Segurança desde o 1º commit:** RLS em toda tabela com dado de usuário; validação no servidor; falha segura; tudo auditável.
- **Reuso > duplicação:** schemas Zod, types, queries e UI compartilhados em `packages/` entre front e Edge Functions.
- **Tipagem rígida:** TypeScript strict, sem `any`; types gerados do schema Supabase.
- **Zero cor hardcoded:** tudo via tokens do design system (Tailwind config).
- **Testes onde dói perder:** auth, RLS, conciliação, cobrança, IA tools.
- **Mobile-first:** desenhar para 380px e expandir.
- **Definition of Done por fase:** lint + type-check + testes passando, RLS testado no que tocou, deploy em staging verde.

---

## 4. Fundação técnica (pré-Fase 0)

Antes do roadmap de features, montar a base. Duração estimada: ~1 semana.

### 4.1 Monorepo (PRD §8.2)
```
nosso-tudo/
├── apps/
│   ├── web/                 # Next.js 14+ (App Router): (marketing) (auth) (app) api
│   └── functions/           # Supabase Edge Functions
├── packages/
│   ├── ui/                  # design system (primitives/composites/patterns)
│   ├── schemas/             # Zod compartilhado
│   ├── types/               # types TS + gerados do Supabase
│   ├── utils/               # formatBRL, datas, etc.
│   ├── db/                  # cliente Supabase + queries tipadas
│   └── config/              # constantes/enums espelhando o SQL
├── supabase/                # migrations, seed.sql, config.toml
└── docs/                    # PRD, ADRs, design system
```
- Inicializar com pnpm + Turborepo; Next.js em `apps/web`; Tailwind + shadcn/ui.
- TypeScript strict em todo o monorepo; ESLint (+ `eslint-plugin-security`); Prettier.

### 4.2 CI/CD (PRD §8.12)
- GitHub Actions: em cada PR → `lint` + `type-check` + `test` + `npm audit`.
- Branch protection na `main`; code review obrigatório (SR-060).
- Vercel: deploy automático de previews por PR; staging na main; produção por tag.
- Dependabot + detecção de secrets (GitGuardian/equivalente).

### 4.3 Design tokens
- Converter `design-system.md` em `tailwind.config.ts` (cores, tipografia, spacing, radius, sombras, transições). Marca oficial (`identidade-visual.md`) como fonte para logo/símbolo.
- Configurar fontes (Geist/Inter Tight; mono p/ valores).

**DoD da fundação:** repo no GitHub, monorepo buildando, CI verde em PR de exemplo, deploy de "hello world" na Vercel, projeto Supabase novo criado e conectado.

---

## 5. Roadmap executável por fases

Mapeia o roadmap do PRD §12 para entregáveis concretos. Estimativas = do PRD (dev dedicado).

### Fase 0 — Fundação do produto (3–4 semanas)
**Objetivo:** alguém consegue criar conta, fazer login e ver um app vazio seguro; landing no ar.
- Aplicar `schema.sql` no Supabase novo via migrations versionadas (`supabase/migrations/`). Validar ENUMs, funções, views, triggers.
- Habilitar **RLS em todas as tabelas**; revisar policies `workspace_id IN user_workspaces()` (SR-005).
- Storage buckets: `notas-fiscais` (privado), `faturas-pdf` (privado), `avatars` (público) + policies (SR-013).
- `supabase gen types` → `packages/types`.
- **Auth (RF-001/003/005):** e-mail+senha, magic link, Google OAuth (PKCE+state), recuperação de senha, rate limiting, Turnstile.
- **Onboarding (RF-002):** aceite de termos/LGPD → nome do workspace → `provisionar_workspace()` (cria workspace + entidade "Casa" + categorias padrão) → tutorial.
- **Design system implementado:** primitivos (`Button`, `Input`, `Card`, `Dialog`, `Sheet`, `Pill`, `Avatar`…).
- **Landing page comercial** (estrutura do design-system §11.1).
- **Testes de RLS automatizados** (Vitest com cliente de outro usuário — não acessa dado alheio).

**DoD:** cadastro→onboarding→home vazia funcionando; RLS testado; landing publicada; tokens do design system em uso.

### Fase 1 — Lançamentos básicos (3–4 semanas)
**Objetivo:** registrar e gerir finanças manualmente no app.
- CRUD: cartões, contas bancárias, entidades, categorias (com comportamento `basico`/`projeto`/`compromisso`, RF-030+).
- Lançamento manual completo + atalho FAB "+" (RF-050/051); upload de comprovante (RF-052).
- Lista, filtros e edição/exclusão de transações com **audit log** (RF-053, SR-050).
- Recorrências / contas fixas (RF-090) + Edge Function `gerar-recorrencias` (cron diário).
- Home básica (greeting, saúde do mês, cartões, gastos por categoria).

**DoD:** família consegue operar 100% manualmente; audit log gravando antes/depois.

### Fase 2 — Coleções e dashboard (3 semanas)
**Objetivo:** projetos/compromissos e visão analítica.
- Coleções (instâncias de categorias `projeto`/`compromisso`) + itens de coleção (RF-031+).
- Dashboard com gráficos (Recharts): donut por categoria, evolução, coleções ativas.
- Filtros globais + busca (RF-072/073) — performance <500ms com índices.

**DoD:** coleções operacionais; dashboard responde "como estamos?" antes dos números.

### Fase 3 — WhatsApp e conciliação (4 semanas) · gating Pro
**Objetivo:** captura sem fricção + conciliação + inteligência de match.
- Integração com agente WhatsApp externo: `whatsapp_routing`, verificação de telefone (RF-040), HMAC (SR-041).
- Edge Function `processar-transacao` (resolve nomes, cria registros, armazena mídia).
- **Matching em 4 camadas** (RF-120): exato → alias → código de barras → similaridade (`pg_trgm`); score 0–1.
- Ação por confiança (RF-121): ≥0.95 auto-vincula · 0.60–0.94 sugestão · <0.60 novo.
- Conciliação automática de fatura PDF (RF-060+): parser por banco, algoritmo de matching, fila de revisão.
- **Inbox de Revisão v1** (RF-123): view `v_inbox_revisao` (sugestões + faturas + novos itens), ações inline, badge.
- Confirmação concisa no WhatsApp (RF-124); Realtime sync no app.

**DoD:** foto/áudio no WhatsApp vira transação; fatura PDF concilia; Inbox unifica pendências; taxa de auto-match medida.

### Fase 4 — IA chat, modo detalhado e relatórios (3 semanas) · gating Pro
**Objetivo:** assistente conversacional e rastreamento granular.
- Edge Function `ia-chat`: Claude (haiku) + **tools = RPCs read-only pré-aprovadas** (SR-021), cota mensal (RF-080+), `conversas_ia`/`mensagens_ia`.
- **Modo detalhado** (RF-125): extrai itens individuais de NF → `produtos` + `itens_transacao`.
- **Aprendizado por aliases** (RF-122): `confirmar_match()` adiciona alias, reaponta e remove duplicado.
- Relatórios avançados (incl. "preço médio do produto X entre estabelecimentos").
- Investimentos e metas (RF-090+).
- Reversibilidade de matches (RF-126) + config de privacidade de aliases (RF-127).

**DoD:** chat responde sobre as finanças com dados reais; modo detalhado popula produtos; aprendizado por alias funcionando.

### Fase 5 — Cobrança e produção (3 semanas)
**Objetivo:** monetização e prontidão para o público.
- **Asaas:** Edge Functions `criar-cobranca-asaas` (customer + subscription, Pix/Boleto/Cartão tokenizado) e `asaas-webhook` (validação token+IP, idempotência por `asaas_event_id`, `pagamentos`/`asaas_webhook_events`) — RF-020+, SR-040.
- Trial 14 dias (RF-021); downgrade/cancelamento (RF-022); inadimplência overdue→past_due→free (RF-024); troca de método (RF-025).
- Tela de cobrança + histórico/recibos (RF-023).
- Gating de plano: `usePlan()`, `useCanUseFeature()` aplicando limites Free.
- Anúncios in-app para Free (RF-100+).
- **LGPD:** exportação ZIP (`exportar-dados`, RF-110) e exclusão com soft-delete 30d (RF-111); termos versionados (RF-112); página DPO (RF-114).
- Convites multi-membro (RF-010+).
- **MFA opcional** TOTP + backup codes (RF-004, SR-002).
- **Pentest externo** (SR-064) + testes de RLS por policy.

**DoD:** assinar Pro via Pix/Boleto/Cartão ponta a ponta no sandbox; webhooks idempotentes; LGPD pronta; MFA disponível; pentest sem achados críticos.

### Fase 6 — Beta privado (2 semanas)
- 10–20 famílias; monitoramento ativo (Sentry/PostHog); coleta de feedback; ajustes.
- Validar métricas: auto-match >70%, Inbox <5 itens, correções <15%.

### Fase 7 — Lançamento público
- Asaas em **produção**; landing final; marketing inicial; suporte estruturado; runbook de incidentes (SR-070/071).

---

## 6. Esteira de qualidade contínua

- **Segurança:** RLS por tabela; validação Zod no servidor; CSP estrita; upload com whitelist+magic bytes+antivírus (SR-024); rate limiting em todas as Edge Functions; secrets rotacionados.
- **Testes (PRD §8.10):** unit (utils/schemas), integração (RPCs/Edge), E2E Playwright (login, criar transação, upgrade Pro), RLS tests. Cobertura ≥70% em domínio crítico.
- **Observabilidade:** Sentry (erros), PostHog (analytics opt-out), logs estruturados sem PII, alertas (spike 500, falhas de login, webhook Asaas, Edge >10s).
- **Documentação:** README por package; ADRs em `docs/adr/`; JSDoc em APIs públicas dos packages.

---

## 7. Marcos e linha do tempo

| Marco | Fases | Estimativa acumulada (dev dedicado) |
|---|---|---|
| M0 — Fundação técnica + Supabase novo | pré-0 | ~1 semana |
| M1 — Conta + onboarding + landing | 0 | ~5 semanas |
| M2 — App manual completo | 1–2 | ~11–12 semanas |
| M3 — WhatsApp + IA + conciliação | 3–4 | ~18–19 semanas |
| M4 — Cobrança + LGPD + pentest | 5 | ~21–22 semanas |
| M5 — Beta → lançamento | 6–7 | ~24 semanas (~5–6 meses) |

> Prazos são os do PRD assumindo desenvolvedor dedicado. Solo, sem dedicação integral: contar ~1.5–2×. Recomendo revisar após D4 (capacidade).

---

## 8. Próximos passos imediatos (esta semana)

1. **D1 — Criar projeto Supabase novo** (região São Paulo) e atualizar `.claude/settings.json` + memória.
2. **D2 — `git init` + repo no GitHub** privado, com branch protection.
3. Criar contas sandbox/dev: Anthropic, Asaas, Resend, PostHog, Sentry, Turnstile, Vercel.
4. Montar o **monorepo** (pnpm + Turborepo + Next.js + Tailwind/shadcn) — §4.1.
5. Aplicar `schema.sql` como **migrations** no Supabase novo + habilitar/testar RLS.
6. Converter design tokens para `tailwind.config.ts` e implementar primitivos do design system.
7. Configurar **CI** (lint + types + tests + audit) e deploy de exemplo na Vercel.
8. Iniciar **Fase 0**: auth + onboarding + landing.

---

*Documento vivo — atualizar conforme o produto evolui. Referências: [PRD-Nosso-Tudo.md](PRD-Nosso-Tudo.md), [design-system.md](design-system.md), [identidade-visual.md](identidade-visual.md), [schema.sql](schema.sql).*
