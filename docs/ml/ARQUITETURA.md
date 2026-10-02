# ML — Arquitetura

Módulo de automação de afiliados **Mercado Livre × Pinterest** dentro do repositório Nosso Tudo.
Especificação funcional: `especificacao_webapp_pinterest_afiliados.docx` (v1.0, 01/10/2026) — resumida em
[`PLANO-ML.md`](../../PLANO-ML.md). Decisões: [`DECISOES.md`](./DECISOES.md). Banco: [`BANCO.md`](./BANCO.md).
APIs externas: [`REFERENCIAS-APIS.md`](./REFERENCIAS-APIS.md).

## Visão geral

```
            ┌──────────────────────── Next.js (apps/web, Vercel) ────────────────────────┐
 browser ──►│ /ml/*  páginas (RSC)  ──►  Server Actions (requireMlAction + Zod)           │
            │                                   │ enfileira jobs / grava via service_role │
            │ /api/ml/oauth/*  (state + PKCE)   ▼                                          │
            │ /api/ml/worker  ◄── pg_cron (1/min, segredo do Vault)                       │
            │      │  1. reaper (leases vencidos)  2. agendador (cron+tz)  3. fila         │
            │      ▼                                                                      │
            │ lib/ml/jobs/handlers/*  ──► lib/ml/integracoes/* (adapters isolados)        │
            └──────────────┬─────────────────────────────────────────┬────────────────────┘
                           ▼                                         ▼
               Supabase Postgres (ml_*)  · Vault  · Storage    Mercado Livre · Pinterest
               pg_cron + pg_net                                OpenAI (opc.) · Apify (opc.)
```

- **Mesma aplicação, área isolada.** Rotas em `/ml` (layout e navegação próprios), código em
  `src/lib/ml`, `src/components/ml`, `src/app/ml`, `src/app/api/ml`. Nada do Nosso Tudo é alterado
  além de uma entrada no middleware de rotas protegidas.
- **Sem n8n.** Toda automação é código do app: fila em Postgres + worker HTTP disparado pelo pg_cron.
- **Nada demorado dentro de requisição.** Ações do usuário só validam, gravam e enfileiram; a UI acompanha
  o job por polling (`JobStatus`).

## Camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| Páginas | `src/app/ml/**/page.tsx` | Leitura (cliente do usuário ⇒ RLS) e composição de componentes |
| Ações | `src/app/ml/**/actions.ts` | `requireMlAction(papel)` → Zod → regra de negócio → escrita service_role → auditoria |
| Domínio puro | `src/lib/ml/{estados,cron,tempo,redacao}.ts`, `scoring/engine.ts`, `publicacao/janelas.ts`, `afiliados/validacao.ts`, `conteudo/guardrails.ts` | Regras testáveis sem infra (vitest) |
| Serviços | `src/lib/ml/servicos/*` | Orquestram domínio + banco (transições, criativos, publicação…) |
| Fila | `src/lib/ml/jobs/*` | `enfileirar`, claim atômico (RPC), retries com backoff, dead-letter, logs |
| Agendador | `src/lib/ml/jobs/agendador.ts` | Cron + timezone por schedule, política de sobreposição |
| Adapters | `src/lib/ml/integracoes/*` | Um por provedor; tokens, refresh, mapeamento de payload |
| HTTP | `src/lib/ml/http.ts` | Timeout, classificação de erro, Retry-After, log sem segredo, allowlist (SSRF) |

## Fila e worker

- `ml_jobs`: tipo, payload, status (`queued → running → succeeded | failed | dead | canceled`), tentativas,
  `run_at`, lease (`lock_expires_at`), `idempotency_key` (único entre ativos), `concurrency_key`.
- **Claim**: `ml_claim_jobs()` usa `FOR UPDATE SKIP LOCKED` + advisory lock; nunca roda dois jobs com a mesma
  `concurrency_key` ao mesmo tempo (é como "aguardar a execução anterior" funciona).
- **Retry**: erro retentável (429, 5xx, rede, timeout) ⇒ backoff exponencial com jitter (honra `Retry-After`);
  erro de auth tenta refresh antes; esgotou tentativas ⇒ `dead` + pendência na Central.
- **Reaper**: `ml_reap_jobs()` devolve à fila jobs cujo lease venceu (worker morto).
- **Batida**: pg_cron `ml-worker-tick` (1/min) → `ml_cron_tick()` → `POST {app_url}/api/ml/worker` com
  `x-ml-worker-secret` (segredo gerado no Vault pela migration). O worker roda ~50 s por batida
  (`maxDuration` 300 s para jobs longos como geração de imagem).
- Botões "Executar agora"/"Processar pendências" enfileiram e dão um "chute" no worker (mesmo endpoint).
- Em desenvolvimento: `pnpm ml:worker` (apps/web) faz o papel do pg_cron contra `localhost`.

## Agendador (Automações)

