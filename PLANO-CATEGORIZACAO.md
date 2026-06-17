# Plano — Categorização item a item + Contexto/Evento

> Status: **TODAS AS 6 FASES IMPLEMENTADAS** (jun/2026, branch `feat/categorizacao-item`).
> Objetivo: evoluir a categorização "uma categoria por transação" para **categoria por item**
> + **contexto/evento por compra**, sem aumentar o atrito. Base da proposta do Nicolas
> (saída restaurante+cinema, mercado item a item).
>
> | Fase | Entrega | Migration/Deploy |
> |---|---|---|
> | 1 ✅ | categoria/essencialidade/tipo no item + defaults | `0012` |
> | 2 ✅ | gastos_por_categoria_v2 + gastos_por_essencialidade | `0013` |
> | 3 ✅ | tabela contextos + gastos_por_contexto | `0014` |
> | 4 ✅ | padrão canônico (153 cat) + sync_categorias_canonicas | `0015` |
> | 5 ✅ | IA classifica na ingestão + memória do produto | `0016` + edge v3 |
> | 6 ✅ | UI: itens expansíveis, painel essencial×supérfluo, eventos | app |
>
> Validado ponta a ponta no exemplo restaurante+cinema (pipoca→Alimentação fora,
> ingresso→Lazer, estacionamento→Transporte, contexto Passeio em família, total 356 reconciliado).
> **Pendente:** push da branch + merge na main (deploy Vercel). Edição inline de categoria/
> essencialidade por item na UI é o próximo polimento natural (hoje a UI mostra; edição é via IA/ingest).

## 1. Diagnóstico do que já existe

O banco (`supabase/migrations/0001_initial_schema.sql`) já tem boa parte da fundação:

- `categorias` — **hierárquica** via `categoria_pai_id` → já suporta *Categoria → Subcategoria*.
- `colecoes` + `transacoes.colecao_id` — instâncias de `comportamento` projeto/compromisso
  (viagem, festa). É o embrião do "contexto/evento", mas **pesado** (workflow, status de entrega).
- `itens_transacao` — **já itemiza** a nota e liga em `produtos`. Criado no ingest do WhatsApp
  (`supabase/functions/ingest-whatsapp/index.ts`, passo 7b).
- `produtos.categoria_sugerida_id` — catálogo que aprende a categoria de cada produto.
- `transacoes.tags[]`, `estabelecimento_id`, `meio_pagamento`, `data_transacao` — presentes.
- `sugestoes_match` + `v_inbox_revisao` — dedupe/aprendizado ("banana" = "banana") já existe.

### Furos (gaps) frente à proposta

| Gap | Hoje | Impacto |
|---|---|---|
| **Item sem categoria própria** | `itens_transacao` não tem `categoria_id`; transação tem **1** categoria | **Crítico** — mercado vira "Alimentação" inteiro. É o ponto central da proposta. |
| **Essencialidade** | não existe | Alto — perde a visão essencial × supérfluo |
| **Contexto leve** | só `colecoes` (pesada) ou `tags[]` (solta) | Médio — falta o "por quê" da compra |
| **Tipo do item** (Refeição/Bebida) | não existe | Baixo — útil, mas explode a árvore; adiar |
| **Pessoa por item** | só na transação (pagador/beneficiário) | Baixo — over-engineering p/ v1 |
| **Relatório por item** | `gastos_por_categoria` soma pela transação | Crítico — precisa somar pelo item quando itemizado |
| **Taxonomia rasa** | seed com ~13 categorias + ~15 subcats | Médio — conteúdo, separável do schema |

## 2. Princípios de design (inegociáveis)

1. **A IA classifica, o humano confirma.** Todo campo novo tem default e é opcional. Lançar
   "R$50 mercado" sem itemizar continua válido.
2. **O produto é a memória.** Classificou um produto uma vez → todos os itens futuros herdam
   categoria + essencialidade. É isso que derruba o atrito. (`produtos` vira fonte de verdade.)
3. **Categoria responde "o quê", Contexto responde "por quê".** Dimensões ortogonais. Manter.
4. **Sem contagem dupla.** Regra única de relatório: *transação itemizada → soma pelos itens;
   não itemizada → cai na `transacoes.categoria_id`.*
