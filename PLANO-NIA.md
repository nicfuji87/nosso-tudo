# Plano — Nia, a assistente de IA do Nosso Tudo

> Detalha o assistente conversacional **Nia** (exclusivo do plano **Pro**): chat super interativo com UI generativa, ferramentas tipadas sob o RLS do usuário, console de super admin (uso de tokens, análise conversacional, prompt + LLM configuráveis) e persistência total no Supabase.
>
> Expande a **Fase 4** do [PLANO-DESENVOLVIMENTO.md](PLANO-DESENVOLVIMENTO.md). Referências: [PRD-Nosso-Tudo.md](PRD-Nosso-Tudo.md), [design-system.md](design-system.md), [identidade-visual.md](identidade-visual.md), [schema.sql](schema.sql), [contrato WhatsApp](docs/integracoes/whatsapp-contrato.md).
>
> **Data:** 15/06/2026 · **Status:** proposta inicial

---

## 1. O que a Nia é (e o que ela não é)

A Nia é a **interface conversacional do motor de confirmação que o app já tem**. Ela não substitui as telas — conversa, sugere, entende a rotina da família e **propõe** ações (cadastros, lançamentos, organização). Nada é executado sem o aval do usuário, e tudo acontece **dentro do chat**, com componentes clicáveis.

- **Sempre ativa** para o usuário autenticado, **restrita aos dados do próprio workspace**.
- **Exclusiva do Pro** (gating por `workspaces.plan_id` / `subscription_status`).
- **Um cérebro, duas superfícies:** as mesmas ferramentas servem o chat in-app e o pipeline do WhatsApp.

### 1.1 Princípios inquebráveis (fundação de segurança)

| # | Princípio |
|---|---|
| P1 | A Nia roda **sob a sessão RLS do usuário** — nunca `service_role` para tocar dados do usuário. |
| P2 | O LLM **nunca escreve no banco direto**. Só chama **ferramentas tipadas** (Zod) que batem nas Server Actions já validadas. **Zero SQL livre gerado por IA.** |
| P3 | Conteúdo vindo dos dados (nome de loja numa nota, texto de outro membro) é **dado, nunca instrução** — defesa contra prompt injection. |
| P4 | **Catálogo fixo de widgets**. O modelo escolhe um widget do catálogo e preenche o schema; o front renderiza componentes React confiáveis. Nunca `dangerouslySetInnerHTML` sobre saída do modelo. |
| P5 | **Tudo auditável**: toda proposta e toda execução da Nia ficam gravadas no Supabase. |
| P6 | **Confiança graduada** (§3): o que é corriqueiro flui; o que é estrutural ou destrutivo confirma. |
| P7 | **LGPD desde o início**: consentimento específico da Nia; transcrições contêm dado financeiro e têm retenção/expurgo e acesso governado. |

---

## 2. Arquitetura

```
Cliente (Pro)                Runtime da Nia                 Dados
┌──────────────┐   stream   ┌────────────────────────┐    ┌──────────────┐
│ useChat +    │◀──────────▶│ Route Handler (Vercel)  │    │ Supabase     │
│ catálogo de  │  widgets   │ - lê nia_config (prompt,│    │ (RLS do      │
│ widgets      │            │   provedor, modelo)     │    │  usuário)    │
│ (React)      │   result   │ - AI SDK provider-agnos.│    │              │
└──────┬───────┘            │ - define tools (Zod)    │    └──────▲───────┘
       │ confirma/edita     │ - loga tokens/uso/audit │           │
       └───────────────────▶│ - tools → Server Actions├───────────┘
                            └────────────┬───────────┘  sessão do usuário
                                         │
                              segredos (API keys) lidos
                              de integration_settings (server-side)
```

