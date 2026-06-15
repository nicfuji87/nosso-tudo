# PRD — Nosso Tudo
**Aplicativo SaaS de Controle Financeiro Familiar**

| Campo | Valor |
|---|---|
| **Produto** | Nosso Tudo |
| **Versão do documento** | 2.1 |
| **Data** | Maio de 2026 |
| **Autor** | Nicolas |
| **Status** | Em definição |

---

## 1. Visão e propósito

### 1.1 Resumo executivo
**Nosso Tudo** é um SaaS de controle financeiro familiar baseado em automação por agente de IA via WhatsApp e interface web/mobile completa. Famílias registram gastos, receitas e pedidos enviando mensagens, fotos, PDFs ou áudios pelo WhatsApp — ou cadastrando diretamente no app. Um agente de IA processa, categoriza e organiza automaticamente. Inclui ainda conciliação automática de faturas, dashboards visuais, planejamento de investimentos, metas, e um **assistente de IA conversacional** que responde dúvidas sobre as finanças da família (feature do plano pago).

### 1.2 Problema que resolve
Aplicativos financeiros tradicionais exigem disciplina diária de digitação. Dados ficam dispersos em faturas, mensagens, prints e papéis. Os modelos atuais não acomodam particularidades reais — como compras coletivas com ciclo longo, viagens com orçamento próprio, ou reformas. **Nosso Tudo** torna o controle financeiro um subproduto natural da conversa em família, com flexibilidade pra cada núcleo configurar o app à própria realidade.

### 1.3 Posicionamento de mercado
Concorrentes diretos: Mobills, Organizze, Wise Spending. **Diferenciais:**
- Captura natural via WhatsApp (texto, foto, áudio)
- Conciliação automática de fatura PDF
- **Categorias com comportamento configurável** (genéricas, projetos, compromissos) — adapta-se a qualquer necessidade
- Assistente de IA conversacional sobre as finanças
- Multi-usuário com membros sem acesso (crianças como entidades sem login)

### 1.4 Princípios norteadores
- **Captura sem fricção:** se exigir mais que mandar uma mensagem ou foto, fracassou.
- **Comodidade > exatidão imediata:** sistema age primeiro, pergunta depois — e só quando faz diferença.
- **Aprender com o uso:** cada confirmação do usuário treina o sistema (aliases, padrões).
- **Flexibilidade > opinião:** cada família configura suas categorias e comportamentos.
- **Decisão antes de detalhe:** dashboards respondem "como estamos?" antes de mostrar números.
- **Inteligência local:** o sistema aprende padrões da família e melhora com o uso.
- **Privacidade total:** dados ficam exclusivamente acessíveis à família.
- **Segurança desde o dia 1:** ver seção 7 — não é uma feature, é fundação.
- **LGPD nativa:** exportação e exclusão completa de dados embutidas.

---

## 2. Modelo de negócio

### 2.1 Planos

**Free**
- Preço: R$ 0
- Inclui anúncios discretos no app
- Limites:
  - 100 transações/mês
  - 1 cartão
  - 2 contas
  - 1 usuário com acesso (sem multi-membros)
  - 1 coleção ativa
  - 20 anexos/mês
- Features incluídas:
  - Lançamentos manuais via app
  - Categorias com comportamento
  - Recorrências (contas fixas)
- **NÃO inclui:** WhatsApp, IA chat, conciliação PDF, investimentos, relatórios avançados, exportação

**Pro**
- Preço sugerido: R$ 19,90/mês ou R$ 199/ano (~17% desconto)
- Sem anúncios
- Limites:
  - Tudo ilimitado
  - Até 6 membros com acesso por workspace
- Features inclusas:
  - Captura via WhatsApp (texto, imagem, PDF, áudio)
  - Assistente de IA conversacional
  - Conciliação automática de faturas PDF
  - Investimentos e metas
  - Relatórios avançados
  - Exportação completa de dados

### 2.2 Cobrança via Asaas

