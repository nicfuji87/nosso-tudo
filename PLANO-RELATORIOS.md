# Plano — Início inteligente & Relatórios (Descobertas)

> Objetivo: transformar **Início** de "resumo bonito" em **central de descobertas** —
> insights, comparativos e alertas que o app encontra sozinho — e dar à aba
> **Relatórios** filtros de verdade. A sacada de produto: parar de chamar tudo de
> "relatório" (algo que a pessoa precisa abrir e analisar) e passar a **entregar a
> conclusão**: _"Encontrei 3 oportunidades de economizar R$ 412 este mês."_

---

## 0. O que já foi feito nesta leva (commitado)

- **"Outros" não engole categoria nomeada** — se sobra **uma só** categoria fora do
  top 5, ela aparece pelo próprio nome (ex.: _Educação_), não como "Outros (1)".
  `categorias-card.tsx`.
- **Essencial × Supérfluo clicável** — barra e legenda viram botões; o toque abre um
  sheet com **o que foi classificado** em cada natureza (item a item, batendo com o
  total da barra). Novo `essencialidade-card.tsx` + action `transacoesPorEssencialidade`,
  reaproveitado no Início e em Relatórios.
- **"Seus cartões" saiu do Início** — cartões continuam em Cadastros; o espaço nobre
  do Início fica para descobertas.

---

## 1. Princípio de produto

| Antes | Depois |
|---|---|
| "Relatórios" (a pessoa abre e interpreta) | **Descobertas / Oportunidades / Riscos** (o app conclui) |
| Tudo no mesmo nível | **Início** = saldo + previsão + descobertas da semana · **Relatórios** = exploração com filtros (o "Modo Detetive") |
| Números | Frase + número + ação ("toque para ver" / "revisar") |

Linguagem das superfícies: **Descobertas da semana**, **Oportunidades de economia**,
**Riscos do mês**, **Modo Detetive da casa**. Nada de "você gastou demais" — sempre
não-moralista e acionável.

---

## 2. Inventário de dados — o que já dá para fazer HOJE

A base é mais rica do que parece. Já existe e **já é populado** pela ingestão (WhatsApp)
e pela Nia:

- **Produto canônico + histórico de preço** ✅ — `produtos` (`nome_normalizado`,
  `ultimo_preco_unitario`), `itens_transacao.produto_id` + `valor_unitario` + data.
  Matching por código de barras e fuzzy (`buscar_match_produto`). **Isto é a fundação
  dos relatórios "matadores" — e já está pronta no dado.** Falta só a camada de leitura.
- **Item a item** ✅ — `itens_transacao` (quantidade, unidade, valor, essencialidade,
  categoria, tipo_item).
- **Estabelecimento** ✅ — `estabelecimentos` (normalizado, trgm) por transação e item.
- **Recorrências** ✅ — `recorrencias` (tipo, valor_previsto, frequência, dia_vencimento,
  proxima_geracao, estabelecimento). Base de assinaturas e da previsão.
- **Eventos/Projetos** ✅ — `contextos` e `colecoes` (orçamento previsto × final).
- **Pessoa** ✅ — beneficiário por transação (já temos "Gasto por pessoa").
- **Natureza** ✅ — essencialidade item a item + `essencialidade_padrao` por categoria.
- **Orçamento / Metas / Cartões** ✅ — `orcamentos`, `metas_financeiras`, `cartoes`
  (limite). Já viram `getAlertas()`.
- **Carimbo de tempo** ✅ — `transacoes.created_at` (com hora) e `data_transacao` (dia).

**Conclusão:** quase tudo depende de **camada de leitura (RPC/SQL) + UI**, não de
novo dado. As únicas peças de fundação que faltam são **filtro de período** e uma
**engine de insights**.

---

## 3. As 15 ideias × viabilidade

Esforço: 🟢 baixo (RPC + card) · 🟡 médio · 🔴 alto. "Bloqueio" = o que falta além de UI.

| # | Ideia | Dado pronto? | Esforço | Bloqueio |
|---|---|---|---|---|
| 5 | **Previsão de Sufoco do mês** (semáforo) | Recorrências + faturas + run-rate + receita prevista | 🟡 | Engine de projeção |
| 4 | **Assinaturas Fantasma** | Recorrências + essencialidade + "último uso" | 🟢 | — |
| 6 | **Gastos Invisíveis** (< R$ 35) | Transações | 🟢 | — |
| 14 | **Score de Tranquilidade** (0–100) | Saldo + reserva + fatura + variáveis + assinaturas | 🟡 | Pesos/fórmula |
| — | **Comparativo mês a mês** (Δ por categoria) | Histórico de transações | 🟡 | RPC com intervalo |
| 1 | **Radar de Preço Injusto** | `produtos` + `valor_unitario` histórico ✅ | 🟡 | RPC de desvio de preço |
| 11 | **Cesta Inteligente** | Itens recorrentes por produto ✅ | 🟡 | RPC de cesta |
| 2 | **Inflação Real da Família** | Preço unitário no tempo ✅ | 🟡 | Cesta + janela 6m |
| 3 | **Melhor Lugar pra Comprar** | Item × categoria × estabelecimento ✅ | 🟡 | Massa de dados |
| 9 | **Auditoria da Fatura** | Conciliação já existe; duplicatas/juros/parcela | 🟡 | Estende conciliação |
| 12 | **Valeu a Pena?** (projeto/evento) | `contextos`/`colecoes` previsto×real ✅ | 🟢 | Breakdown na UI |
| 13 | **Vida está mais cara onde?** (preço × comportamento) | Preço unit. + frequência | 🔴 | Decomposição preço/quantidade |
| 10 | **Desperdício** (recompra fora do ciclo) | Produto + frequência ✅ | 🔴 | Ciclo médio por produto |
| 8 | **Compra por contexto** (dia/hora) | `created_at` (hora) | 🟡 | Confiável só p/ lançamento em tempo real |
| 15 | **Pauta da Conversa Familiar** | Agrega as descobertas | 🟢 | Depende das outras + Nia |
| 7 | **Custo por pessoa** (✅ já existe — só enriquecer com categorias) | Beneficiário | 🟢 | — |