- **Runtime:** **Next.js Route Handler** em `apps/web/src/app/api/nia/route.ts`, com **Vercel AI SDK** (`streamText` + `tools` + streaming de UI generativa). Escolhido por ser onde a UI generativa + `useChat` funcionam melhor e por ser **provider-agnóstico** nativo.
- **Provider-agnóstico (requisito):** adapters `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral` (+ OpenRouter como gateway opcional para ampliar a lista). O agente roda com **um** LLM por vez, mas o **super admin escolhe qual** em runtime, lendo `nia_config` — sem deploy. As **ferramentas são escritas uma vez** (Zod) e funcionam em qualquer modelo que suporte tool-calling; só o adapter troca.
- **Tools sob RLS:** cada ferramenta chama as queries/Server Actions de `src/lib/db` usando o **cliente Supabase da sessão do usuário** (P1). As API keys dos provedores são lidas server-side de `integration_settings` (padrão já existente, só `service_role`) **apenas para a chamada ao LLM** — nunca para tocar dados do usuário.
- **Onde cada confirmação mora:**
  - **In-app (chat):** a conferência é a própria conversa. Transações criadas no chat nascem `status_revisao = 'confirmado'`; a zona cinza de match (0.60–0.94) vira **pergunta inline** (widget `resolver_match`), não vai para a Pré-conferência.
  - **WhatsApp:** segue como está — captura de alta confiança vira `confirmado`, e a zona cinza abre **sugestão na Pré-conferência** (`sugestoes_match` / Inbox).
  - Implicação de engenharia: `resolverEstabelecimento`/`resolverProduto` ganham **dois modos de saída** — `modo: 'inbox'` (WhatsApp) e `modo: 'inline'` (chat).

---

## 3. Confiança graduada

> **Política adotada (DN3, 15/06/2026):** ações de **alta confiança** executam direto com **desfazer**; ações **estruturais e destrutivas sempre confirmam** antes.

Cada ferramenta declara um `nivel_confirmacao`, e o runtime o aplica:

| Nível | Ações | Comportamento no chat |
|---|---|---|
| `auto` | ler, sugerir, consultar gastos | executa direto (read-only); sem fricção |
| `auto_desfazer` | lançar gasto corriqueiro de alta confiança | executa e mostra card **"feito ✓ · desfazer"** (janela de undo) |
| `confirmar` | lançar com itens, escolher cartão/conta, atualizar compromisso | renderiza widget e **espera o toque** |
| `confirmar_estrutural` | criar/editar pessoa, conta, cartão, categoria | **sempre confirma** (raro, alto impacto) |
| `confirmar_forte` | excluir, mudança em massa | confirma **+ fricção extra** (re-digitar, dupla etapa) |

- **Undo** = `nia_acoes.status = 'desfeita'` + reversão da mutação (soft-delete/void da transação dentro da janela).
- O usuário pode **pré-autorizar** ("a Nia pode lançar meus gastos do dia a dia sozinha") → eleva certos `confirmar` para `auto_desfazer`, gravado em `nia_contexto`.

---

## 4. Catálogo de widgets ↔ ferramentas

O modelo nunca desenha layout livre: escolhe **um item deste catálogo** e preenche o schema.

| Widget | Ferramenta (Zod) | Nível | Quando aparece |
|---|---|---|---|
| `confirmar_transacao` | `lancar_transacao` | confirmar / auto_desfazer | gasto/receita avulso |
| `checklist_itens` | `lancar_transacao_detalhada` | confirmar | nota com várias linhas (incluir/excluir item) |
| `resolver_match` | `confirmar_match` | confirmar | zona cinza 0.60–0.94 (estab./produto) |
| `criar_pessoa` | `criar_entidade` | confirmar_estrutural | "a Bruna não está cadastrada" |
| `escolher_meio` | (parte do lançamento) | confirmar | qual cartão/conta foi usado |
| `gerir_compromisso` | `criar_colecao` / `atualizar_compromisso` | confirmar | compra coletiva da Bruna (status aberto→recebido→pago) |
| `criar_projeto` | `criar_colecao` (projeto) | confirmar | viagem/reforma |
| `resumo_periodo` | `consultar_gastos` | auto | "quanto gastei em junho?" (gráfico/tabela, read-only) |
| `form_dinamico` | varia | conforme alvo | preencher campos faltantes (apenas campos tipados) |
| `confirmar_destrutivo` | `excluir_*` | confirmar_forte | exclusão/edição em massa |

