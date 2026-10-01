# ML — Decisões arquiteturais (ADR)

Formato curto: contexto → decisão → consequência. Acrescente no fim; não reescreva decisões antigas
(marque como "substituída por ADR-ML-0XX").

### ADR-ML-001 — Módulo dentro do Nosso Tudo, isolado por namespace
**Contexto:** o objetivo pede reaproveitar a infraestrutura (Next.js, Supabase, Auth, Vercel) sem afetar o produto atual.
**Decisão:** rotas `/ml/*` com layout próprio; código em `lib/ml`, `components/ml`, `app/ml`, `app/api/ml`; tabelas `ml_*`.
A única alteração em código existente é incluir `/ml` nas rotas protegidas do middleware.
**Consequência:** mesmo login/deploy; nenhuma tela do Nosso Tudo muda. Extrair para app próprio no futuro é mover pastas.

### ADR-ML-002 — Operação única, acesso por papel (não por workspace)
**Contexto:** a spec descreve um painel operacional privado ("MVP pode ter apenas owner/admin"). O Nosso Tudo é multi-workspace familiar.
**Decisão:** dados do ML não têm `workspace_id`. Acesso via `ml_members` (viewer/operator/admin/owner); platform admins são owner implícitos (`ml_role()`).
**Consequência:** simples e seguro para a operação atual. Multi-operação exigiria adicionar `operation_id` às tabelas.

### ADR-ML-003 — Segredos no Supabase Vault
**Contexto:** spec §2.1/§24 exige segredos cifrados e configuráveis pelo painel; `integration_settings` existente guarda em jsonb claro.
**Decisão:** tokens e chaves em `vault.secrets` (`ml/<provider>/<campo>`), acessados só por RPC `service_role`. `ml_integrations` guarda apenas estado e máscara.
**Consequência:** nada de `.env` para integrações; o segredo do worker também nasce no Vault (zero configuração manual).

### ADR-ML-004 — Escrita só pelo servidor; RLS só de leitura
**Contexto:** defesa em profundidade + validação server-side de transições.
**Decisão:** policies `SELECT` por papel em todas as `ml_*`; nenhuma policy de escrita. Server actions autorizam (`requireMlAction`) e escrevem com service_role; jobs idem.
**Consequência:** o browser não consegue escrever nem com a anon key + sessão. Toda regra fica num só lugar (serviços).

### ADR-ML-005 — Fila em Postgres + worker HTTP disparado por pg_cron
**Contexto:** Vercel não tem processo contínuo; spec pede fila, retries, idempotência e scheduler próprio; sem n8n.
**Alternativas:** Vercel Cron (exige env var/redeploy p/ mudar), BullMQ/Redis (infra nova), Supabase Queues (pgmq, sem lease/concurrency key prontos).
**Decisão:** `ml_jobs` + `ml_claim_jobs()` (SKIP LOCKED) + lease/reaper; pg_cron chama `/api/ml/worker` 1×/min via pg_net. Agendamentos de negócio ficam em `ml_schedules` (cron+tz) e são avaliados pelo worker.
**Consequência:** horários editáveis sem deploy; sem infra nova. Latência mínima ~1 min (mitigada pelo "chute" após ações do usuário).

### ADR-ML-006 — Status textual + CHECK (sem ENUM)
**Decisão:** `text` + `CHECK`. Evita `ALTER TYPE ... ADD VALUE` (não roda em transação) e facilita evoluir estados.

### ADR-ML-007 — Status pós-aprovação derivado
**Contexto:** produto pode ter vários criativos e Pins; manter o status "na mão" diverge fácil.
**Decisão:** após aprovado, o status é recalculado por `derivarStatusProduto` sempre que link/criativo/Pin muda; transições continuam validadas e registradas.

### ADR-ML-008 — Pendências de fluxo derivadas, pendências excepcionais em tabela
**Decisão:** a Central de Pendências lê links faltando / criativos em revisão / imagens manuais / produtos a aprovar **direto do status** das entidades; `ml_tasks` só guarda exceções (publicação bloqueada, auth, configuração, job morto).
**Consequência:** nada para sincronizar; uma pendência some sozinha quando a entidade avança.

### ADR-ML-009 — Descoberta só por fontes oficiais; Apify complementar
**Contexto:** busca pública do ML está bloqueada (2025–26); leitura de itens de terceiros pode dar 403.
**Decisão:** descoberta = `/highlights` (top 20 por categoria) + `/trends`. Enriquecimento: `/products/{id}` (buy box) → `/items` → `/reviews`; 403 vira "dado indisponível" (não falha o job). Apify só preenche lacunas quando configurado.

### ADR-ML-010 — Dado faltante entra neutro no score
**Decisão:** fator sem dado = 50 e listado em `missing_data`; `confidence` = fração do peso com dado real. Pesos versionados em `ml_scoring_versions`; performance observada é fator separado (peso 0 até haver volume).

### ADR-ML-011 — Quatro modos de imagem, fluxo único depois do asset
**Decisão:** `api` (OpenAI), `manual_chatgpt` (prompt + referência + upload), `upload` e `composition` (foto real + layout + texto, renderizado com `next/og`, sem IA e sem custo). Todos terminam num `ml_creative_assets`; o resto do fluxo não sabe a origem.
**Padrão:** `api`; sem OpenAI configurada, "Gerar criativos" cai no modo manual ChatGPT (spec §8). O modo
`composition` pode ser escolhido como padrão em Configurações › Criativos para automação total sem custo de IA.
**Consequência:** o app funciona ponta a ponta sem IA paga (composição) e sem depender do método de imagem.

### ADR-ML-012 — Copy com IA opcional e fallback determinístico
**Decisão:** com OpenAI: Responses API + JSON Schema strict + validação Zod + guardrails (limites do Pinterest, disclosure, termos proibidos). Sem OpenAI: templates por ângulo usando só dados reais do produto. Saída da IA nunca é publicada sem passar pelos guardrails.

### ADR-ML-013 — Pinterest: ambiente por integração (produção | sandbox)
**Contexto:** apps em Trial só publicam no sandbox, e analytics não existe no sandbox.
**Decisão:** `ml_integrations.config.environment` escolhe a base URL; Pins guardam o `environment` em que foram criados; a coleta de métricas só roda para Pins de produção.

### ADR-ML-014 — Idempotência de publicação
**Decisão:** Pin tem `idempotency_key` próprio; `PUBLISH_PIN` relê o Pin, sai se já há `external_pin_id`, marca `publishing` antes de chamar a API e grava o id logo após. Retry após falha ambígua (timeout) consulta os Pins recentes do board pelo link antes de criar outro.

### ADR-ML-015 — Comissões por importação
**Contexto:** o programa de afiliados do ML não tem API de relatórios.
**Decisão:** `ml_commissions` alimentada por formulário/CSV; Analytics mostra receita, receita/Pin e EPC quando houver dado.
