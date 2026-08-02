# Plano — Nossa Viagem (módulo de viagens do Nosso Tudo)

> Status: **Fase 0 entregue** (02/08/2026) — grafo, motor de caminho, testes e
> admin de curadoria no ar. Fases 1–3 pendentes. Ver §9.
> Decisões já tomadas pelo Nicolas estão na §2.

A Nia ganha um segundo chapéu: planejar viagens. O usuário conversa, e ela monta o
aéreo — descobrindo se vale emitir com milhas ou pagar em dinheiro, e **qual caminho
de transferência entre programas deixa a emissão mais barata**.

Não é um produto novo. É um módulo dentro do Nosso Tudo, no mesmo login, reusando
auth, workspace, RLS, planos, design system e toda a infra da Nia.

---

## 1. O que é (e o que não é)

**É:**
- Carteira de milhas da família (saldos por programa, cadastrados à mão).
- Busca de disponibilidade de award (seats.aero) e de preço em dinheiro (SerpApi).
- Um **motor de caminho de milhas**: dado o que a família tem e o que a emissão
  custa, qual sequência de transferências chega lá mais barato.
- A Nia explicando o resultado em português, com os passos na ordem.

**Não é (v1):**
- Hotéis. Não existe API decente de resgate em pontos; award de hotel é pesquisa manual.
- Roteiro turístico. Fácil de somar depois (é LLM puro), mas não é o valor central.
- Emissão/booking. A Nia mostra o caminho; quem emite é o usuário, no site do programa.
- Produto comercial. Ver §2.

---

## 2. Decisões tomadas (02/08/2026)

| Decisão | Escolha | Consequência |
|---|---|---|
| Uso | **Pessoal/família por enquanto** | Usa o token Pro do seats.aero direto. Gating: `isPlatformAdmin`, como foi feito pra testar a Nia. Comercializar depois exige rever §3. |
| Escopo v1 | **Aéreo + carteira de milhas + comparação milhas × dinheiro** | Três frentes. Hotel e roteiro ficam fora. |
| Marca | Módulo dentro do Nosso Tudo, não produto separado | Tabelas em namespace `viagem_*` para extração futura ser barata. |

---

## 3. Fontes de dados — estado real, verificado em 02/08/2026

Isto foi checado, não assumido. É a seção que mais envelhece; revalide antes de codar.

### 3.1 seats.aero — disponibilidade de award ✅ funciona

Token já está em `apps/web/.env.local` como `SEATS_AERO_TOKEN`. Testado com uma
busca real GRU→LIS: retornou dado bom, **incluindo `smiles` como fonte** — programas
brasileiros estão cobertos.

- Endpoint: `GET https://seats.aero/partnerapi/search`
- Header: `Partner-Authorization: <token>`
- Limite confirmado no header de resposta: `x-ratelimit-limit: 1000` **por dia**.
- Params úteis: `origin_airport`, `destination_airport` (ambos aceitam lista separada
  por vírgula), `start_date`, `end_date`, `cabins`, `carriers`, `sources`, `take`
  (10–1000, default 500), `cursor`, `order_by=lowest_mileage`, `only_direct_flights`.
- Resposta: por objeto, custo em milhas e taxas por cabine (`YMileageCost`,
  `JMileageCost`, `JTotalTaxes`…), assentos restantes, se é direto, e `Route.Source`
  (o programa). Paginação por `cursor` + `hasMore`.

**Duas restrições que importam:**
- **Só Cached Search.** Live Search exige acordo comercial — indisponível na conta Pro.
  O dado é cache: pode divergir na hora de emitir. A UI tem que dizer isso.
- **A API Pro é para uso não-comercial.** Compatível com a decisão de §2, mas é
  bloqueador de lançamento se um dia virar produto pago. Contato: `support@seats.aero`.

### 3.2 Preço em dinheiro — Amadeus está morto ⚠️

**Amadeus Self-Service foi descomissionado em 17/07/2026** — duas semanas atrás.
Chaves desativadas, portal inacessível. Anunciado em fev/2026, reportado pelo
PhocusWire. Sobrou só o Amadeus Enterprise, que pede acreditação IATA/ARC.
**Não é opção.**

Alternativas avaliadas:

| Fonte | Custo | Veredito |
|---|---|---|
| **SerpApi Google Flights** | **Free: 250 buscas/mês** (50/h). Starter $25/mês = 1.000 | ✅ **Escolhido pro v1.** Zero onboarding, JSON estruturado, é literalmente o dado do Google Flights. 250/mês sobra pra uma família planejando viagens. |
| Duffel | Sandbox grátis (preços irreais); produção é $3/pedido emitido | Anotado pro futuro. Ótimo se um dia quiser **emitir** pelo app; ruim pra só comparar preço. |
| flightapi.io e agregadores | Pagos, a partir de ~$50/mês | Sem vantagem sobre SerpApi no nosso caso. |