**Gateway escolhido:** [Asaas](https://www.asaas.com) — provedor brasileiro de pagamentos, ideal para SaaS em BRL.

**Razões da escolha:**
- Pix recorrente nativo (mais econômico que cartão pra cliente brasileiro)
- Boleto recorrente
- Cartão de crédito com tokenização (não armazenamos PAN)
- Emissão automática de nota fiscal (importante pra MEI/empresa)
- Webhooks robustos pra ciclo de assinatura
- Taxas competitivas vs Stripe internacional
- API REST simples

**Métodos de cobrança suportados:**
- Cartão de crédito (recorrente automático)
- Pix (com cobrança recorrente via QR code)
- Boleto bancário

**Fluxo de assinatura:**
1. Usuário escolhe plano + método na tela de upgrade
2. Backend cria customer no Asaas (se não existir) e subscription
3. Asaas gera primeira cobrança e retorna URL/QR Code
4. Usuário paga; Asaas envia webhook `PAYMENT_CONFIRMED`
5. Backend valida assinatura do webhook, marca pagamento como `confirmed`, atualiza workspace pra `active`
6. Cobranças subsequentes acontecem automaticamente conforme ciclo

**Eventos de webhook tratados:**
- `PAYMENT_CREATED` — nova cobrança gerada
- `PAYMENT_CONFIRMED` — pagamento aprovado
- `PAYMENT_RECEIVED` — dinheiro liberado
- `PAYMENT_OVERDUE` — atrasado (notifica usuário, pode mover pra `past_due`)
- `PAYMENT_REFUNDED` — estorno
- `SUBSCRIPTION_DELETED` — assinatura cancelada
- `PAYMENT_DELETED` — cobrança removida

**Segurança do webhook:**
- Endpoint exposto apenas via Edge Function dedicada
- Validação de IP de origem (whitelist Asaas)
- Validação de header `asaas-access-token`
- Idempotência por `asaas_event_id` (tabela `asaas_webhook_events`)
- Logs completos no audit

### 2.3 Estratégia de monetização
- Conversão Free → Pro principal via limitação progressiva
- Plano anual com desconto pra reduzir churn
- Anúncios no Free: não-intrusivos; idealmente parcerias com fintechs

### 2.4 Métricas-chave de negócio
- **MRR**, **Conversion Free → Pro** (alvo 5%/6m), **Churn mensal** (< 5%), **CAC**, **LTV**, **NPS** (> 50)

---

## 3. Usuários

### 3.1 Personas-tipo

**Nicolas, 39 — Tech-savvy mantenedor principal**
Quer visão estratégica, planejamento, conciliação automática.

**Bruna, 39 — Gestora cotidiana com particularidades**
Faz a maioria das compras. Participa de grupos de compra coletiva.

**Henrique, 12 — Membro sem acesso**
Tem mesada e cartão da escola. Aparece como entidade nas transações.

### 3.2 Papéis no sistema
- **Owner** — controla cobrança e exclusão.
- **Member** — acesso completo.
- **Entidade sem acesso** — crianças, dependentes.

---

## 4. Escopo

### 4.1 Dentro do escopo (V1)
- Auth (e-mail/senha + magic link + Google OAuth + MFA opcional)
- Onboarding com criação de workspace
- Categorias com comportamento (basico/projeto/compromisso)
- Coleções (instâncias de categorias com comportamento)
- CRUD completo via app
- Integração WhatsApp (Pro)
- Conciliação automática de fatura PDF (Pro)
- Dashboard e relatórios
- Assistente IA conversacional (Pro)
- Convites multi-membro (Pro)
- **Cobrança via Asaas** (Pix, Boleto, Cartão recorrente)
- Anúncios in-app para Free
- Exportação LGPD e exclusão de conta
- App web responsivo (mobile-first)
- Landing page comercial

### 4.2 Fora do escopo V1
- App nativo iOS/Android (web responsivo na V1)
- Integração Open Finance
- Importação de planilhas
- Modo offline

---

## 5. Requisitos funcionais

### 5.1 Autenticação e onboarding

**RF-001 — Cadastro**
E-mail + senha (com confirmação), Google OAuth, magic link. Captcha em produção (Cloudflare Turnstile).

**RF-002 — Onboarding**
Após cadastro: aceitar termos + LGPD → nome do workspace → sistema cria workspace + entidade "Casa" + copia categorias padrão → tutorial guiado.

**RF-003 — Login**
E-mail/senha, magic link, OAuth Google. Recuperação de senha. Rate limiting (5 tentativas / 15min).

**RF-004 — MFA opcional**
Pro pode ativar TOTP (Google Authenticator, Authy). Backup codes gerados ao ativar.

**RF-005 — Sessões**
- Token Supabase JWT com refresh de 7 dias
- Cookie httpOnly + secure + SameSite=Lax
- Lista de sessões ativas em Configurações; logout remoto por dispositivo

### 5.2 Workspace e membros
**RF-010 a RF-015** — Provisionamento, convites com token único de 7 dias, vínculo entidade-profile, crianças sem acesso, remoção de membro.

### 5.3 Cobrança via Asaas

**RF-020 — Checkout Asaas**
Botão "Assinar Pro" abre tela de seleção: método (Pix/Boleto/Cartão) + ciclo (mensal/anual). Backend cria customer + subscription no Asaas. Em caso de Pix/Boleto, exibe QR Code/linha digitável dentro do app. Em caso de cartão, formulário tokenizado (Asaas frontend SDK, dados nunca passam pelo nosso backend).

**RF-021 — Trial automático**
14 dias de Pro trial automaticamente. Após expirar volta a Free se não houver assinatura.

**RF-022 — Downgrade / cancelamento**
Cancelamento via Configurações → Cobrança → "Cancelar assinatura". Mantém Pro até `current_period_end`. Dados continuam acessíveis após downgrade, apenas limites Free são aplicados.

**RF-023 — Faturamento e recibos**
Histórico de pagamentos em Configurações → Cobrança → Histórico. Cada item mostra: data, valor, método, status, link pra nota fiscal/comprovante Asaas.

**RF-024 — Inadimplência**
Após 1 cobrança atrasada (status `overdue`): notificação no app + e-mail. Após 7 dias: workspace passa a `past_due`, features Pro continuam mas com aviso. Após 30 dias: downgrade automático pra Free.

**RF-025 — Troca de método**
Usuário pode trocar de Cartão pra Pix ou vice-versa a qualquer momento. Próximo ciclo usa o novo método.

### 5.4 Categorias com comportamento
**RF-030 a RF-035** — Inalterado vs v2.0. Templates padrão, criação custom com escolha de comportamento, coleções como instâncias, itens em coleções de compromisso, vínculo de transações.

### 5.5 Captura WhatsApp (Pro)
**RF-040 a RF-043** — Vinculação verificada de telefone, texto/imagem/PDF/áudio, confirmação no chat, armazenamento da mídia.

### 5.6 Lançamentos via app
**RF-050 a RF-053** — Lançamento completo, atalho rápido (FAB "+"), upload de comprovante no app, edição e exclusão com audit.

### 5.7 Faturas e conciliação (Pro)
**RF-060 a RF-063** — Importação PDF, algoritmo de matching, fila de revisão, pagamento de fatura gerando transferência.

### 5.8 Dashboard e relatórios
**RF-070 a RF-074** — Home, telas de área, relatórios (Pro), filtros globais, busca.

### 5.9 Assistente IA (Pro)
**RF-080 a RF-084** — Chat conversacional, tool use com queries read-only seguras, contexto persistente, cota mensal, privacidade total.

### 5.10 Recorrências, investimentos, metas, orçamentos
**RF-090 a RF-099** — Escopados por workspace, features condicionais ao plano.

### 5.11 Anúncios (Free)
**RF-100 a RF-102** — Posicionamentos discretos, configurados pelo admin, sem ads invasivos.

### 5.12 LGPD
**RF-110 — Exportação completa.** Botão em Configurações → Privacidade gera ZIP (JSON + anexos) e envia link de download por e-mail (válido 24h).
**RF-111 — Exclusão de conta.** Owner pode excluir workspace. Confirmação dupla (modal + e-mail de confirmação com link). Soft delete por 30 dias (período de arrependimento) + hard delete permanente após.
**RF-112 — Termos e privacidade versionados.** Aceite explícito no cadastro. Mudanças exigem novo aceite.
**RF-113 — Direito de retificação.** Todo usuário pode editar seus próprios dados (nome, e-mail, telefone, etc).
**RF-114 — DPO/contato.** Página pública com canal de contato pra dúvidas LGPD.

### 5.13 Inteligência de Conciliação e Inbox de Revisão

> **Problema que resolve:** quando a IA processa uma nota fiscal, mensagem ou foto, ela extrai textos crus que podem ser variações de algo já existente — "deterg limpeza" pode ser o mesmo "Detergente Ypê" cadastrado antes. Sem inteligência, o banco vira um lixão de duplicatas. Mas pedir aprovação pra cada item destrói a comodidade. A solução é **inteligência em camadas com fricção mínima**.

#### Conceito: Sugestão Inteligente com Confirmação Fluida

O sistema sempre tenta resolver matches automaticamente. Só envolve o usuário quando há **dúvida produtiva** (zona cinza). Resultado: o usuário aprova pouco, mas o que aprova ensina o sistema pra sempre.

**RF-120 — Estratégia de matching em 4 camadas (em ordem)**

Quando um agente (WhatsApp ou app) extrai um nome de estabelecimento, produto, categoria ou entidade:

1. **Match exato normalizado** — comparação lowercase, sem acento, sem pontuação
2. **Match por alias** — busca em `apelidos[]` da entidade existente
3. **Match por código de barras** (apenas produtos) — match definitivo se EAN/GTIN disponível
4. **Match por similaridade** — usa `pg_trgm` (função `similarity()` do Postgres) sobre nome normalizado e apelidos

Para cada match candidato, calcula-se um **score de confiança (0.00 a 1.00)**.

**RF-121 — Ação por nível de confiança**

| Score | Ação | Visibilidade pro usuário |
|---|---|---|
| **≥ 0.95** | **Auto-vincula** ao existente | Discreta — aparece "↔ vinculado a X" no item; reversível em 1 clique |
| **0.60 – 0.94** | Cria registro com flag `sugerido` e abre **sugestão no Inbox** | Card "É o mesmo que X?" com botões Sim / Não / Editar |
| **< 0.60** | Cria registro **novo** com flag `novo` | Sem fricção; aparece na fila "Novos itens" do Inbox pra eventual ajuste |

Thresholds configuráveis por workspace (Configurações → Avançado → IA).

**RF-122 — Aprendizado automático**

Quando usuário confirma uma sugestão como "é o mesmo":
- Sistema adiciona o `texto_origem` aos `apelidos[]` do registro existente
- Próxima vez que aquele texto aparecer, será **match exato por alias** (score = 1.00, auto-vinculado)
- Reaponta transações vinculadas ao duplicado
- Apaga o duplicado

Quando usuário marca "é diferente":
- Mantém ambos como independentes
- Marca o novo como `confirmado` (não pergunta de novo)

Implementado via função SQL `confirmar_match(sugestao_id, decisao)` (ver `schema.sql`).

**RF-123 — Inbox de Revisão**

Tela única e centralizada que reúne tudo que precisa atenção do usuário:

- **Sugestões de match pendentes** — "deterg limpeza → Detergente Ypê? Sim/Não/Editar"
- **Transações novas a confirmar** — quando a IA criou algo com baixa confiança
- **Itens de fatura sem match automático** — substitui a antiga "fila pendente_revisao"
- **Novos estabelecimentos/produtos criados** — pra eventual ajuste de nome/categoria

Cada item tem ações rápidas (sem precisar abrir tela detalhada). Estilo: cards arrastáveis ou lista com botões inline. Acesso via badge numerado no menu principal.

Backend: view `v_inbox_revisao` consolida itens das diferentes fontes (transações, sugestões, faturas).

**RF-124 — Confirmação no WhatsApp**

O agente confirma apenas o **essencial** no WhatsApp, sem inundar o usuário:

- "✅ Anotei: R$ 287,40 no Pão de Açúcar (5 itens). Detalhes no app."
- Se houver alta confiança em tudo: não pergunta nada
- Se houver sugestões pendentes: termina com "ℹ️ 2 itens pra você revisar no app quando puder"
- Apenas em casos de ambiguidade alta (ex: cartão não identificado), pergunta inline: "Qual cartão? Itaú ou Nubank?"

**RF-125 — Modo de detalhamento**

Em Configurações → IA, usuário escolhe:

- **Modo simples** (default Free) — captura apenas a transação como um todo. Não cria produtos individuais. Estabelecimentos sim.
- **Modo detalhado** (default Pro, opt-out) — para notas fiscais, extrai cada item individualmente, popula `produtos` e `itens_transacao`.

Quem só quer saber "gastei R$ 287 no mercado" não tem fricção. Quem quer rastrear preço do mesmo arroz entre mercados, ativa.

**RF-126 — Reversibilidade**

Toda decisão automática (≥ 0.95) é reversível:
- Item mostra ícone discreto "↔ vinculado a X"
- 1 clique abre opção "Desvincular" ou "Vincular a outro"
- Histórico de matches fica no `audit_log` pra auditoria

**RF-127 — Configuração de privacidade**

Em Configurações → IA → Privacidade: usuário pode desativar coleta de aliases ("não aprenda com minhas correções"). Padrão: ativado.

#### Aplicação por tipo de entidade

| Entidade | Quando aplica | Onde armazena alias |
|---|---|---|
| **Estabelecimento** | Toda transação com `estabelecimento_id` | `estabelecimentos.apelidos[]` |
| **Produto** | Modo detalhado, ao extrair itens de nota | `produtos.apelidos[]` |
| **Categoria** | Quando user cria categoria nova com nome similar a existente | (sem aliases — sugere fusão na hora) |
| **Entidade (pessoa/grupo)** | Quando agente menciona "para Bruna" e existe "Bruna Lima" | (sem aliases — sugere fusão) |

#### Métricas a acompanhar (qualidade do matching)

- **Taxa de auto-match** (alvo: > 70% após 30 dias de uso da família)
- **Taxa de aprovação de sugestões** (se < 50%, threshold está muito baixo)
- **Taxa de rejeição** (se > 30%, threshold está muito alto)
- **Tempo médio até confirmar um item no Inbox** (alvo: < 10s)
- **Tamanho médio do Inbox** (alvo: < 5 itens pendentes)

---

## 6. Requisitos não-funcionais

### 6.1 Performance
- Home em < 2s em 4G
- Conciliação de 100 itens em < 30s
- Filtros em < 500ms (com índices apropriados)
- Time-to-interactive da landing < 1.5s

### 6.2 Disponibilidade
- 99,5% uptime
- Backup diário automático (Supabase point-in-time recovery)
- Realtime sync via Supabase channels

### 6.3 Escalabilidade
- Suportar 10k workspaces ativos no primeiro ano
- Suportar 100k transações/mês por workspace sem degradação
- Edge Functions stateless e horizontalmente escaláveis

### 6.4 Internacionalização
- V1: somente pt-BR
- Estrutura preparada pra i18n futuro (chaves de tradução, formatação por locale)

### 6.5 Acessibilidade
- WCAG AA mínimo
- Suporte a leitores de tela (ARIA labels)
- Contraste adequado (claro e escuro)
- Navegação por teclado em todos os componentes

---

## 7. Segurança (FUNDAÇÃO DO PRODUTO)

> Segurança não é uma feature opcional. É um **requisito não-negociável** desde o primeiro commit. Esta seção é referenciada em toda a arquitetura e processo.

### 7.1 Princípios de segurança

1. **Defesa em profundidade** — múltiplas camadas (WAF → Auth → RLS → validação no código → audit)
2. **Privilégio mínimo** — cada componente acessa só o necessário
3. **Falha segura** — se algo dá errado, nega acesso por padrão
4. **Zero trust** — toda requisição é validada, mesmo internas
5. **Tudo é auditável** — mudanças em dados sensíveis sempre logadas
6. **Não armazenar o que não precisa** — sem PAN de cartão, sem CPF (a não ser do owner pra Asaas), sem dados sensíveis em logs

### 7.2 Autenticação e autorização

**SR-001 — Senhas fortes**
- Mínimo 10 caracteres, mistura de tipos
- Hash via bcrypt (custo 12+) — Supabase Auth gerencia
- Bloqueio após 5 tentativas falhas em 15min (rate_limits)

**SR-002 — MFA**
- Opcional pra Free, **recomendado pra Pro** (incentivar)
- TOTP padrão (RFC 6238)
- Backup codes (10 códigos one-time)
- Obrigatório pra ações críticas (exclusão de workspace, exportação completa)

**SR-003 — Tokens e sessões**
- JWT Supabase com expiração curta (1h access token + 7d refresh)
- Refresh rotation a cada uso
- Logout invalida refresh token
- Sessões listáveis em Configurações; usuário pode encerrar remotamente

**SR-004 — OAuth**
- Apenas Google na V1 (mais escrutínio sobre Apple/Microsoft depois)
- Scopes mínimos: email + profile básico
- State + PKCE em todos os fluxos

**SR-005 — Row Level Security (RLS) em TODAS as tabelas**
- Sem exceção. Toda tabela com dado de usuário tem RLS ativo
- Policies isolam por `workspace_id IN user_workspaces()`
- Tabelas administrativas (rate_limits, webhook_events) acessíveis apenas via service_role

### 7.3 Proteção de dados

**SR-010 — Criptografia em trânsito**
- HTTPS obrigatório em toda a aplicação (TLS 1.3)
- HSTS habilitado
- Certificados gerenciados (Vercel/Supabase)

**SR-011 — Criptografia em repouso**
- Postgres com encryption at rest (Supabase default)
- Storage com criptografia AES-256 (Supabase default)
- Backups criptografados

**SR-012 — Não armazenamos dados de cartão**
- Tokenização total via Asaas (PCI compliance é deles)
- Frontend usa SDK Asaas que envia dados direto pra eles
- Nosso backend nunca vê PAN, CVV ou validade
- Apenas armazenamos `asaas_payment_method_id` (token opaco)

**SR-013 — Dados sensíveis em mídias**
- Buckets `notas-fiscais` e `faturas-pdf` privados (sem URL pública)
- Acesso via signed URLs com expiração de 1h
- Validação de workspace_id antes de gerar URL

**SR-014 — Pseudonimização em logs**
- Logs aplicacionais nunca contêm: senhas, tokens, CPF, dados de cartão
- E-mails parcialmente mascarados em logs (`n***@gmail.com`)
- Telefones parcialmente mascarados

### 7.4 Validação e sanitização

**SR-020 — Validação no servidor**
- **Toda entrada validada no backend**, mesmo que validada no frontend
- Schemas Zod compartilhados entre frontend e Edge Functions (reuso, ver seção 8)
- Rejeição com 400 + mensagem clara em validação falha

**SR-021 — Prevenção de SQL Injection**
- Apenas queries parametrizadas (Supabase client + RPCs)
- Nunca concatenar strings em SQL dinâmico
- Tool use da IA usa apenas funções RPC pré-aprovadas (não SQL livre)

**SR-022 — XSS**
- React escapa por padrão; `dangerouslySetInnerHTML` proibido sem revisão
- Content Security Policy (CSP) estrita configurada nos headers
- Sanitização de markdown em chat IA (sanitize-html)

**SR-023 — CSRF**
- SameSite=Lax em cookies de sessão
- Tokens de submit em formulários sensíveis
- Verificação de Origin/Referer em mutations

**SR-024 — Upload de arquivos**
- Whitelist de tipos: image/jpeg, image/png, image/webp, application/pdf, audio/*
- Limite de tamanho: 10MB por arquivo
- Scan antivírus em uploads (ClamAV via Edge Function ou serviço dedicado)
- Renomeação para UUID (não usar nome original como path)
- Validação de magic bytes (não confiar em mime do header)

### 7.5 Proteção contra abuso

**SR-030 — Rate limiting**
Tabela `rate_limits` controla, por identificador + tipo:
- Login: 5 tentativas / 15min por IP+email
- Magic link / reset senha: 3 por hora por e-mail
- Cadastro: 3 por hora por IP
- Verificação WhatsApp: 5 por hora por telefone
- IA chat: cota mensal por workspace + 30 msgs/hora antiabuso
- Exportação de dados: 1 por hora por workspace
- API geral: 100 req/min por profile (autenticado), 20 req/min por IP (não autenticado)

**SR-031 — Captcha**
- Cloudflare Turnstile em: cadastro, login após 3 falhas, recuperação de senha
- Score mínimo de 0.7

**SR-032 — Bot detection**
- User-Agent suspeito → captcha
- Comportamento anômalo (10+ requests em 1s) → bloqueio temporário

### 7.6 Webhooks e integrações

**SR-040 — Webhooks Asaas**
- Endpoint dedicado e isolado (Edge Function `asaas-webhook`)
- Validação de header `asaas-access-token` (segredo configurado no Asaas)
- Whitelist de IPs Asaas (fornecidos na docs deles)
- Idempotência por `asaas_event_id` (não processar duplicatas)
- Sempre logar em `asaas_webhook_events` antes de processar
- Falhas registradas com erro completo pra investigação

**SR-041 — Integração WhatsApp**
- Agente externo se autentica via API key dedicada (rotacionável)
- Verificação de assinatura HMAC em cada chamada
- Payload validado contra schema Zod compartilhado

### 7.7 Auditoria e observabilidade

**SR-050 — Audit log de dados**
Tabela `audit_log` registra:
- Mudanças em transações (antes/depois)
- Mudanças em cartões, contas, recorrências
- Quem fez, quando, de onde

**SR-051 — Audit log de acesso**
Tabela `audit_log_acesso` registra:
- Logins (sucesso e falha)
- Habilitação/desabilitação de MFA
- Exportações de dados
- Exclusões de workspace
- Mudanças de e-mail

**SR-052 — Monitoramento**
- Sentry pra captura de erros
- PostHog pra analytics (com opt-out e respeito a Do Not Track)
- Alertas configurados pra:
  - Spike de erros 500
  - Aumento em falhas de login (possível ataque)
  - Webhooks Asaas falhando consistentemente
  - Edge Function tempo > 10s

**SR-053 — Logs estruturados**
- JSON estruturado com correlation IDs
- Nunca logar PII em nível INFO
- Retenção de 90 dias

### 7.8 Processo de desenvolvimento seguro

**SR-060 — Code review obrigatório**
Toda PR exige revisão antes de merge na main.

**SR-061 — Análise estática**
- ESLint com regras de segurança (eslint-plugin-security)
- TypeScript strict mode
- Detecção de secrets (GitGuardian ou similar)

**SR-062 — Dependências**
- Dependabot ativo no GitHub
- Audit de vulnerabilidades a cada PR (`npm audit` no CI)
- Snyk ou similar pra dependências críticas

**SR-063 — Secrets management**
- Nunca commitar `.env` ou chaves
- Vercel/Supabase environment variables
- Rotação periódica de API keys (Asaas, OpenAI, etc) — a cada 6 meses
- Chaves diferentes por ambiente (dev/staging/prod)

**SR-064 — Testes de segurança**
- Antes do lançamento público: pentest externo (recomendado)
- Testes automatizados pra RLS (não posso acessar workspace alheio?)
- Testes pra cada policy

### 7.9 Resposta a incidentes

**SR-070 — Plano de resposta**
- Procedimento documentado pra: vazamento, comprometimento de credencial, indisponibilidade
- Comunicação transparente com usuários afetados em até 72h (LGPD)
- DPO designado

**SR-071 — Backups e recovery**
- RPO (Recovery Point Objective): 1 hora
- RTO (Recovery Time Objective): 4 horas
- Teste de restore trimestral

---

## 8. Diretrizes de engenharia (DESENVOLVIMENTO SUSTENTÁVEL)

> O código que escrevemos hoje, vamos manter por anos. Investir em qualidade desde o início é mais barato que refatorar depois.

### 8.1 Princípios fundamentais

1. **Reutilização sobre duplicação (DRY)** — se algo aparece 2x ou tem chance de aparecer, vira função/componente/módulo
2. **Composição sobre herança** — preferir compor pequenos blocos a hierarquias complexas
3. **Convenção sobre configuração** — escolhas padrão claras, configuração só quando necessário
4. **Explícito sobre implícito** — código deve ser legível por quem chega novo
5. **Tipagem rigorosa** — TypeScript strict, sem `any`, tipos compartilhados entre frontend e backend
6. **Testes onde dói perder** — auth, RLS, conciliação, cobrança, IA tools

### 8.2 Estrutura de pastas (monorepo Next.js)

```
nosso-tudo/
├── apps/
│   ├── web/                    # Next.js app (frontend + API routes)
│   │   ├── app/                # App Router
│   │   │   ├── (marketing)/    # Landing pública
│   │   │   ├── (auth)/         # Login/cadastro
│   │   │   ├── (app)/          # App autenticado
│   │   │   └── api/            # Routes (preferir Edge Functions Supabase quando der)
│   │   ├── components/         # Componentes React (ver 8.3)
│   │   ├── lib/                # Utils e helpers do frontend
│   │   └── styles/             # Tailwind config + globals
│   └── functions/              # Supabase Edge Functions
│       ├── processar-transacao/
│       ├── conciliar-fatura/
│       ├── ia-chat/
│       ├── asaas-webhook/
│       └── exportar-dados/
├── packages/                   # Código compartilhado (REUTILIZAÇÃO)
│   ├── ui/                     # Design system: componentes base reutilizáveis
│   ├── schemas/                # Zod schemas compartilhados (validação)
│   ├── types/                  # TypeScript types compartilhados
│   ├── utils/                  # Funções utilitárias puras (formatação, datas, etc)
│   ├── db/                     # Cliente Supabase + queries reutilizáveis
│   └── config/                 # Constantes, enums (refletem o schema SQL)
├── supabase/
│   ├── migrations/             # SQL versionado
│   ├── seed.sql
│   └── config.toml
└── docs/                       # PRD, ADRs, design system
```

### 8.3 Reuso em UI (component library)

**Hierarquia de componentes:**

1. **Primitivos** (`packages/ui/primitives/`) — wrappers minimalistas do shadcn/ui customizados com tokens do design system
   - `Button`, `Input`, `Select`, `Dialog`, `Sheet`, `Card`, `Pill`, `Avatar`
   - **Regra:** se um primitivo precisar de variante nova, adiciona variante ao primitivo, não cria componente novo
2. **Compostos** (`packages/ui/composites/`) — combinações reutilizáveis em múltiplas telas
   - `MoneyInput`, `DatePicker`, `CategoryPicker`, `EntityPicker`, `CardSlot`
   - `TransactionListItem`, `CategoryBadge`, `CollectionCard`
3. **Patterns** (`packages/ui/patterns/`) — padrões maiores
   - `EmptyState`, `PageHeader`, `StatsTile`, `Chart` wrappers
4. **Pages** (`apps/web/app/`) — específicas, composição dos blocos acima

**Anti-padrões:**
- ❌ Componente "DashboardCard" e "ReportCard" que fazem a mesma coisa com 2 nomes
- ❌ Estilização inline repetida em vez de variante de Button
- ❌ Lógica de formatação de moeda em 5 lugares diferentes
- ✅ `<Button variant="ghost" size="sm">` reutilizado em qualquer tela
- ✅ `formatBRL(valor)` em `packages/utils/money.ts` importado por tudo

### 8.4 Reuso em lógica (hooks e queries)

**Hooks customizados** (`apps/web/lib/hooks/`):
- `useCurrentWorkspace()` — workspace ativo + role do usuário
- `useTransactions(filters)` — lista de transações com filtros
- `useCategoria(id)` — categoria com cache
- `usePlan()` — plano + features + limites do workspace atual
- `useCanUseFeature(feature)` — verifica se workspace pode usar (gating)
- `useToast()` — notifications

**Queries reutilizáveis** (`packages/db/queries/`):
- Funções tipadas que encapsulam `supabase.from(...)`
- Ex: `getTransacoes({ workspaceId, filters })` retorna `Transacao[]`
- Frontend e Edge Functions importam as **mesmas** funções
- Mudou o schema? Atualiza num lugar só.

### 8.5 Reuso em validação (schemas Zod)

`packages/schemas/` contém schemas que validam **tanto no frontend quanto no backend**:

```ts
// packages/schemas/transacao.ts
export const transacaoCreateSchema = z.object({
  descricao: z.string().min(1).max(255),
  valor: z.number().positive(),
  data_transacao: z.date(),
  categoria_id: z.string().uuid().optional(),
  // ...
});
export type TransacaoCreateInput = z.infer<typeof transacaoCreateSchema>;
```

- Frontend usa em formulários (react-hook-form + zodResolver)
- Edge Function usa pra validar payload recebido
- TypeScript types derivados automaticamente
- **Uma única fonte de verdade**

### 8.6 Reuso em tipos (TypeScript)

`packages/types/`:
- Tipos gerados automaticamente do schema Supabase (`supabase gen types`)
- Tipos derivados (DTOs, view models)
- Enums espelhando os ENUMs do Postgres

Todo `comportamento_categoria` do banco vira `ComportamentoCategoria` no TS, usado em todo lugar.

### 8.7 Reuso em estilos (design system)

Documentado em `design-system.md`:
- Tokens CSS via Tailwind config customizado
- **Nunca cores hardcoded em componentes** — sempre `bg-primary`, `text-ink-primary`
- Tipografia via classes Tailwind customizadas (`text-display-lg`, `text-h2`)
- Sombras como utility classes (`shadow-card`, `shadow-elevated`)

### 8.8 Reuso entre frontend e Edge Functions

Edge Functions importam do `packages/`:
- Mesmos schemas Zod
- Mesmas queries do `packages/db/`
- Mesmos types
- Mesmas constantes (`packages/config/`)

Resultado: lógica de negócio centralizada, não duplicada.

### 8.9 Convenções de código

- **Nomenclatura:** português pra domínio (transacoes, entidades, colecoes), inglês pra técnico (handleSubmit, useEffect)
- **Arquivos:** kebab-case (`transacao-form.tsx`)
- **Componentes:** PascalCase (`TransacaoForm`)
- **Hooks:** camelCase com `use*` prefix
- **Constantes:** UPPER_SNAKE_CASE
- **Comentários:** apenas quando o "porquê" não é óbvio. Código limpo > comentários.

### 8.10 Testes

- **Unit:** funções puras em `packages/utils/`, schemas Zod
- **Integration:** RPCs do Supabase, Edge Functions (Vitest)
- **E2E:** fluxos críticos com Playwright (login, criar transação, upgrade pra Pro)
- **RLS tests:** Vitest com cliente Supabase de outro user, verifica que não acessa dado alheio
- **Cobertura mínima:** 70% em código de domínio crítico

### 8.11 Documentação técnica

- **README.md** por package/app explicando responsabilidade
- **ADRs** (Architecture Decision Records) pra escolhas relevantes em `docs/adr/`
- **JSDoc** em funções públicas de packages compartilhados
- **Storybook** (futuro) pros componentes do `packages/ui/`

### 8.12 CI/CD

- **PR:** lint + type-check + testes + security audit
- **Merge na main:** deploy automático em staging
- **Tag de versão:** deploy em produção
- **Rollback:** previews da Vercel permitem reverter em 1 clique

---

## 9. Arquitetura

### 9.1 Stack
- **Backend / DB:** Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)
- **Agente IA WhatsApp:** Serviço separado (já existe)
- **Assistente IA Chat:** Edge Function chamando Anthropic Claude (haiku)
- **Frontend:** Next.js 14+ (App Router) + Tailwind + shadcn/ui customizado
- **Gráficos:** Recharts
- **Hospedagem frontend:** Vercel
- **Cobrança:** **Asaas** (Pix, Boleto, Cartão recorrente)
- **E-mails transacionais:** Resend
- **Analytics:** PostHog (privacidade-first, opt-out)
- **Monitoramento:** Sentry
- **Captcha:** Cloudflare Turnstile

### 9.2 Edge Functions
- `processar-transacao` — recebe JSON do agente, resolve nomes, cria registros
- `conciliar-fatura` — algoritmo de matching
- `gerar-recorrencias` — cron diário
- `ia-chat` — endpoint do assistente IA
- `asaas-webhook` — recebe e processa eventos de cobrança
- `criar-cobranca-asaas` — cria customer/subscription/cobrança
- `exportar-dados` — gera ZIP/JSON LGPD

### 9.3 Storage buckets
- `notas-fiscais` — privado, signed URLs com expiração
- `faturas-pdf` — privado
- `avatars` — público (com transformações via Supabase)

### 9.4 Diagrama lógico (texto)

```
[Web/Mobile App]
       │
       ├──────────────► [Supabase Auth] ──► [auth.users]
       │
       ├──────────────► [Supabase DB] (RLS habilitado)
       │
       ├──────────────► [Edge Functions]
       │                   ├──► [Asaas API] (cobrança)
       │                   ├──► [Anthropic API] (IA chat)
       │                   └──► [Resend] (e-mails)
       │
       └──────────────► [Supabase Storage] (signed URLs)

[WhatsApp Agent] ──► [Edge: processar-transacao] ──► [DB]

[Asaas] ──► [Edge: asaas-webhook] ──► [DB: pagamentos + workspaces]
```

---

## 10. Fluxos principais

### 10.1 Onboarding novo usuário
1. Acessa landing → "Criar conta grátis"
2. Cadastro (e-mail + senha ou Google)
3. Confirma e-mail
4. Aceita termos + privacidade
5. Define nome do workspace
6. Sistema cria workspace + categorias padrão + entidade "Casa"
7. Tutorial guiado curto
8. Home

### 10.2 Upgrade Free → Pro via Asaas
1. Usuário em Configurações → Plano → "Assinar Pro"
2. Tela de escolha: ciclo (mensal/anual) + método (Pix/Boleto/Cartão)
3. Backend:
   - Cria customer Asaas (se inexistente)
   - Cria subscription Asaas com método escolhido
   - Salva `asaas_customer_id` e `asaas_subscription_id` no workspace
4. Asaas retorna primeira cobrança:
   - **Cartão:** se aprovado na hora, status `confirmed` imediato; senão pendente
   - **Pix:** retorna QR Code, app exibe inline
   - **Boleto:** retorna URL e linha digitável
5. Usuário paga
6. Asaas envia webhook `PAYMENT_CONFIRMED`
7. Edge Function:
   - Valida assinatura do webhook
   - Verifica idempotência (`asaas_event_id`)
   - Atualiza `pagamentos.status = 'confirmed'`
   - Atualiza `workspaces.subscription_status = 'active'` e `current_period_end`
   - Loga em `audit_log_acesso`
8. Próxima visita do user: app reconhece Pro, libera features

### 10.3 Inadimplência
1. Cobrança vence sem pagamento
2. Asaas webhook `PAYMENT_OVERDUE`
3. Workspace recebe banner de aviso, e-mail enviado
4. Após 7 dias: `subscription_status = 'past_due'`
5. Após 30 dias: downgrade automático pra `free`, e-mail final
6. Dados permanecem; só limites Free aplicam

### 10.4 Criar categoria com comportamento
1. Menu → Categorias → Nova
2. Nome, ícone, cor
3. Comportamento: `basico` / `projeto` / `compromisso`
4. Salva
5. Se `projeto` ou `compromisso`, agora pode criar coleções dentro

### 10.5 WhatsApp → transação (com inteligência de match)
1. Membro manda foto/áudio/texto
2. Agente identifica telefone → workspace + profile (via `whatsapp_routing`)
3. Verifica plano Pro
4. Processa, extrai dados (estabelecimento, valor, itens se modo detalhado)
5. Chama Edge Function `processar-transacao` (com HMAC):
   - Para cada nome extraído (estabelecimento/produto), executa `buscar_match_*()`
   - Score ≥ 0.95: vincula automático
   - Score 0.6-0.94: cria registro com `status_revisao = 'sugerido'` + insere em `sugestoes_match`
   - Score < 0.6 ou sem match: cria novo
6. Mídia armazenada com referência à transação
7. Resposta de confirmação concisa no WhatsApp:
   - "✅ Anotei: R$ 287,40 no Pão de Açúcar"
   - Se houver sugestões: "ℹ️ 2 itens pra revisar no app"
8. App reflete em tempo real (Realtime channel); Inbox de Revisão mostra badge

### 10.7 Confirmação de sugestão no Inbox
1. User abre Inbox de Revisão (badge mostra "3")
2. Vê card: "'deterg limpeza' parece ser 'Detergente Ypê Neutro 500ml' (você comprou semana passada). É o mesmo?"
3. User clica "Sim, é o mesmo"
4. Backend chama `confirmar_match(sugestao_id, 'mesmo')`:
   - Adiciona "deterg limpeza" aos `apelidos[]` do produto existente
   - Reaponta itens de transação ao produto correto
   - Apaga o produto duplicado
   - Marca sugestão como resolvida
5. Próxima vez que "deterg limpeza" aparecer, será match exato (score 1.00) e auto-vinculado
6. Inbox atualiza, contador diminui

### 10.6 Chat IA
1. User abre tela "Pergunte ao Nosso Tudo"
2. Digita pergunta
3. Edge Function `ia-chat`:
   - Verifica plano Pro
   - Verifica cota
   - Chama Claude com sistema prompt + tools disponíveis (queries RPC read-only)
   - IA usa tools, recebe dados, formula resposta
   - Salva mensagens em `mensagens_ia`
4. Resposta aparece no chat com gráficos inline quando aplicável

---

## 11. Design e identidade visual

Dois documentos complementares:

- **[`identidade-visual.md`](identidade-visual.md)** — Manual de marca: símbolo, logotipo, paleta oficial, tipografia, estilo fotográfico e direção criativa.
- **[`design-system.md`](design-system.md)** — Tokens, componentes, espaçamentos e diretrizes de implementação técnica do UI.

**Paleta oficial da marca:** Grafite Profundo `#111315`, Off White `#F7F6F2`, Verde Sálvia `#8FA993`, Azul Petróleo `#3D6D84`, Azul Grafite `#1E2A3B`.

**Tipografia:** Geist ou Inter Tight (geométrica, moderna, sem serifas).

**Direção:** inspirada em Apple, Linear e Arc Browser — muito espaço em branco, poucas cores, hierarquia clara, animações sutis. A interface deve parecer um produto premium de tecnologia, não uma planilha financeira.

**Princípios:** mobile-first, hierarquia tipográfica forte, espaço em branco generoso, cores funcionais discretas, componentes reutilizáveis com tokens (zero cor hardcoded).

---

## 12. Roadmap

### Fase 0 — Fundação (3-4 semanas)
- Setup monorepo + estrutura de packages
- Schema completo no Supabase + RLS
- Auth + onboarding
- Provisionamento de workspace
- **Design system implementado** (tokens, primitivos, compostos)
- **Testes de RLS automatizados**
- Landing page comercial

### Fase 1 — Lançamentos básicos (3-4 semanas)
- CRUD de cartões, contas, entidades, categorias
- Lançamento manual via app
- Lista e edição de transações
- Recorrências
- Home básica
- **Audit log funcionando**

### Fase 2 — Coleções e dashboard (3 semanas)
- Coleções (projeto + compromisso)
- Itens de coleção
- Dashboard com gráficos
- Filtros globais

### Fase 3 — WhatsApp e conciliação (4 semanas)
- Integração com agente WhatsApp
- Verificação de telefone
- Conciliação automática de faturas
- **Sistema de sugestão de match (estabelecimentos)** — funções `buscar_match_*`, criação automática com flag de revisão
- **Inbox de Revisão v1** (sugestões + faturas pendentes unificadas)
- Fila de revisão

### Fase 4 — IA chat, modo detalhado e relatórios avançados (3 semanas)
- Assistente IA conversacional
- **Modo detalhado: extração de produtos individuais em notas fiscais**
- **Aprendizado por aliases** (`confirmar_match` automatizando aprendizado)
- Relatórios completos (incluindo "preço médio do produto X entre estabelecimentos")
- Investimentos e metas

### Fase 5 — Cobrança e produção (3 semanas)
- **Integração Asaas (customer + subscription + webhooks)**
- Tela de cobrança e histórico
- Anúncios in-app
- LGPD (exportação/exclusão)
- Convites multi-membro
- **MFA opcional**
- **Pentest externo**

### Fase 6 — Beta privado (2 semanas)
- 10-20 famílias beta testers
- Monitoramento ativo
- Ajustes

### Fase 7 — Lançamento público
- Landing pronta
- Marketing inicial
- Suporte estruturado

---

## 13. Métricas de sucesso

### 13.1 Produto
- DAU/MAU > 40%
- Taxa de conciliação automática > 80%
- < 15% das transações precisam de correção
- NPS > 50

### 13.2 Negócio
- 1.000 workspaces no primeiro semestre
- 50 workspaces Pro (5% conversão)
- MRR R$ 1.000 no fim do semestre 1
- Churn mensal < 5%

### 13.3 Técnico e segurança
- Uptime > 99,5%
- p95 carregamento < 2s
- **0 vazamentos de dados**
- **0 falhas críticas de RLS em audit**
- 100% das Edge Functions com rate limiting
- Cobertura de testes > 70% em domínio crítico

---

## 14. Riscos

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| Conversão Free→Pro abaixo do esperado | Alto | Médio | Limites estratégicos; valor claro do WhatsApp+IA; trial generoso |
| Agente IA falha em classificar | Alto | Médio | Feedback humano; correção fácil; aprendizado contínuo |
| PDFs de bancos diferentes quebram | Alto | Alto | Parser por banco; fallback manual; lista de bancos suportados |
| Custos de IA explodem | Médio | Médio | Modelo leve (haiku); cota mensal; cache |
| **Vazamento de dados** | **Crítico** | **Baixo** | **RLS rigoroso, MFA, audit, pentests, treinamento** |
| Custos Supabase escalam | Médio | Médio | Self-hosted ou enterprise quando justificar |
| Anunciantes não chegam | Médio | Médio | Backup: parcerias afiliadas |
| Concorrência responde rápido | Médio | Alto | Diferenciais únicos difíceis de copiar |
| **Falha de conformidade LGPD** | **Crítico** | **Baixo** | **Compliance dia 1; DPO; exportação/exclusão prontas** |
| **Asaas indisponível em momento de cobrança** | Médio | Baixo | Retry com backoff; fila de cobranças pendentes; alerta |
| **Webhook Asaas comprometido** | Alto | Baixo | Validação IP + token + idempotência |

---

## 15. Glossário

- **Workspace** — Unidade de uma família/grupo no SaaS.
- **Member** — Usuário com profile e acesso.
- **Entidade** — Pessoa ou grupo dentro do workspace.
- **Comportamento de categoria** — Tipo de estrutura: básico, projeto, compromisso.
- **Coleção** — Instância de categoria com comportamento não-básico.
- **Conciliação** — Match entre transação manual e lançamento de fatura.
- **Inbox de Revisão** — Tela única com sugestões, novos itens e itens pendentes.
- **Sugestão de match** — IA propõe que dois registros são o mesmo (ex: "deterg limpeza" = "Detergente Ypê").
- **Alias** — Apelido aprendido pelo sistema após confirmação de match. Vira match automático no futuro.
- **Score de confiança** — Número 0-1 que mede similaridade entre nomes; define ação automática vs sugestão.
- **Modo detalhado** — Configuração que faz a IA extrair itens individuais de notas fiscais.
- **MRR** — Receita Recorrente Mensal.
- **Churn** — Taxa de cancelamento.
- **RLS** — Row Level Security do Postgres/Supabase.
- **DRY** — Don't Repeat Yourself.
- **LGPD** — Lei Geral de Proteção de Dados.
- **DPO** — Data Protection Officer.
- **MFA / TOTP** — Multi-Factor Authentication / Time-based One-Time Password.
- **PCI DSS** — Payment Card Industry Data Security Standard (gerenciado pelo Asaas).
- **CSP** — Content Security Policy.

---

## 16. Próximos passos imediatos

1. ✅ Validar PRD v2.1
2. ⬜ Criar conta Asaas (sandbox) e obter API keys
3. ⬜ Executar `schema.sql` no Supabase (instância nova ou migrar)
4. ⬜ Configurar buckets de storage com policies
5. ⬜ Setup do monorepo conforme seção 8.2
6. ⬜ Definir tokens Tailwind a partir do `design-system.md`
7. ⬜ Implementar primitivos do design system em `packages/ui/`
8. ⬜ Configurar Sentry, PostHog, Turnstile
9. ⬜ Iniciar Fase 0: auth + onboarding + landing
10. ⬜ Setup CI/CD (lint + types + tests + security audit)
11. ⬜ Definir DPO e processo de resposta a incidentes
12. ⬜ Pentest a contratar antes de Fase 7

---

*Documento vivo — sujeito a revisões conforme o produto evolui.*