5. **Cortar o que rende pouco.** "Tipo do item" e "pessoa por item" ficam fora do v1.

## 3. Modelo proposto (decisões)

### 3.1 Categoria por item — `itens_transacao`
Adicionar:
- `categoria_id UUID REFERENCES categorias(id)` — categoria do item (subcategoria, na prática).
- `essencialidade essencialidade` (enum novo) — default herdado do produto/categoria.
- `contexto_id UUID REFERENCES contextos(id)` — opcional (ver 3.3).

A `transacoes.categoria_id` **continua existindo** como "categoria dominante" (a maior fatia da
nota) — útil pra listagem rápida e fallback de relatório.

### 3.2 Essencialidade (enum novo)
```sql
CREATE TYPE essencialidade AS ENUM ('essencial', 'necessario', 'superfluo', 'investimento');
```
- Default por **produto** (`produtos.essencialidade_padrao`) e por **categoria**
  (`categorias.essencialidade_padrao`) — herança: item → produto → categoria → 'necessario'.

### 3.3 Contexto/Evento — leve, separado de coleção
Nova tabela `contextos` (escopo workspace), **não** reusar `colecoes`:
```sql
CREATE TABLE contextos (
  id, workspace_id, nome,            -- "Passeio em família", "Compra do mês"
  tipo TEXT,                         -- 'passeio'|'compra_mes'|'trabalho'|'viagem'|...
  data_referencia DATE,
  descricao TEXT,
  cor, icone,
  created_at
);
```
- `transacoes.contexto_id` e `itens_transacao.contexto_id` (item herda da transação por padrão).
- Permite "quanto custou o passeio inteiro" (group by contexto) **e** "onde o dinheiro foi"
  (group by categoria do item) ao mesmo tempo — exatamente o pedido.
- Coleção continua para projeto/compromisso com workflow (viagem orçada, encomenda). Um contexto
  pode opcionalmente apontar pra uma coleção depois.

### 3.4 Tipo do item (incluído no v1 — decidido)
- Coluna `tipo_item TEXT` em `itens_transacao` — **texto sugerido**, NÃO nível de categoria
  (evita explosão da árvore). Valores comuns sugeridos pela IA: Refeição, Bebida, Sobremesa,
  Entrada, Lanche, Taxa de serviço, Couvert, Embalagem/Entrega; no mercado: Hortifruti, Carnes,
  Laticínios, Limpeza, Higiene, etc.
- Default herdado do produto (`produtos.tipo_padrao`). Opcional; nunca bloqueia o lançamento.

### 3.5 Fora do v1 (decisão consciente)
- **Pessoa por item**: adiar; usar memória do produto se virar demanda real.
- **Recorrência por item**: já coberto por `recorrencias` no nível certo (transação).

## 4. Relatório sem contagem dupla

Criar função/visão `gastos_por_categoria_v2` que:
- Para transações **com** itens: soma `itens_transacao.valor_total` agrupado por `categoria_id`
  do item (rateando taxas/descontos da nota proporcionalmente, se houver sobra).
- Para transações **sem** itens: usa `transacoes.valor` + `transacoes.categoria_id`.
- Visões novas: `gastos_por_contexto` (custo do evento) e `gastos_por_essencialidade`.

Atualizar `apps/web/src/lib/db/queries.ts` (`getGastosPorCategoria`) e o donut da home.

## 5. IA / ingest — onde mora a mágica

`ingest-whatsapp` (passo 7b) e a Nia precisam, ao itemizar:
1. Casar produto (já faz) → herdar `categoria_sugerida_id` + `essencialidade_padrao`.
2. Produto novo → IA sugere categoria + essencialidade (score) → baixa confiança vai pro inbox.
3. Inferir **contexto** da nota inteira (heurística: 2+ estabelecimentos no mesmo dia, ou
   estabelecimento "cinema"/"shopping" → sugerir "Passeio"; nota de mercado grande → "Compra do mês").
4. Codificar as **regras do Nicolas** como heurísticas:
   - imposto segue a origem (IPTU→Moradia, IPVA→Transporte);
   - taxa/serviço/embalagem segue o gasto principal;
   - consumo imediato (pastel na feira) = Alimentação fora; pra casa = Alimentação em casa;
   - presente não herda categoria natural do produto → Presentes.