**Decisão:** SerpApi Google Flights no v1, atrás de uma interface `FonteCash` para
trocar sem refazer. Duffel entra se/quando emissão virar escopo.

### 3.3 O grafo de transferências — não existe API. É nosso. 🎯

Nenhuma das fontes acima sabe que Esfera transfere pra Avios Iberia, com que ratio,
com que bônus vigente, em quantos dias. O seats.aero diz *"existe executiva GRU-HEL
por X milhas no programa Y"*; ele não diz *como você chega no programa Y*.

Essa curadoria é 100% trabalho manual — e é exatamente por isso que é a vantagem
real do produto. Ver §4.1 e §6.

---

## 4. Princípios inegociáveis

### 4.1 O grafo de transferências é DADO, nunca prompt

Tentação óbvia: descrever as transferências no system prompt e deixar a LLM raciocinar.
**Não.** Transferência de milhas é **irreversível**. Se a Nia alucinar um ratio de 1:1
que na verdade é 1:0,8, o usuário move pontos e não tem volta — perde dinheiro real.

Então: programas e transferências viram **tabelas**; o caminho mais barato é calculado
por **busca em grafo, em código**; a LLM só *explica* o resultado que o código produziu.
Determinístico, auditável, testável.

Corolário: toda aresta do grafo carrega `fonte_url` e `verificado_em`. Caminho com
dado velho é mostrado com aviso, não escondido.

### 4.2 Nada de emissão automática

A Nia mostra o caminho e o custo. Quem transfere e quem emite é o usuário, no site do
programa. Sem exceção — vale a mesma regra de confiança graduada da Nia financeira.

### 4.3 O dado é cache, e a UI admite isso

seats.aero é cached search. Todo resultado mostra `UpdatedAt` e um aviso de que a
disponibilidade pode ter mudado. Prometer assento que não existe mais é pior que não
achar assento.

### 4.4 Orçamento de chamadas

1.000/dia no seats.aero, 250/mês no SerpApi. Toda busca passa por cache local em
`viagem_busca_cache` (TTL curto — 30–60 min pro seats, mais longo pro cash). Sem isso,
uma conversa exploratória da Nia queima a cota de um mês.

---

## 5. Arquitetura — toolbelt por modo

O problema: `lib/nia/tools.ts` já tem ~1.520 linhas, e `api/nia/route.ts` manda
`NIA_TOOLS` inteiro em **todo** turno. Somar 10 tools de viagem faria toda conversa
sobre mercado carregar contexto de milhas — mais token, pior seleção de ferramenta.

**Solução:** modo na requisição.

```
POST /api/nia  { mensagem, conversaId, modo?: "financeiro" | "viagem" }
```

- `route.ts` escolhe o array de tools e o bloco de system prompt conforme o modo.
- `lib/nia/tools.ts` continua sendo o financeiro; nasce `lib/nia/tools-viagem.ts`.
- O **perfil da família continua injetado nos dois modos** — a Nia saber que o
  Henrique tem 9 anos e faz judô muda o roteiro e a escolha de assento.
- O bloco financeiro pesado (categorias, lançamentos de hoje, recorrências) **não**
  entra no modo viagem. Entra, em compensação, a carteira de milhas e o perfil de viagem.
- `conversas` ganha uma coluna `modo` — conversa de viagem não se mistura com a do dia
  a dia, e a rotação diária (`rotacionarConversas`) não deve arrastar uma pela outra.

O que se reusa sem tocar: `provider.ts` (streaming, prompt caching, tool-loop),
`store.ts`, `anexos.ts`, `config.ts` (custo por token, modelo configurável em
`/app/admin/nia`), widgets, `AcaoCard`, e a UI do `NiaChat`.

Rotas novas: `/app/viagens` (lista + chat), `/app/viagens/[id]` (a viagem),
`/app/viagens/carteira` (saldos por programa).

---

## 6. Modelo de dados (namespace `viagem_*`)

### 6.1 O grafo (global, curado por admin — não é por workspace)

```
viagem_programas
  id, slug, nome, tipo ('aereo'|'banco'|'hotel'|'coalizao'),
  pais, alianca ('star'|'oneworld'|'skyteam'|null),
  fonte_seats_aero   -- ex.: 'smiles', 'aeroplan'. null = não buscável
  observacoes

viagem_transferencias                      -- as arestas do grafo
  id, origem_id → viagem_programas, destino_id → viagem_programas,
  ratio_origem, ratio_destino,             -- 1000 Esfera → 800 Avios = 1000/800
  bonus_percent, bonus_valido_ate,         -- bônus são sazonais e mudam tudo
  minimo_transferencia, multiplo,
  prazo_dias_min, prazo_dias_max,
  ativa, fonte_url, verificado_em
```