**Loop de resultado:** o widget **não escreve no banco**. Ao confirmar/editar, devolve à Nia um envelope estruturado:

```jsonc
{ "widget": "checklist_itens", "acao": "confirmar", "dados": { "itens_incluidos": [1,2,4], "itens_removidos": [3] } }
```

A Nia então chama a Server Action validada → grava → confirma na conversa. Mesma espinha **propõe → confirma → executa**.

---

## 5. Modelo de dados (tudo no Supabase)

Novas tabelas (prefixo `nia_`), todas com `workspace_id` e RLS por `user_workspaces()`, exceto as de configuração/preço (acesso só `service_role` + super admin). DDL completo na migration; abaixo, as colunas essenciais.

### Histórico do cliente
- **`conversas_ia`** *(reusada do schema)* — `id, workspace_id, profile_id, titulo, contexto jsonb, arquivada, timestamps`.
- **`mensagens_ia`** *(reusada + estendida)* — já tinha `papel, conteudo, ferramentas_usadas, tokens_input, tokens_output, modelo`; a migration 0007 adiciona `provedor, custo_estimado, latencia_ms, widgets jsonb`. **(fonte do uso de tokens e do custo)**
- **`nia_acoes`** *(audit log, P5)* — `id, conversa_id, mensagem_id, workspace_id, profile_id, ferramenta, nivel_confirmacao, payload_proposto jsonb, status (proposta|confirmada|executada|rejeitada|desfeita), resultado jsonb, confianca, criado_em, confirmado_em`.
- **`nia_contexto`** *(memória da família, cacheada no prompt)* — `workspace_id (PK), fatos jsonb, rotina jsonb, preferencias jsonb, pre_autorizacoes jsonb, atualizado_em`.
- **`nia_feedback`** — `id, mensagem_id, workspace_id, profile_id, voto (positivo|negativo), comentario, criado_em`.

### Configuração do super admin (só `service_role` + `isPlatformAdmin`)
- **`nia_config`** *(versionada)* — `id, escopo (global|tier|workspace), escopo_ref, system_prompt, provedor, modelo, parametros jsonb (temperature, max_tokens…), ativo, versao, criado_por, criado_em`. Permite **trocar prompt/provedor/modelo sem deploy** e **fazer rollback**. Um registro `ativo` por escopo (global é o default; tier/workspace sobrescrevem).
- **`nia_precos`** *(custo não-hardcoded)* — `provedor, modelo, preco_entrada_por_milhao, preco_saida_por_milhao, vigente_desde`. Custo = tokens × preço.
- **`nia_insights`** *(análise conversacional, §6.2)* — `id, conversa_id, workspace_id, intents text[], resolvida bool, turnos, ferramentas_usadas text[], houve_fallback bool, satisfacao, custo_total, gerado_em`.

### Views / rollups
- **`v_nia_uso_usuario`** e **`v_nia_uso_workspace`** — agregam `nia_mensagens` por dia (tokens in/out, custo, nº de conversas). Para escala, rollup diário `nia_uso_diario` via cron.
- **`nia_cotas`** — cota mensal de tokens por workspace Pro (limite + consumo); o runtime barra/avisa ao estourar (RF-080).

---

## 6. Console de Super Admin (`/app/admin/nia`)

Tudo gated por `isPlatformAdmin` (padrão já existente). Quatro abas:

