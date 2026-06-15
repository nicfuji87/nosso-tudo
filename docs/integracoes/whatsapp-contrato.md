# Contrato de ingestão WhatsApp → Supabase (para o n8n)

O fluxo de WhatsApp (uazapi → IA → gravar → responder) vive no **n8n**. Quando o n8n
terminou de interpretar a mensagem e tem a transação estruturada, ele faz **um único
POST** para a Edge Function `ingest-whatsapp`, que resolve o telefone, faz o matching de
estabelecimento (4 camadas) e devolve a **string de confirmação pronta** para o n8n
mandar de volta no WhatsApp.

## Endpoint

```
POST https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1/ingest-whatsapp
```

### Headers

| Header | Valor | Obrigatório |
|---|---|---|
| `x-webhook-secret` | secret gerado no Admin → Integrações → WhatsApp | ✅ |
| `Content-Type` | `application/json` | ✅ |
| `apikey` | anon key do Supabase (o gateway de Edge Functions exige) | ✅ |

> O `apikey` (anon) é só o porteiro do gateway; a autenticação real é o `x-webhook-secret`.
> Gere o secret em **Admin → Integrações → WhatsApp → Gerar secret** (mostrado uma vez).

## Corpo da requisição

```jsonc
{
  "idempotency_key": "uazapi-msg-id-abc123",   // id único da mensagem (dedup; recomendado)
  "telefone": "5511999998888",                  // só dígitos E.164; resolve o workspace
  "recebido_em": "2026-06-14T18:32:00Z",        // opcional (auditoria)
  "transacao": {
    "tipo": "despesa",                          // despesa | receita | transferencia | investimento_aporte | investimento_resgate
    "descricao": "Compra no mercado",           // OBRIGATÓRIO
    "valor": 287.40,                            // OBRIGATÓRIO (número, >= 0)
    "data_transacao": "2026-06-14",             // opcional (default: hoje)
    "categoria": "Mercado",                     // por nome (match exato; senão fica null)
    "estabelecimento": "Pão de Açúcar",         // por nome (matching 4 camadas)
    "meio_pagamento": "cartao_credito",         // cartao_credito|cartao_debito|pix|dinheiro|transferencia|boleto|vr|va|cartao_escola|outro
    "cartao": { "nome": "Nubank", "final": "1234" },  // opcional (match por apelido ou últimos dígitos)
    "conta": { "nome": "Itaú" },                // opcional (match por apelido)
    "pagador": "Bruna",                          // opcional (entidade por nome)
    "beneficiario": null,                        // opcional
    "observacoes": null,                         // opcional
    "tags": ["supermercado"]                     // opcional (array de strings)
  },
  "itens": [                                     // opcional — linhas da nota/orçamento (modo detalhado)
    { "nome": "Banana Prata", "quantidade": 1, "unidade": "kg", "valor_unitario": 5.99, "valor_total": 5.99, "codigo_barras": "789..." },
    { "nome": "Detergente Ypê", "quantidade": 2, "unidade": "un", "valor_unitario": 3.49, "valor_total": 6.98 }
  ],
  "midias": [                                    // opcional — anexos já hospedados (URL pública/temporária)
    { "tipo": "imagem", "url": "https://.../nota.jpg", "mime_type": "image/jpeg", "texto_extraido": "..." }
  ],
  "texto_original": "gastei 287,40 no pão de açúcar no nubank"  // opcional (auditoria)
}
```

Campos mínimos para criar uma transação: `telefone`, `transacao.descricao`, `transacao.valor`.

### Campos detalhados

- **`tipo`** — se omitido ou inválido, assume `despesa`.
- **`meio_pagamento`** — se inválido, fica `null`.
- **`categoria` / `pagador` / `beneficiario` / `conta`** — resolvidos por **match exato
  normalizado** (minúsculas, sem acento). Se não existir, ficam `null` (não são criados
  automaticamente — categorias têm comportamento/ícone definidos pelo usuário).
- **`cartao`** — casa por `final` (últimos dígitos) e, se não achar, por `nome` (apelido).
- **`estabelecimento`** — matching em camadas (ver abaixo); é criado se não existir.
- **`midias[].tipo`** — `imagem | pdf | audio | video | texto | documento` (default `documento`).
  A função **não baixa** o arquivo; guarda a URL em `midias` (`bucket = whatsapp-externo`).

## Matching de estabelecimento (4 camadas — RF-120/121)

1. **Exato normalizado** → vincula ao existente (`match: "existente"`, score 1.0).
2. **Fuzzy (pg_trgm)** com score:
   - **≥ 0.95** → auto-vincula (`match: "auto"`).
   - **0.60–0.94** → cria novo + abre **sugestão no Inbox de Revisão** (`match: "sugestao"`),
     incrementa `pendencias_inbox`.
   - **< 0.60** → cria novo (`match: "novo"`).