Editável em `/app/admin/viagens` (só `isPlatformAdmin`), RLS deny-all como
`nia_config`. É o ativo mais valioso do módulo e o que mais dá trabalho manter.

### 6.2 Por workspace

```
viagem_saldos_programa                     -- a carteira
  workspace_id, programa_id, pessoa_id?,   -- de quem é a conta
  saldo, atualizado_em, expira_em?, observacao

viagens
  workspace_id, titulo, tipo ('lazer'|'trabalho'),
  origem, destinos[], data_ida, data_volta, flexibilidade_dias,
  adultos, criancas, cabine_desejada,
  orcamento_alvo, status ('rascunho'|'planejando'|'emitida'|'concluida'),
  meta_id?,      -- liga em `metas` (juntar dinheiro/milhas pra viagem)
  evento_id?     -- liga em `eventos` (gastos da viagem já caem categorizados)

viagem_opcoes                              -- as alternativas que a Nia achou
  viagem_id, tipo ('award'|'cash'),
  fonte, programa_id?, payload jsonb,      -- resposta crua da fonte
  custo_milhas, custo_taxas_cents, custo_cash_cents,
  caminho jsonb,                           -- o passo a passo de transferência
  escolhida bool, capturado_em

viagem_busca_cache                         -- proteção de cota (§4.4)
  chave_hash, fonte, payload jsonb, expira_em
```

**Ganho de reuso:** ligar em `metas` e `eventos` (ambos já existem) faz a viagem
aparecer no financeiro sozinha — junta-se dinheiro pra ela antes, e os gastos da
viagem caem categorizados no contexto certo depois. É essa sinergia que justifica
ser o mesmo app.

---

## 7. O motor de caminho de milhas

Coração do módulo. Roda em código, em `lib/viagens/caminho.ts`.

**Entrada:** saldos da família + emissão alvo (programa X, N milhas).
**Saída:** lista de caminhos viáveis, ordenados por custo.

Algoritmo: busca em grafo (Dijkstra com custo composto) sobre `viagem_transferencias`,
partindo de todo programa onde a família tem saldo. Cada aresta aplica ratio e bônus
vigente; poda por `minimo_transferencia` e saldo disponível.

Não basta ordenar por "milhas gastas". O custo de um caminho tem três dimensões:
1. **Milhas consumidas na origem** (após ratio e bônus).
2. **Prazo** — 3 saltos a 5 dias cada não serve pra viagem em 10 dias.
3. **Risco** — cada salto é irreversível; caminho de 1 salto vale mais que de 3.

A Nia recebe os caminhos já calculados e explica. Exemplo do que ela deve conseguir dizer:

> Achei executiva na Finnair GRU→HEL por 62.000 Avios + US$ 180 de taxas.
> Você tem 90.000 Esfera. Caminho: Esfera → Iberia (1:1, bônus de 30% até 15/08) =
> 117.000 Avios Iberia → transferir pra British (1:1, instantâneo). Sobra folga.
> Prazo total: ~2 dias. Sem o bônus, não daria.

E o comparativo: mesma rota em dinheiro pelo SerpApi, com o **cpm** (centavos por
milha) calculado — que é o número que de fato responde "vale a pena?".

---

## 8. Tools da Nia (modo viagem)

| Tool | Nível | O que faz |
|---|---|---|
| `consultar_carteira_milhas` | auto | Saldos por programa da família. |
| `buscar_award` | auto | seats.aero cached search. Passa por cache local. |
| `buscar_preco_dinheiro` | auto | SerpApi Google Flights. Cache mais longo. |
| `calcular_caminho_milhas` | auto | Chama o motor da §7. **Nunca a LLM calcula ratio.** |
| `comparar_milhas_dinheiro` | auto | cpm + veredito, com os dois lados à vista. |
| `criar_viagem` | confirmar | Cria a viagem (e opcionalmente meta + evento). |
| `salvar_opcao` | confirmar | Guarda uma alternativa em `viagem_opcoes`. |
| `atualizar_saldo_programa` | confirmar | Ajusta a carteira. |

Widgets novos: `opcoes_voo` (comparativo award × cash lado a lado),
`caminho_milhas` (o passo a passo em timeline), `carteira_milhas`.

---

## 9. Fases

**✅ Fase 0 — Fundação do grafo (sem IA). ENTREGUE em 02/08/2026.**