### 6.1 Uso de tokens por usuário
- Tabela por **usuário** e por **workspace**: tokens entrada/saída, nº de mensagens, **custo estimado** (via `nia_precos`), tendência no período.
- Consumo vs. **cota** do plano; alertas de quem está próximo do teto.
- Fonte: `v_nia_uso_*` (lidas via `service_role` no server action do admin).

### 6.2 Análise conversacional (para aprimorar a Nia)
- **Painel de intents:** o que as pessoas mais pedem; **taxa de resolução**; **turnos médios** até concluir; **widgets/ferramentas mais usados**; **custo por intent**.
- **Clusters de falha:** onde a Nia pediu esclarecimento demais, errou de ferramenta, ou a conversa foi abandonada → fila de **"conversas que precisam de atenção"** (baixa satisfação / `houve_fallback`).
- **Feedback 👍/👎** por mensagem (`nia_feedback`) cruzado com intent.
- **Como é gerado:** Edge Function noturna **`nia-analise`** roda sobre conversas novas, classifica intent/desfecho e grava `nia_insights`. (Opcional: espelhar eventos no PostHog, que vocês já usam, para funis.)

### 6.3 Configuração do agente
- **Editor do system prompt** (versionado em `nia_config`) com histórico e **rollback**.
- **Seleção de provedor + modelo + parâmetros** (temperature, max_tokens), por **escopo** (global / por tier de plano / por workspace para testes/A-B). É aqui que "escolho a LLM que eu quiser" vira realidade — sem ficar preso a Claude ou OpenAI.
- **Playground** para testar prompt+modelo antes de ativar (sem afetar usuários).
- **Segredos (API keys por provedor)** ficam em `integration_settings` (só `service_role`), no mesmo padrão do Asaas/WhatsApp; editáveis só por `isPlatformAdmin`.
- **Auditoria:** quem mudou prompt/modelo e quando (gravado).

### 6.4 Histórico do cliente
- Leitura de transcrições (`nia_conversas`/`nia_mensagens`) para suporte/depuração — **acesso governado, logado e divulgado na política de privacidade** (contém dado financeiro; ver §8).

---

## 7. Onboarding: ensinar primeiro, depois fazer para sempre

- **Onboarding inicial = ensinar a mexer** (finito, uma vez): substitui/reforça as 3 telas atuais; resolve o "comprei e não sei usar".
- **Handoff:** o tour termina entregando o usuário à Nia — *"a partir de agora, é só falar comigo aqui"*.
- **Nia contínua = fazer sempre:** cadastra pessoas, lança, organiza, sugere — pelo chat, com confiança graduada. O "onboarding" nunca termina; vira a Nia.

---

## 8. Segurança, LGPD e custo

- **Anti prompt-injection:** ferramentas tipadas + allowlist de tools + validação do schema de saída + conteúdo-dos-dados tratado como dado (P2–P4). Sem SQL livre.
- **RLS:** Nia escreve/lê só sob a sessão do usuário; super admin acessa transcrições via `service_role` com **acesso registrado** e mínimo necessário.
- **LGPD:** consentimento **específico da Nia** no onboarding ("a IA do Pro lê seus dados financeiros para te ajudar"); **retenção/expurgo** de transcrições (definir janela); **redação de PII** nos logs/analytics; transcrições entram na exportação/exclusão de dados (RF-110/111).
- **Custo:** modelo barato/rápido para o grosso (ex.: `claude-haiku-4-5`), escala para um modelo forte só no complexo; **prompt caching** do system prompt + `nia_contexto`; **cota mensal por workspace**; teto e telemetria de custo no admin (§6.1).

---

## 8b. Estado da implementação — Nia-0 (entregue)

Fatia vertical que exercita toda a arquitetura (RLS, ferramenta tipada, widget, persistência de tokens), com type-check e lint verdes. Provider-agnóstico via adaptador HTTP (zero dependência npm nova).