- `ml_schedules`: `cron_expression` + `timezone` + `enabled` + `overlap_policy` (`skip` | `queue` | `cancel_previous`)
  + `config` (parâmetros do job). A UI tem modo simples (frequência/dias/hora) e avançado (cron com prévia das 5
  próximas execuções). `next_run_at` é recalculado ao salvar e a cada disparo.
- Pausa global (`ml_settings.automation.paused`) suspende todos sem perder configuração.
- Cada disparo vira uma linha em `ml_schedule_runs` (enfileirado, pulado por sobreposição, etc.).

## Pipeline de produto

```
DISCOVER_BESTSELLERS / DISCOVER_TRENDS
  → upsert ml_products + ml_product_rankings + ml_trends + snapshot
  → ENRICH_PRODUCT (catálogo/item/reviews; Apify opcional) → snapshot
  → SCORE_PRODUCT (regras duras + engine + IA opcional) → ml_product_scores → status ANALYZED
  → [humano ou auto-aprovação por score] APPROVED → WAITING_AFFILIATE_LINK | READY_FOR_CREATIVE
  → GENERATE_ANGLES → seleção → GENERATE_COPY + GENERATE_IMAGE (api | manual ChatGPT | upload | composição)
  → criativo em REVISÃO → aprovado → Pin (rascunho/agendado nas janelas)
  → REVALIDATE (antes) → PUBLISH_PIN (idempotente) → FETCH_PIN_ANALYTICS → COMPUTE_PERFORMANCE
```

O status do produto após a aprovação é **derivado** (`derivarStatusProduto`) do que existe (link ativo, criativos,
Pins) e toda mudança passa por `assertTransicao` + `ml_status_history`.

## Segurança

- Segredos (tokens OAuth, API keys, client secrets) **no Supabase Vault**, lidos só por RPC `service_role`.
  Para a UI vai apenas a máscara (`••••abcd`). Logs/erros passam por `redigir()`.
- RLS em todas as `ml_*`: `SELECT` por papel; **nenhuma escrita** para `authenticated` — toda escrita é do servidor,
  depois de `requireMlAction`.
- OAuth com `state` de uso único (15 min) + PKCE S256 (ML). Callback valida usuário/papel.
- Fetch server-side de URL vinda de usuário só em hosts permitidos (`hostPermitido`), HTTPS, sem IP literal.
- Upload: tipo por *magic bytes*, tamanho máximo, dimensões; caminho gerado pelo servidor.
- Ações críticas idempotentes (chaves de idempotência em jobs e Pins) e botões desabilitados enquanto o job roda.

## Observabilidade

`ml_jobs` + `ml_job_logs` (execuções), `ml_api_calls` (chamadas externas sem segredo), `ml_audit_log`
(alterações administrativas e decisões automáticas com motivo), `ml_status_history` (transições),
`ml_schedule_runs` (disparos). Tela **Logs & Erros** filtra por status/tipo e permite reprocessar.

## V2 — famílias de criativos (ver ESPECIFICACAO-V2.md e ADR-ML-016…022)

```
produto aprovado ─► IMPORT_PRODUCT_MEDIA (galeria com proveniência; referência principal automática)
                 └► wizard "Gerar lote" ─► ml_creative_families ─► PLAN_CREATIVE_FAMILY (hipótese, headlines, editorial)
                                                               └► GENERATE_CREATIVE_BATCH (N variantes = mix × cenas)
cada variante ─► avancarVariante (decide o próximo passo pelo estado):
   composição exata:  PREPARE_PRODUCT_CUTOUT → GENERATE_LIFESTYLE_BACKGROUND → COMPOSE_EXACT_PRODUCT
   por referência:    GENERATE_REFERENCE_IMAGE → CHECK_CREATIVE_FIDELITY
   foto + layout:     COMPOSE_EXACT_PRODUCT (layout com a foto original)
   manual/upload:     aguarda upload (prompt + referências prontos) → CHECK_CREATIVE_FIDELITY
   ─► APPLY_TEXT_OVERLAY (se tem texto/editorial) ─► GENERATE_PINTEREST_PACKAGE ─► revisão
aprovação (portões: fidelidade + pacote ready) ─► piscina ─► agendamento (cooldown, board/dia, similaridade) ─► PUBLISH_PIN
métricas ─► COMPUTE_PERFORMANCE (= ROLLUP_CREATIVE_PERFORMANCE) por família/variante/cena/tipo
```

- Imagens: `lib/ml/media/pixels.ts` (decode, recorte, dHash — JS puro), `composicao-v2.tsx` (cena exata, overlay,
  editorial, cenário estilizado), `servicos/midia.ts` (galeria), `servicos/variantes.ts` (pipeline), `servicos/prompts.ts`
  (templates/presets).
- Regras puras testadas: `familias/plano.ts` (mix × cenas, custo), `familias/pacote.ts` (pacote e portão de fidelidade),
  `familias/templates.ts`, `publicacao/repeticao.ts` (anti-repetição, cooldown, escolha da variante), `conteudo/ia-v2.ts`.
