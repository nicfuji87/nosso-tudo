# Integração Asaas (cobrança)

Cobrança de assinaturas (Pro) via **Asaas** — Pix, Boleto e Cartão recorrente. Orquestrada
por **Edge Functions** no Supabase, configurada na **área Admin**.

## Componentes

| Peça | Onde | Função |
|---|---|---|
| Config (chave, ambiente, token webhook) | `integration_settings` (key `asaas`, RLS deny-all) | segredos só via service_role |
| Admin UI | `/app/admin/integracoes` → aba Asaas | salvar chave (mascarada) + testar conexão |
| `criar-cobranca-asaas` | Edge Function (`verify_jwt = true`) | cria customer + subscription + 1ª cobrança |
| `asaas-webhook` | Edge Function (`verify_jwt = false`, token próprio) | recebe eventos, idempotente |

Base URLs (header de auth `access_token`):
- Sandbox: `https://api-sandbox.asaas.com/v3`
- Produção: `https://api.asaas.com/v3`

## Configuração (na área Admin)

1. **Admin → Integrações → Asaas.**
2. Escolha o **ambiente** (Sandbox para testes / Produção).
3. Cole a **API key** (Asaas → Configurações → Integrações → Chave de API).
4. Defina um **token de webhook** forte (o mesmo será cadastrado no painel Asaas).
5. **Salvar** → **Testar conexão** (faz `GET /myAccount`).

> A chave nunca é exibida de volta; aparece mascarada (`••••1424`). Deixe o campo em branco
> para manter a atual.

## Webhook no painel Asaas

Em **Asaas → Configurações → Webhooks**:

- **URL:** `https://ecwcqooogsvsrddwjavh.supabase.co/functions/v1/asaas-webhook`
- **Token de autenticação:** o mesmo token salvo no Admin (validado no header `asaas-access-token`).
- **Eventos:** `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
  `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `SUBSCRIPTION_DELETED`.

### Comportamento do webhook

- Valida o header `asaas-access-token`; rejeita (401) se não bater com o token configurado.
- **Idempotência:** grava cada evento em `asaas_webhook_events` por `asaas_event_id`; reentrega
  do mesmo evento = no-op.
- Efeitos na assinatura do workspace:
  - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `subscription_status = active` (+ `current_period_end`).
  - `PAYMENT_OVERDUE` → `past_due`.
  - `PAYMENT_REFUNDED` / `PAYMENT_DELETED` / `SUBSCRIPTION_DELETED` → `canceled`.
- Sincroniza a cobrança em `pagamentos` (status, valor líquido, URLs de fatura/boleto).

## Checkout (`criar-cobranca-asaas`)

Chamada autenticada (JWT do owner). Body:

```jsonc
{
  "ciclo": "mensal",            // mensal | anual  → cycle MONTHLY/YEARLY
  "metodo": "PIX",              // PIX | BOLETO | CREDIT_CARD
  "cpfCnpj": "00000000000",     // obrigatório (Asaas exige no customer)
  "creditCardToken": "..."      // só p/ CREDIT_CARD (tokenizado no front, SDK Asaas)
}
```

Resposta inclui `subscription_id` e o primeiro `payment` (Pix copia-e-cola + QR em base64,
ou `bankSlipUrl` do boleto, ou status do cartão) + `invoiceUrl`. O valor vem do plano `pro`
(`plans.preco_mensal_brl` / `preco_anual_brl`), editável em **Admin → Planos**.

> **Cartão:** o PAN nunca passa pelo backend — tokenize no front com o SDK do Asaas e envie
> só o `creditCardToken` (PRD §7.5).

## Estado atual / observações

- **Chave fornecida é de PRODUÇÃO** (conta **Infuse Comunicação**). Por segurança, ela **não
  foi gravada automaticamente** — cole-a você mesmo na área Admin, escolhendo o ambiente.
  A conectividade já foi validada (`GET /myAccount` → 200).
- O **token de webhook** ainda não foi definido; enquanto não houver, o `asaas-webhook`
  rejeita tudo (401) — seguro por padrão.
- **Não foram criadas cobranças/customers** nesta configuração inicial.