**Backend**
- `supabase/migrations/0007_nia_core.sql` — estende `mensagens_ia`; cria `nia_acoes`, `nia_contexto`, `nia_config`, `nia_precos`; views `v_nia_uso_usuario` / `v_nia_uso_workspace`; seeds (config global + preços placeholder). **Ainda não aplicada ao banco** (revisar antes).
- `lib/nia/schemas.ts` — Zod das ferramentas + catálogo de widgets (compartilhado com o cliente).
- `lib/nia/tools.ts` — `consultar_gastos` (`auto`), `lancar_transacao`, `criar_pessoa` (`confirmar_estrutural`), `criar_compromisso` (caso Bruna), `lembrar_fato` (memória da família).
- `lib/nia/admin.ts` — leituras do console (uso por usuário, insights, config) + `saveNiaConfig` versionado.
- `lib/nia/store.ts` — persistência sob RLS (conversa/mensagem/`nia_acoes`).
- `lib/nia/config.ts` — lê `nia_config`/secret/preço via service_role; calcula custo.
- `lib/nia/provider.ts` — interface agnóstica + adaptador **anthropic** (fetch, loop de tool-use). OpenAI/Google = novo entry no registro.
- `app/api/nia/route.ts` — gating Pro (bypass para platform admin), orquestra o provedor, grava tokens/custo/latência.
- `app/app/nia/actions.ts` — confirma/rejeita a proposta (executa `criarTransacao` no confirm).

**Frontend**
- `components/nia/nia-chat.tsx` — chat com widgets `resumo_periodo`, `confirmar_transacao` (com **desfazer**), `criar_pessoa`, `criar_compromisso`; **feedback 👍/👎** por mensagem.
- `app/app/nia/page.tsx` — gated; upsell para não-Pro.
- Link "Nia" no menu (sidebar + topbar), visível só para Pro/admin.

**Super admin** (`/app/admin/nia`, só platform admin)
- Aba "Nia (IA)" em Integrações — grava a API key do provedor.
- Console: **uso de tokens/custo por usuário** (views `v_nia_uso_*`) + **editor de prompt/provedor/modelo versionado** (`nia_config`, cada save = nova versão, rollback-friendly) — `lib/nia/admin.ts`, `components/admin/nia-console.tsx`.

**Já entregue além da fundação:** cota mensal; injeção de `nia_contexto`; feedback 👍/👎 + análise conversacional; **adaptador OpenAI** (Chat Completions, incl. GPT-5/raciocínio) + gestão de preços por modelo; **ferramentas de leitura** (`consultar_cadastros`, `listar_transacoes`) e **de cadastro** (`criar_categoria/conta/cartao`); **prompt caching da Anthropic**; **streaming token-a-token (OpenAI e Anthropic)**; **`resolver_match` inline** (zona cinza de estabelecimento resolvida no chat, com aprendizado de apelido); **multimodal** (imagem + PDF nativos no Claude, áudio via Whisper; anexos no histórico via `midias` + bucket `nia-anexos`); **gravar áudio direto no chat**; **multi-turn** (janela recente de 10 msgs + perfil do cliente via `lembrar_fato`/`nia_contexto`); **retenção inteligente de mídia** (áudio fica pela transcrição; **imagem e PDF** só ficam se a Nia marcar como documento via `guardar_documento` — foto de pessoa ou doc pessoal é descartado); **metas e orçamentos** (a Nia planeja: `criar_meta`/`criar_orcamento` + leitura com gasto vs planejado); **foto da nota → itens** (`lancar_transacao_detalhada` + checklist item a item → `itens_transacao`); **alertas proativos in-app** (a Nia abre o chat com avisos de saldo/orçamento/cartão — `getAlertas`, determinístico, sem LLM); modelo padrão **claude-sonnet-4-6**; migrations 0007–0010 aplicadas ✓. Tudo em produção.

