# ML — Banco de dados

Todas as tabelas têm prefixo `ml_`, RLS ligado (SELECT por papel, escrita só via service_role) e `updated_at`
automático onde faz sentido. Status são `text + CHECK`. Fonte: `supabase/migrations/*_ml01_fundacao.sql`,
`*_ml02_analytics.sql`. Tipos TS: `apps/web/src/lib/ml/database.types.ts` (`pnpm ml:types`) e aliases em `lib/ml/tipos.ts`.

## Mapa

| Grupo | Tabela | Para quê | Chaves/índices importantes |
|---|---|---|---|
| Acesso | `ml_members` | papel por usuário (viewer/operator/admin/owner) | PK profile_id; platform admin = owner via `ml_role()` |
| Config | `ml_settings` | overrides por seção (defaults no código, Zod) | PK key; `version` incrementa a cada save (prompt base versionado) |
| | `ml_integrations` | estado de cada integração (sem segredo) | PK provider; `lock_until` serializa refresh |
| | `ml_oauth_states` | state/PKCE do OAuth (15 min, uso único) | deny-all |
| Catálogo | `ml_categories` | árvore de categorias ML + acompanhar/proibida/comissão | PK id (MLB…), idx tracked, parent |
| | `ml_products` | produto + status do pipeline + sinais atuais | UNIQUE external_id; idx (status, score), trigram em title |
| | `ml_product_snapshots` | histórico (preço, ranking, rating, reviews, disponibilidade) | idx (product_id, captured_at) |
| | `ml_product_rankings` | foto diária de cada lista de mais vendidos | UNIQUE (category_id, collected_on, external_id) |
| | `ml_trends` | buscas em alta por semana | UNIQUE (coalesce(category_id,''), lower(keyword), week_start) |
| Score | `ml_scoring_versions` | pesos versionados | PK version |
| | `ml_product_scores` | cada cálculo (componentes, motivos, alertas, faltantes, versão, modelo/prompt) | idx (product_id, created_at) |
| Afiliado | `ml_affiliate_links` | link original × afiliado, histórico | UNIQUE parcial (product_id) WHERE active |
| Pinterest | `ml_pinterest_boards` | espelho dos boards + mapeamento de categorias | UNIQUE external_id |
| Conteúdo | `ml_creative_angles` | ângulos sugeridos/selecionados/usados | idx (product_id, status) |
| | `ml_creatives` | textos + modo de imagem + status | idx (status), (product_id) |
| | `ml_creative_assets` | toda imagem gerada/enviada (nunca sobrescreve) | idx (creative_id, created_at) |
| | `ml_creative_revisions` | snapshot a cada edição/regeneração | |
| Publicação | `ml_pins` | publicação (produto+criativo+board+link) | UNIQUE external_pin_id, UNIQUE idempotency_key; idx (status, scheduled_at) |
| | `ml_pin_metrics` | métricas diárias | PK (pin_id, date) — upsert idempotente |
| | `ml_commissions` | comissões importadas | UNIQUE parcial external_ref |
| | `ml_performance_stats` | performance observada por dimensão (separada do score) | PK (dimension, key, period_days) |
| Execução | `ml_jobs` | fila | UNIQUE parcial idempotency_key (ativos); idx claim (priority, run_at) |
| | `ml_job_logs` | logs por job | |
| | `ml_schedules` | automações (cron + tz + sobreposição + config) | UNIQUE key |
| | `ml_schedule_runs` | cada disparo e seu resultado | |
| Observabilidade | `ml_tasks` | pendências excepcionais | UNIQUE parcial dedupe_key (abertas) |
| | `ml_status_history` | toda transição de status | idx (entity_type, entity_id, created_at) |
| | `ml_feedback` | aprovações/descartes com motivo | |
| | `ml_audit_log` | alterações administrativas e decisões automáticas | idx created_at, entity |
| | `ml_api_calls` | chamadas externas (sem segredo) | idx created_at, provider |

## Funções

| Função | Quem chama | O que faz |
|---|---|---|
| `ml_role()`, `ml_has_role(min)` | RLS / app | papel efetivo do usuário logado |
| `ml_secret_set/get(name)` | service_role | Vault (`ml/<provider>/<campo>`) |
| `ml_integration_try_lock/unlock` | service_role | trava de refresh de token |
| `ml_claim_jobs(worker, limit, types)` | worker | claim atômico (SKIP LOCKED + advisory lock + concurrency_key) |
| `ml_reap_jobs()` | worker | devolve leases vencidos (ou dead-letter) |
| `ml_claim_due_schedules(limit)` | worker | agendamentos vencidos com trava curta |
| `ml_cron_tick()` | pg_cron `ml-worker-tick` | POST no worker do app |
| `ml_dashboard()` | páginas | contadores do dashboard |
| `ml_pins_filtrados`, `ml_analytics_summary`, `ml_analytics_breakdown`, `ml_faixa_preco` | páginas / COMPUTE_PERFORMANCE | analytics agregado no banco |

## Storage

Bucket `ml-media` (público, só PNG/JPEG/WEBP, 15 MB): `creatives/<creative_id>/<ts>-<rand>.<ext>` (imagens finais,
URL estável para o Pinterest) e `references/<creative_id>.<ext>` (referência do modo manual; limpa pelo job CLEANUP).
Sem policy de escrita para usuários: upload só pelo servidor, validado por magic bytes.