A transação é sempre criada com `status_revisao = "confirmado"` (a captura por WhatsApp é
de alta confiança); a fricção fica só nas sugestões do Inbox.

## Itens da nota / orçamento (modo detalhado + pré-conferência)

Quando o agente extrai as **linhas** da imagem (ex.: "Banana 1kg — R$ 5,99"), envie cada
uma em `itens[]`. Para cada item a função:

1. Resolve o **produto** com a mesma lógica em camadas (`código de barras` → `nome exato` →
   `fuzzy`): **≥ 0.95 / código de barras → sincroniza** com o produto existente (não duplica);
   **0.60–0.94 → cria + abre sugestão no Inbox** (pré-conferência); **< 0.60 → cria novo**.
2. Cria a linha em `itens_transacao` (descrição original, quantidade, unidade, valor unit./total,
   `ordem_na_nota`, status e score do match).
3. Atualiza o histórico do produto (`ultimo_preco_unitario`, `ultima_compra_em`,
   `ultimo_estabelecimento_id`) — base para o relatório "preço médio do produto X".

Assim, "banana" repetida em compras diferentes vira **o mesmo produto** (depois de confirmada
a sugestão uma vez, o texto vira alias e passa a casar sozinho — `confirmar_match`).

Campos do item: `nome` (obrigatório), `quantidade`, `unidade`, `valor_unitario`, `valor_total`,
`codigo_barras` (todos opcionais exceto `nome`).

## Resposta

### Sucesso (HTTP 200)

```jsonc
{
  "ok": true,
  "transacao_id": "uuid",
  "status_revisao": "confirmado",
  "score_confianca": 0.97,
  "estabelecimento": { "id": "uuid", "nome": "Pão de Açúcar", "match": "auto", "score": 0.97 },
  "categoria": { "id": "uuid", "nome": "Mercado" },
  "itens": 5,                                   // nº de linhas (itens_transacao) criadas
  "pendencias_inbox": 2,                        // sugestões abertas (estab. + produtos) p/ pré-conferência
  "confirmacao_whatsapp": "✅ Anotei: R$ 287,40 no Pão de Açúcar (5 itens). Detalhes no app."
}
```

Use o campo **`confirmacao_whatsapp`** diretamente como resposta ao usuário no WhatsApp.

### Idempotência (reenvio do mesmo `idempotency_key`)

```jsonc
{ "ok": true, "duplicado": true, "transacao_id": "uuid", "confirmacao_whatsapp": "✅ Ja tinha anotado isso 🙂" }
```

### Erros de roteamento (HTTP 200, `ok:false` — responda o usuário com `confirmacao_whatsapp`)

```jsonc
{ "ok": false, "error": "telefone_nao_vinculado",
  "confirmacao_whatsapp": "Nao reconheci esse numero. Vincule seu WhatsApp no app primeiro 🙂" }
```

| `error` | HTTP | Quando |
|---|---|---|
| `secret_invalido` | 401 | header `x-webhook-secret` ausente/errado |
| `payload_invalido` | 400 | JSON malformado, ou faltou `descricao`/`valor` |
| `valor_invalido` | 400 | `valor` não numérico ou negativo |
| `telefone_nao_vinculado` | 200 | telefone não está em `whatsapp_routing` |
| `telefone_nao_verificado` | 200 | vinculado mas `verificado = false` |
| `duplicado` | 200 | `idempotency_key` já processado (retorna a transação) |
| `falha_criar_transacao` / `erro_interno` | 500 | erro no servidor (com `detalhe`) |

## Vinculação de telefone (roteamento)

O telefone precisa estar em `whatsapp_routing` com `verificado = true` apontando para um
`workspace_id` + `profile_id`. A normalização compara **apenas dígitos** (ignora `+`, espaços,
parênteses). O fluxo de verificação in-app (gerar/confirmar código) é a próxima entrega; por
ora a linha pode ser inserida manualmente:

```sql
insert into whatsapp_routing (telefone, workspace_id, profile_id, verificado, verificado_em)
values ('5511999998888', '<workspace_uuid>', '<profile_uuid>', true, now());
```

## Exemplo de nó HTTP Request no n8n

- **Method:** POST
- **URL:** `https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1/ingest-whatsapp`
- **Headers:** `x-webhook-secret` = `{{ $env.NOSSOTUDO_INGEST_SECRET }}`, `apikey` = anon key
- **Body:** JSON (o objeto acima, montado a partir da extração da IA)
- Depois, mande `{{ $json.confirmacao_whatsapp }}` de volta via uazapi.
