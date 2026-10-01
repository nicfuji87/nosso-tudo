# Módulo ML — Afiliados Mercado Livre × Pinterest

Painel operacional privado em **`/ml`** que descobre produtos com potencial no Mercado Livre, pontua com
explicação, gera conteúdo e criativos, publica/agenda Pins com link de afiliado, mede e aprende — deixando
para o humano só o que não tem API (link de afiliado, imagem manual opcional, aprovações conforme o nível de automação).

| Documento | Para quê |
|---|---|
| [`../../PLANO-ML.md`](../../PLANO-ML.md) | Plano por fases, riscos, inconsistências, registro do que foi feito |
| [ARQUITETURA.md](./ARQUITETURA.md) | Camadas, fila/worker, agendador, pipeline, segurança |
| [DECISOES.md](./DECISOES.md) | ADRs (ADR-ML-001…) |
| [BANCO.md](./BANCO.md) | Tabelas `ml_*`, funções, storage |
| [OPERACAO.md](./OPERACAO.md) | **Setup**, variáveis, primeiro uso, checklist de produção, operação diária |
| [REFERENCIAS-APIS.md](./REFERENCIAS-APIS.md) | O que verificamos das APIs (ML, Pinterest, OpenAI, Apify) |
| [UI.md](./UI.md) | Convenções de interface do módulo |

Código: `apps/web/src/lib/ml` (domínio, serviços, jobs, integrações), `apps/web/src/app/ml` (páginas e actions),
`apps/web/src/app/api/ml` (worker e OAuth), `apps/web/src/components/ml` (UI). Testes: `pnpm test` em `apps/web`.
