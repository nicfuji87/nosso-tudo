# ML — Referência das APIs externas (verificada em 01/10/2026)

> Resumo do que o código do módulo ML assume sobre cada API. **Revalidar antes de
> mexer nos adapters** (`apps/web/src/lib/ml/integracoes/*`). Fontes no fim de cada seção.

## Mercado Livre (site MLB)

**OAuth 2 (authorization code)**
- Autorização: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id&redirect_uri&state[&code_challenge&code_challenge_method=S256]`.
- PKCE é **opcional por app** (liga no DevCenter; ligado ⇒ obrigatório). O app sempre manda PKCE S256 — funciona nos dois casos.
- `state` não é validado pelo ML — validamos nós (`ml_oauth_states`).
- `redirect_uri` precisa ser **HTTPS** e idêntica à cadastrada ⇒ OAuth do ML só funciona no domínio publicado
  (`https://nossotudo.com.br/api/ml/oauth/mercadolivre/callback`), não em `localhost`.
- Token: `POST https://api.mercadolibre.com/oauth/token` (form-urlencoded, credenciais no corpo).
  - `grant_type=authorization_code&client_id&client_secret&code&redirect_uri&code_verifier`
  - `grant_type=refresh_token&client_id&client_secret&refresh_token`
  - Resposta: `access_token` (`APP_USR-…`, **6 h**), `refresh_token` (`TG-…`), `expires_in`, `scope`, `user_id`.
- **Refresh token é de uso único e rotaciona**; vale 6 meses. Reuso ⇒ `400 invalid_grant`.
  ⇒ refresh serializado por trava (`ml_integration_try_lock`) e o novo token gravado antes de soltar a trava.
- IDs grandes (user_id Int64, `family_id`) ⇒ **sempre string**.

**Endpoints usados** (todos com `Authorization: Bearer`; sem token muitos dão 403 PolicyAgent)
| Uso | Endpoint | Observações |
|---|---|---|
| Conta | `GET /users/me` | `id`, `nickname`, `site_id` |
| Categorias | `GET /sites/MLB/categories`, `GET /categories/{id}` | `path_from_root`, `children_categories` |
| Mais vendidos | `GET /highlights/MLB/category/{cat}` | `content[]{id,position,type}` **até 20**; `type` ∈ ITEM / PRODUCT / USER_PRODUCT; 404 em categoria sem ranking (provavelmente não-folha) |
| Tendências | `GET /trends/MLB[/{cat}]` | até 50 `{keyword,url}`; 1–10 = crescimento rápido, 11–30 = mais desejadas, 31–50 = populares; atualiza semanalmente |
| Produto de catálogo | `GET /products/{id}` | `name`, `pictures`, `attributes`, `buy_box_winner{item_id,price,original_price,shipping}` (null se ninguém compete), `permalink`, `status` |
| User product | `GET /user-products/{MLBU…}` | `name`, `pictures[].secure_url`, `catalog_product_id` |
| Item | `GET /items/{id}`, `GET /items/bulk?ids=` | `/items?ids=` **deprecado em 25/10/2026** → `/items/bulk` (`status_code` + `body`) |
| Avaliações | `GET /reviews/item/{item_id}?limit=1[&catalog_product_id=]` | `rating_average`, `paging.total` |

