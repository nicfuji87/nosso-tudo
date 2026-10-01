# PLANO-ML — Afiliados Mercado Livre × Pinterest

> Plano persistente de implementação do módulo **ML**. Qualquer agente deve conseguir continuar daqui
> sem o histórico da conversa. Atualize a tabela de fases e o registro ao concluir cada etapa.
>
> - Especificação: `especificacao_webapp_pinterest_afiliados.docx` (v1.0, 01/10/2026) — é a fonte de verdade funcional.
> - Arquitetura: [docs/ml/ARQUITETURA.md](docs/ml/ARQUITETURA.md) · Decisões: [docs/ml/DECISOES.md](docs/ml/DECISOES.md)
> - Banco: [docs/ml/BANCO.md](docs/ml/BANCO.md) · APIs: [docs/ml/REFERENCIAS-APIS.md](docs/ml/REFERENCIAS-APIS.md)
> - Operação/setup: [docs/ml/OPERACAO.md](docs/ml/OPERACAO.md)
> - Branch: `feat/ml-afiliados`

## 1. Entendimento

Painel operacional privado que:
1. **descobre** produtos (mais vendidos + tendências do ML) nas categorias escolhidas e guarda histórico (snapshots);
2. **enriquece e pontua** (score 0–100 explicável, com confiança e dados faltantes; IA opcional);
3. leva o humano só ao que não tem API: **aprovar** (ou auto-aprovar por regra), **colar o link de afiliado**,
   **gerar imagem no ChatGPT** (se escolher o modo manual) e **aprovar criativos**;
4. **gera conteúdo** (ângulos → copy → criativo 2:3) e **publica/agenda Pins** com o link de afiliado,
   revalidando o produto antes;
5. **mede** (métricas do Pinterest + comissões importadas) e **aprende** (performance por categoria/produto/ângulo/criativo
   como fator separado do score).

Níveis de automação 0–4 (spec §18) ligam/desligam cada etapa automática; o humano mantém o controle final.

## 2. Reaproveitado do Nosso Tudo

| Existente | Uso no ML |
|---|---|
| Next.js 14 App Router, Tailwind, componentes `ui/*`, tokens de marca | UI do `/ml` (mesma identidade, navegação própria) |
| Supabase Auth + `profiles` + middleware | Login único; `/ml` entra nas rotas protegidas |
| `platform_admins` + `is_platform_admin` | Owner implícito do ML |
| `trigger_set_updated_at()` | `updated_at` das tabelas ml_* |
| pg_cron + pg_net (já usados pelos alertas da Nia) | Batida do worker (`ml-worker-tick`) |
| Supabase Vault (extensão já instalada, não usada) | Segredos do ML |
| Storage | Bucket novo `ml-media` (público, só imagens) |
| `createAdminClient`, `getUser`, vitest, sonner (toasts) | Infra de servidor, testes e feedback |

Não reaproveitado (e por quê): `audit_log` (exige `workspace_id`) → `ml_audit_log`; `integration_settings`
(segredos em claro) → Vault; `produtos`/`categorias` do financeiro (outro domínio).

## 3. Fases

| # | Fase | Entregas | Depende de | Status |
|---|---|---|---|---|
| 0 | Fundação | migration `ml01`, acesso por papel, layout `/ml`, settings (Zod+defaults), Vault, auditoria, HTTP seguro, docs | — | ✅ |
| 1 | Integrações | OAuth ML (PKCE) e Pinterest, refresh com trava, OpenAI/Apify por chave, testar/desconectar, diagnóstico completo, tela Integrações | 0 | ✅ código · ⏳ conexão real |
| 2 | Jobs + agendador | fila (claim/lease/backoff/dead-letter/idempotência), worker `/api/ml/worker`, pg_cron, agendador cron+tz+sobreposição, telas Automações e Logs | 0 | ✅ |
| 3 | Descoberta + produtos | categorias, highlights, trends, snapshots/rankings, enriquecimento, scoring (engine + IA), telas Descobertas e Produto | 1, 2 | ✅ |
| 4 | Aprovação + links | transições validadas, aprovação/descarte individual e em lote (motivo + cooldown), Central de Pendências, fila "Salvar e próximo" | 3 | ✅ |
| 5 | Conteúdo + criativos | ângulos, copy (IA + fallback), 4 modos de imagem, histórico de versões, Kanban de criativos, fluxo manual ChatGPT | 4 | ✅ |
| 6 | Pinterest + publicação | Pins, janelas/limites, agendar/reagendar/pausar/cancelar, revalidação pré-publicação, publicação idempotente, falhas | 1, 5 | ✅ |
| 7 | Analytics | coleta de métricas, comissões (form/CSV), breakdowns (categoria/produto/board/ângulo/headline/criativo/preço), performance histórica | 6 | ✅ |
| 8 | Automação progressiva | níveis 0–4, auto-aprovação/geração/agendamento/publicação por regra, dashboard final, teste completo, checklist de produção | 3–7 | ✅ |