**Catálogo de widgets completo.** Próximos passos são *além* do catálogo: adaptador Google/Gemini (mesma interface); onboarding guiado (tour → handoff para a Nia); retenção/expurgo de transcrições (LGPD); ativar streaming caso surjam novos provedores.

## 9. Faseamento (encaixa após a Fase 3 do plano principal)

| Etapa | Entregável | DoD |
|---|---|---|
| **Nia-0 — Fundação** | tabelas `nia_*`; route handler com AI SDK (1 provedor); 2–3 tools read-only + 1 write com `confirmar`; streaming; gravação de mensagens/tokens | conversar e lançar 1 gasto pelo chat, sob RLS, com tokens logados |
| **Nia-1 — Chat interativo** | catálogo de widgets completo; confiança graduada + undo; `nia_contexto`; match em modo inline | checklist de nota + criar pessoa + resolver match funcionando no chat |
| **Nia-2 — Super admin (config)** | console `/app/admin/nia`: uso de tokens; editor de prompt versionado; **seleção provider/modelo provider-agnóstica**; playground | trocar prompt e modelo sem deploy; ver custo por usuário |
| **Nia-3 — Análise + governança** | `nia-analise` + `nia_insights`; feedback 👍/👎; cotas; LGPD (consentimento, retenção, exportação) | painel de intents/falhas no ar; cota barrando estouro; transcrições na exportação |
| **Nia-4 — Onboarding + Coleções** | tour inicial + handoff; widgets de compromisso/projeto (caso Bruna) | nova família é guiada e cadastrada pela Nia; pedido coletivo gerido pelo chat |

---

## 10. Decisões a confirmar

| # | Decisão | Recomendação |
|---|---|---|
| DN1 | Abstração provider-agnóstica | **Vercel AI SDK** (tools uma vez, troca de adapter); OpenRouter como gateway opcional |
| DN2 | Runtime | **Route Handler no Next/Vercel** (UI generativa + `useChat`), tools sob RLS do usuário |
| DN3 ✅ | Corriqueiro: auto+desfazer vs. confirmar sempre | **DECIDIDO (15/06/2026): auto + desfazer** para alta confiança; estrutural/destrutivo sempre confirma |
| DN4 | Retenção de transcrições | definir janela (ex.: 12 meses) + expurgo; entra na exportação/exclusão LGPD |
| DN5 | Acesso admin às transcrições | mínimo necessário, logado, divulgado na política |
| DN6 | Modelo default por tier | barato no grosso + escalonar; admin ajusta em `nia_config` |

---

## 11. Requisitos (estilo PRD)

- **RF-Nia-200** Chat da Nia exclusivo do Pro, restrito ao workspace do usuário.
- **RF-Nia-201** UI generativa com catálogo fixo de widgets ↔ ferramentas tipadas.
- **RF-Nia-202** Confiança graduada com undo para ações corriqueiras.
- **RF-Nia-203** Memória de contexto da família (`nia_contexto`) cacheada no prompt.
- **RF-Nia-210** Super admin: uso de tokens e custo por usuário/workspace.
- **RF-Nia-211** Super admin: análise conversacional (intents, resolução, falhas, feedback).
- **RF-Nia-212** Super admin: editor de system prompt versionado com rollback.
- **RF-Nia-213** Super admin: seleção provider-agnóstica de LLM/modelo/parâmetros por escopo.
- **RF-Nia-214** Persistência no Supabase de todo histórico e configuração.
- **SR-Nia-220** Nia opera sob RLS do usuário; sem `service_role` em dados do usuário.
- **SR-Nia-221** Sem SQL livre; só ferramentas tipadas com allowlist.
- **SR-Nia-222** Auditoria de toda proposta/execução (`nia_acoes`) e de mudanças de config.
- **SR-Nia-223** Consentimento específico da Nia + retenção/expurgo de transcrições (LGPD).
- **SR-Nia-224** Cota mensal por workspace + telemetria de custo.

---

*Documento vivo — atualizar conforme a Nia evolui.*