| O quê | Onde |
|---|---|
| Tabelas do grafo (RLS deny-all, trigger de `updated_at`) | `supabase/migrations/0036_viagem_grafo.sql` |
| Seed: 18 programas, 21 arestas | `supabase/migrations/0037_viagem_seed.sql` |
| Tipos puros (sem I/O — é o que torna o motor testável) | `apps/web/src/lib/viagens/tipos.ts` |
| **Motor de caminho** | `apps/web/src/lib/viagens/caminho.ts` |
| 29 testes unitários (vitest, `pnpm test`) | `apps/web/src/lib/viagens/caminho.test.ts` |
| Leitura/escrita do grafo (service_role) | `apps/web/src/lib/viagens/grafo.ts` |
| Validação da curadoria | `apps/web/src/lib/schemas/viagens.ts` |
| Server actions (gate `isPlatformAdmin`) | `apps/web/src/app/app/admin/viagens/actions.ts` |
| Admin: curadoria + simulador | `apps/web/src/app/app/admin/viagens/` + `components/admin/viagens-*.tsx` |

Decisões de implementação que valem registro:
- **DFS exaustiva com teto de saltos, não Dijkstra.** Bônus criam arestas com fator
  > 1, o que quebra a premissa de peso não-negativo do Dijkstra. O grafo tem
  dezenas de nós — enumerar tudo é correto, simples, e permite ranquear por várias
  dimensões (custo em R$, saltos, prazo) em vez de um escalar só.
- **Busca binária para achar a origem mínima.** Múltiplo e mínimo criam degraus:
  dividir `alvo / fator` erra. Com bônus de 30% e alvo de 62.000, o mínimo real é
  47.693 — não 47.692 nem 47.700.
- **`valor_por_mil_cents` por programa.** Sem isso não dá para comparar gastar
  Livelo com gastar Smiles; o motor degrada para ranquear por saltos e avisa.
- **Verificado dos 21: 12** (pool Avios, estrutural). As 9 arestas BR entram
  deliberadamente como não verificadas — o motor sinaliza todo caminho que passa
  por elas até o admin conferir na fonte.

*Verificado contra o grafo real: Esfera 90k → 62k Avios British resolve em 2 saltos
(Esfera → Iberia → British), consome 62.000 e custa ≈ R$ 1.364, com aviso de aresta
não verificada. Cadastrando 30% de bônus na Esfera → Iberia, cai para 48.000 milhas
e ≈ R$ 1.056 — R$ 308 de diferença, que é exatamente o tipo de decisão que o módulo
existe para tornar visível.*

**Fase 1 — Carteira + busca.**
`viagem_saldos_programa` + tela `/app/viagens/carteira`. Cliente seats.aero em
`lib/viagens/seats-aero.ts` com cache. Tela de busca crua (sem Nia) pra validar o dado.

**Fase 2 — Nia modo viagem.**
`modo` no route, `tools-viagem.ts`, bloco de system prompt, coluna `modo` em
`conversas`. Widgets. É aqui que vira produto.

**Fase 3 — Comparação com dinheiro.**
Interface `FonteCash` + adapter SerpApi. `comparar_milhas_dinheiro` + cpm.

**Fase 4 (fora do v1) — hotel, roteiro, integração com `metas`/`eventos` no dashboard.**

Fase 0 antes de qualquer coisa. Se o motor não estiver certo, todo o resto é enfeite
em cima de conta errada.

---

## 10. Riscos e decisões em aberto

| Risco | Mitigação |
|---|---|
| **Grafo desatualiza sozinho.** Bônus expiram, ratios mudam, programas somem. | `verificado_em` por aresta + aviso na UI quando > 90 dias. Aceitar que é manutenção manual recorrente — é o custo do módulo. |
| **Cota do seats.aero (1.000/dia).** Conversa exploratória queima rápido. | Cache obrigatório (§4.4) + a Nia deve buscar com data range amplo de uma vez, não dia a dia. |
| **Cached search diverge da realidade.** | Aviso explícito na UI. Nunca prometer assento. |
| **SerpApi free = 250/mês.** | Cache longo. Se apertar, $25/mês resolve. |
| **Uso comercial bloqueado** no seats.aero. | Já decidido: pessoal por enquanto. Revisitar antes de qualquer venda. |

**Em aberto (decidir na Fase 0):**
- Saldo por pessoa ou por família? (`pessoa_id` está opcional no schema — programas são
  individuais e transferência entre CPFs diferentes costuma ter regra própria.)
- Alertas: vale um `pg_cron` que reavalia rotas salvas e avisa quando abrir assento?
  (A infra de cron já existe — migration 0017/0018.) Provavelmente sim, mas na Fase 4.
- Onde entra o `modo` na UI: aba separada no shell ou seletor dentro do chat da Nia?

---

## 11. Referências

- seats.aero Partner API — https://developers.seats.aero/reference/getting-started-p
- Cached Search — https://developers.seats.aero/reference/cached-search
- Limites da conta Pro — https://docs.seats.aero/article/68-seatsaero-pro-api-access-limits-and-usage
- Shutdown do Amadeus Self-Service — https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers
- SerpApi Google Flights — https://serpapi.com/google-flights-api
- Duffel (futuro, emissão) — https://duffel.com/docs