Cada fase só fecha com: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (apps/web) verdes e o fluxo da fase exercitado.

## 4. Riscos

1. **Leitura de itens de terceiros no ML pode dar 403** → enriquecimento via `/products` (buy box) + Apify opcional; dado faltante é explícito no score.
2. **OAuth do ML exige HTTPS** → só conecta no domínio publicado (`nossotudo.com.br`); local não dá para testar o OAuth real.
3. **Pinterest em Trial publica só em sandbox e sem analytics** → ambiente configurável; métricas só com acesso Standard.
4. **Não há API de link de afiliado** → fluxo manual otimizado; `source='api'` previsto.
5. **Banco compartilhado com produção** → migrations só aditivas (`ml_*`), nada em tabelas existentes.
6. **Worker depende do deploy** → o pg_cron só chama o app quando `ml_settings.runtime.app_url` estiver preenchido (o próprio app grava em produção).
7. **Modelos de IA mudam rápido** → modelos configuráveis, lista vinda de `/v1/models`, fallback sem IA em tudo.

## 5. Inconsistências spec × projeto (e como foram resolvidas)

- Nomes de tabela da spec (`products`, `jobs`…) → prefixo `ml_` (pedido no objetivo).
- Spec lista "Links de afiliado" como item de menu; o objetivo pede "Central de Pendências" → ambos: a Central agrupa tudo e o fluxo rápido de links tem rota própria.
- Política de sobreposição: spec "pular/enfileirar/cancelar anterior"; objetivo "ignorar/fila/aguardar" → `skip`, `queue` (enfileira e **aguarda** a anterior via `concurrency_key`), `cancel_previous`.
- Papéis: o Nosso Tudo só tem owner/member por workspace → ML tem papéis próprios (ADR-ML-002).
- Spec sugere `integration_credentials` → `ml_integrations` (estado) + Vault (segredo).

## 6. O que falta (depende do dono da conta)

1. **Deploy**: merge de `feat/ml-afiliados` na `main` → Vercel. Sem isso o pg_cron não tem para onde bater e o OAuth do ML (HTTPS) não roda.
2. **Apps de desenvolvedor**: criar no DevCenter do Mercado Livre e no portal do Pinterest (Redirect URIs em `docs/ml/OPERACAO.md`) e conectar pelo painel.
3. **Pinterest Standard access** para publicar em produção (em Trial só sandbox, sem métricas).
4. Validar com contas reais: descoberta (`/highlights` nas categorias escolhidas), publicação e métricas — os adapters seguem a documentação de 01/10/2026, mas as respostas reais podem trazer surpresas (ex.: 403 em itens de terceiros, já tratado como dado faltante).
5. Opcional: chave OpenAI e token Apify.

Validado nesta sessão sem contas externas: fila (claim/concurrency/idempotência/reaper direto no banco), worker real via HTTP,
diagnóstico, scoring, geração de ângulos/copy por template e criativo por composição (PNG 1000×1500 no Storage), 168 testes,
lint, typecheck e `next build`.

## 7. Registro de execução

- **01/10/2026** — Análise completa (spec, repo, banco, APIs). Fase 0: migration `ml01`, domínio puro
  (estados, cron, scoring, janelas, redação) com testes, docs de arquitetura/decisões/APIs.
- **01/10/2026** — Fases 1–8 em código: adapters (ML, Pinterest, OpenAI, Apify), fila + agendador + worker (pg_cron),
  descoberta/enriquecimento/scoring, aprovação e links, conteúdo e criativos (4 modos + recorte), publicação idempotente,
  métricas/performance/comissões, níveis de automação; migrations `ml02` (analytics) e `ml03` (pin/headline/membros) aplicadas;
  todas as telas do §5 da spec. Commits `65e9cb1`, `6bf9c76`, `841604b` (+ ajustes) na branch `feat/ml-afiliados`.
- **Próximo agente**: ver §6 — deploy, conexão real das integrações e ajuste fino dos adapters com respostas reais.