## 6. Taxonomia = PADRÃO DE REFERÊNCIA (vocabulário controlado)

> Decisão do Nicolas: dá pra ir criando categorias com o tempo, **mas tem que existir um
> padrão comum** para os relatórios serem comparáveis. Quando a IA criar categoria, ela
> **se baseia nesse padrão** — não inventa livremente.

Implicação de design: `categoria_templates` (global, já existe) vira o **catálogo de referência
canônico** — a "lista oficial" de categorias/subcategorias com `slug` estável. Cada workspace
copia esse catálogo no onboarding (já é assim em `provisionar_workspace`), mas o slug canônico é
o que liga tudo para relatório agregado/comparável.

**Regra da IA ao precisar de uma categoria que não existe no workspace:**
1. Tenta casar (semântica + `slug`) contra o catálogo canônico → se achar, **usa o slug padrão**.
2. Se nada do padrão servir, cria a categoria **derivando do padrão** (mesma raiz/pai canônico)
   e marca `origem = 'ia'` + `status_revisao = 'novo'` → entra no inbox e pode ser "promovida"
   ao catálogo canônico depois.
3. Nunca cria slug solto/duplicado para algo que já existe no padrão (mesma disciplina do
   `sugestoes_match` para estabelecimento/produto, agora aplicada a categoria).

Ação concreta:
- Expandir `categoria_templates` para um conjunto curado e estável (base dos exemplos do Nicolas:
  *Alimentação em casa* × *fora*, *Contas da casa* × *Moradia*, *Serviços domésticos*, *Pets*
  detalhado, etc.) — esse é "o padrão".
- Adicionar coluna de versionamento/`canonico BOOLEAN` em `categoria_templates` se quisermos
  distinguir padrão oficial de sugestões pendentes de promoção.
- Reaproveitar `buscar_match_*` / `sugestoes_match` (tipo `'categoria'` já existe no enum
  `tipo_entidade_sugestao`) para o anchoring da IA.

## 7. Fases (ordem de execução)

| Fase | Entrega | Risco | Desbloqueia |
|---|---|---|---|
| **1. Schema base** | `itens_transacao`: `categoria_id` + `essencialidade` + `tipo_item`. Defaults em produto/categoria (`essencialidade_padrao`, `tipo_padrao`). Migration nova. | Baixo | "onde o dinheiro foi de verdade" |
| **2. Relatório** | `gastos_por_categoria_v2` + visões contexto/essencialidade + queries/donut | Baixo | dashboards reais |
| **3. Contexto** | tabela `contextos` + FKs em transação/item + UI de tag leve | Baixo | "custo do passeio" |
| **4. Padrão de referência** | expandir `categoria_templates` canônico + anchoring da IA via `sugestoes_match` tipo `categoria` | Baixo | relatórios comparáveis |
| **5. IA classifica** | ingest + Nia auto-atribuem categoria/essencialidade/tipo/contexto com score; inbox p/ baixa confiança | Médio | atrito → quase zero |
| **6. UI + edição** | editar item a item; tela "custo por evento"; painel essencial × supérfluo | Médio | valor percebido |

Fases 1+2 já entregam o coração da proposta. 3+4 são o que torna usável no dia a dia.

## 8. Migração de dados existentes
- Transações antigas ficam **sem itens** → relatório usa fallback (categoria da transação). Nada quebra.
- `essencialidade` default 'necessario' em tudo; usuário/IA refina aos poucos.
- Backfill opcional: itemizar retroativamente notas com `midias.texto_extraido` já guardado.

## 9. Decisões tomadas (jun/2026)
1. **Contexto** = tabela nova leve `contextos` (separada de `colecoes`). ✔
2. **Tipo do item** = incluído no v1 como `itens_transacao.tipo_item TEXT` (texto sugerido,
   não nível de categoria). ✔
3. **Taxonomia** = padrão de referência canônico (`categoria_templates`) + IA ancorada nele ao
   criar categorias novas; nada de slug solto/duplicado. Cresce com o tempo, mas comparável. ✔