**Restrições relevantes**
- Busca pública `/sites/MLB/search` está **indisponível** (403 mesmo com token) — descoberta é via highlights + trends.
- Leitura de itens de **outros vendedores** pode dar 403 (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`). O adapter trata como
  "dado indisponível" (não erro fatal): usa `/products/{id}` + `buy_box_winner` como fonte principal e Apify (opcional) como complemento.
- Sem limites numéricos publicados; 429 (`local_rate_limited`) ⇒ backoff + `Retry-After`.
- **Afiliados: não existe API oficial** para gerar link. Link é gerado à mão no painel de afiliados.
  Formato confirmado: `https://mercadolivre.com/sec/{código}`; também aceitos `meli.la/…` e URLs do ML com
  parâmetros de rastreio (`matt_tool`, `matt_word`, `tracking_id`). A arquitetura já prevê `source='api'` em `ml_affiliate_links`.

Fontes: developers.mercadolivre.com.br/pt_br/{autenticacao-e-autorizacao, mais-vendidos-no-mercado-livre, tendencias,
itens-e-buscas, buscador-de-produtos, opinioes-sobre-um-produto, boas-praticas-para-usar-a-plataforma}.

## Pinterest API v5

**OAuth**
- Autorização: `https://www.pinterest.com/oauth/?client_id&redirect_uri&response_type=code&scope=a,b&state` (sem PKCE).
- Token: `POST https://api.pinterest.com/v5/oauth/token` com `Authorization: Basic base64(client_id:client_secret)`,
  form `grant_type=authorization_code&code&redirect_uri` / `grant_type=refresh_token&refresh_token`.
- Access token 30 dias (`pina…`); refresh token 60 dias com **refresh contínuo** (apps desde 25/09/2025).
- Escopos pedidos: `boards:read, boards:write, pins:read, pins:write, user_accounts:read`.

**Endpoints**: `GET /v5/user_account`; `GET /v5/boards?page_size=250&bookmark=`; `POST /v5/boards`;
`POST /v5/pins` `{board_id, title(≤100), description(≤800), link(≤2048), alt_text(≤500), media_source:{source_type:"image_url",url}}`;
`GET /v5/pins/{id}/analytics?start_date&end_date&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK` (UTC, ≤90 dias,
resposta `{all:{daily_metrics:[{date,data_status,metrics}]}}`).

**Acesso / sandbox**
- **Trial**: Pins criados só ficam visíveis ao criador (sandbox), 1000 req/dia. **Standard** exige vídeo-demo do OAuth.
- Sandbox: `https://api-sandbox.pinterest.com/v5`, token próprio (gerado em My Apps ou OAuth no endpoint sandbox).
  **Analytics desligado no sandbox.** O app suporta `environment = sandbox | production` por integração.
- Apps novos (≥ 14/09/2026) podem receber `403 PINNER_DATA_ACCESS_DENIED` ao ler dados de terceiros — o app só lê os próprios boards/Pins.
- Rate limit: `org_write` 100/min (Standard) / 300/dia (Trial); `org_analytics` 60/min.

Fontes: developers.pinterest.com/docs/{getting-started/set-up-authentication-and-authorization, key-concepts/access-tiers,
developer-tools/sandbox, reference/rate-limits}; OpenAPI github.com/pinterest/api-description (v5.28.0).

## OpenAI (opcional)

- Texto: `POST /v1/responses` com `text.format = {type:"json_schema", name, schema, strict:true}`, `store:false`.
  Ler a saída percorrendo `output[]` (`type:"message"` → `content[]` `type:"output_text"`); recusa vem como `refusal`.
  Strict: `additionalProperties:false` e todos os campos em `required` (opcional = união com `null`).
- Modelos atuais (docs 01/10/2026): texto/visão barato **`gpt-6-luna`**; imagem **`gpt-image-2.5-flare`**
  (`gpt-image-1*` deprecados). Ficam **configuráveis** no painel (lista vem de `GET /v1/models`).
- Imagem: `POST /v1/images/generations` `{model,prompt,size:"1024x1536",quality,output_format}` → `data[].b64_json` (só base64).
  Com referência: `POST /v1/images/edits` multipart (`image[]`, `prompt`, `model`, `size`) — pode levar ~2 min.
- Validação de chave: `GET /v1/models`. 429 de cota (`credit_balance_exhausted`, `*_spend_limit_exceeded`,
  `insufficient_quota`) **não** é retentável; 429 de rate limit é.

## Apify (opcional)

- Base `https://api.apify.com/v2`, `Authorization: Bearer`. Validar: `GET /v2/users/me`.
- Rodar actor: `POST /v2/actors/{id}/runs` → `GET /v2/actor-runs/{runId}?waitForFinish=60` → `GET /v2/datasets/{id}/items`
  (assíncrono; o síncrono `run-sync-get-dataset-items` tem teto de 300 s).
- Actors de terceiros para ML (ex.: `karamelo~mercadolivre-scraper-brasil-portugues`) — **não oficiais**, schema de input
  muda; o app guarda actor + template de input configuráveis e trata a saída de forma defensiva.