---

## 4. Fundação que destrava tudo (Fase 0)

1. **Filtro de período global** — seletor (mês atual · mês anterior · últimos 3 meses ·
   personalizado) + por **pessoa / categoria / cartão / essencialidade**. Hoje os RPCs
   fixam `date_trunc('month', now())`. Generalizar para `(p_inicio, p_fim)` — vários já
   aceitam `p_mes`, é estender. Destrava comparativos e Relatórios filtrável.
2. **Engine de insights determinística** — um módulo `lib/insights/` que roda as regras
   (assinatura fantasma, gasto invisível, preço injusto, pico de categoria…) e devolve
   uma lista tipada `Descoberta { tipo, severidade, titulo, valor, href }`. Reaproveita
   `getAlertas()`. É o que alimenta tanto o Início quanto a Nia/`nia-alertas-cron`.
3. **Janelas históricas** — helper para somar por mês/categoria/produto em N meses
   (base de comparativo, inflação e cesta).

---

## 5. Roadmap recomendado

> Difere um pouco do "MVP 5" da pesquisa: como a **fundação de produto/preço já está
> pronta no dado**, dá para puxar o **Radar de Preço Injusto** para cedo (é o maior
> diferencial e não precisa de obra). Por isso ele entra junto dos ganhos determinísticos.

### Fase 1 — Início inteligente (MVP, ganhos rápidos)
1. **Previsão de Sufoco** — semáforo 🟢🟡🔴 no topo do Início.
2. **Assinaturas Fantasma** — card "Oportunidades": R$/ano em recorrências de baixa prioridade.
3. **Gastos Invisíveis** — card "para onde foi o troco".
4. **Comparativo mês a mês** — despesas e top categorias em alta/baixa (precisa Fase 0.1).
5. **Score de Tranquilidade** — número-herói no topo.

### Fase 2 — Diferenciais com nota fiscal (alto valor, dado já pronto)
6. **Radar de Preço Injusto** · 7. **Cesta Inteligente** · 8. **Inflação da Família** ·
9. **Melhor Lugar pra Comprar**.

### Fase 3 — Profundidade & coaching
10. **Auditoria da Fatura** (estende conciliação) · 11. **Valeu a Pena?** ·
12. **Vida está mais cara onde** · 13. **Compra por contexto** · 14. **Desperdício** ·
15. **Pauta da Conversa Familiar** (a Nia fecha o ciclo, virando comportamento).

---

## 6. Redesenho do Início (layout proposto)

```
┌ Olá, Nicolas — Junho ───────────────────────────────┐
│  Saldo +R$ 842   |   Previsão: 🟡 atenção dia ~24   │  ← hero (Previsão + Score)
│                  |   Tranquilidade 72/100           │
├─ Descobertas da semana ─────────────────────────────┤
│ 💸 3 oportunidades · economize ~R$ 412   (toque)    │  ← engine de insights
│   • Assinatura X parada há 3 meses — R$ 478/ano     │
│   • Azeite 29% acima da sua média                   │
│   • R$ 612 em compras < R$ 35                        │
├─ Este mês × anterior ───────────────────────────────┤
│ Mercado +18% · Lazer +32% · Saúde −12%   (toque)    │  ← comparativo
├─ Explorar (recolhíveis) ────────────────────────────┤
│ Gastos por categoria · Essencial×Supérfluo · Pessoa │  ← o que já existe hoje
│ Eventos · Coleções · Atividade recente              │
└─────────────────────────────────────────────────────┘
```

**Filtros** (compartilhados Início↔Relatórios): período · pessoa · categoria ·
cartão/conta · essencialidade. **Relatórios** vira o **"Modo Detetive"**: as mesmas
descobertas em profundidade + exploração livre com esses filtros.

---

## 7. Próximos passos concretos

1. **Fase 0.1** — RPCs por intervalo + componente `PeriodoFilter` (client) com estado em URL.
2. **`lib/insights/`** — tipo `Descoberta` + 3 regras (assinatura fantasma, gasto
   invisível, pico de categoria) e card `DescobertasCard` no Início.
3. **Previsão de Sufoco** — RPC `previsao_mes` (receita prevista − gastos − contas
   futuras − fatura aberta) → semáforo.
4. **Radar de Preço Injusto** — RPC `desvio_preco_produto` (preço pago × média 90d do
   produto) → card + drill por produto.
5. Plugar as descobertas no **`nia-alertas-cron`** para virarem mensagem proativa da Nia.

_Cada item acima é uma PR pequena e isolada; a Fase 0 é a única dependência cruzada._
