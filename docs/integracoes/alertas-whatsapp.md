# Alertas proativos da Nia (push WhatsApp via uazapi)

A Nia avisa a família pelo WhatsApp **sem ninguém abrir o app** (saldo negativo,
orçamento estourado, cartão perto do limite, resumo semanal/mensal, ou um recado
personalizado). Tudo roda **dentro do Supabase**; o n8n cuida apenas do agente
conversacional — não participa deste fluxo.

## Arquitetura

```
pg_cron (0 * * * *)                      -- de hora em hora
  └─ public.nia_cron_disparar()          -- lê functions_base_url + cron_secret
       └─ net.http_post (pg_net)         -- POST assíncrono
            └─ Edge Function nia-alertas-cron (verify_jwt = false; auth via x-cron-secret)
                 ├─ avalia regras determinísticas por workspace (sem LLM)
                 ├─ resolve público (todos Pro ou específicos)
                 ├─ deduplica por bucket de tempo (nia_alertas_envios.chave_dedup)
                 └─ envia via uazapi  POST {url}/send/text  (header token, body {number,text})
```

A Edge Function decide **o que está "na hora"** conforme `frequencia`/`hora`/`dia`
de cada alerta — por isso o cron pode ser fixo (de hora em hora).

## Tabelas (migration 0011)

- **`nia_alertas`** — definições editáveis no admin (tipo, frequência, hora, dia,
  limiar, template, público). RLS deny-all.
- **`nia_alertas_alvos`** — destinatários quando `publico_alvo = 'especificos'`
  (`workspace_id` + `profile_id` opcional). RLS deny-all.
- **`nia_alertas_envios`** — log/auditoria + **deduplicação** (`chave_dedup` único).
  Status `enviado`/`falhou`. RLS deny-all.

`chave_dedup = alertaId:workspaceId:telefone:discriminador:bucket`, onde o bucket é:
- `imediato`/`diario` → dia (`YYYY-MM-DD`) → no máx. 1×/dia por problema distinto;
- `semanal` → semana ISO (`YYYY-Www`);
- `mensal` → mês (`YYYY-MM`).

## Tipos de regra

| tipo | quando dispara | placeholders extras |
|---|---|---|
| `saldo_negativo` | saldo do mês < 0 | `{saldo}` |
| `orcamento_estourado` | gasto > planejado | `{categoria} {gasto} {planejado} {pct}` |
| `orcamento_perto` | gasto ≥ `limiar_pct`% | `{categoria} {gasto} {planejado} {pct}` |
| `cartao_limite` | uso do mês ≥ `limiar_pct`% do limite | `{cartao} {gasto} {limite} {pct}` |
| `resumo_semanal` | há movimento nos últimos 7 dias | `{receitas} {despesas} {saldo} {periodo}` |
| `resumo_mensal` | há movimento no mês | `{receitas} {despesas} {saldo} {periodo}` |
| `personalizado` | sempre (no agendamento) | usa o template como mensagem |

Comuns a todos: `{nome}` (primeiro nome do destinatário) e `{espaco}` (nome do workspace).
Se `template` estiver vazio, usa o texto padrão do tipo (definido na Edge Function).

## Público

- **`todos_pro`** — workspaces com `plans.features->>'whatsapp' = true` e
  `subscription_status in ('active','trial')`. Envia para todos os números
  **verificados** (`whatsapp_routing.verificado = true`) de cada workspace.
- **`especificos`** — apenas os pares (workspace, pessoa) escolhidos no admin.

## Configuração / operação

Tudo no admin: **Admin → Alertas** (restrito a platform admin).

- **Criar/editar/excluir** alertas; ligar/desligar com o switch.
- **Disparar agora** — roda a avaliação ignorando a janela de horário (respeita a
  deduplicação). Bom para testar uma regra real.
- **Enviar teste** — manda uma mensagem avulsa para um número, validando a credencial
  uazapi sem mexer nos alertas.
- **Envios recentes** — auditoria dos últimos disparos (telefone mascarado).

Credenciais de envio (uazapi `url` + `token`) ficam em **Admin → Integrações → WhatsApp**.
O `cron_secret` e a `functions_base_url` são gravados pela migration em
`integration_settings(key='whatsapp')` (secrets/valor) e usados tanto pelo `pg_cron`
quanto pelo botão "Disparar agora"/"Enviar teste".

### Disparo manual (debug)

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/nia-alertas-cron" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <cron_secret>" \
  -d '{"forcar": true}'          # ignora a janela de horário
# resposta: { ok, avaliados, enviados, falhas, pulados, em }
```

Modos do corpo: `{}` (ciclo normal), `{"forcar":true}`, `{"alertaId":"<uuid>","forcar":true}`,
`{"teste":{"telefone":"55...","mensagem":"..."}}`.

## Observações

- O fuso de referência do agendamento é **America/Sao_Paulo**.
- A função é idempotente por bucket: reexecutar não reenvia o que já saiu como `enviado`;
  envios que falharam são re-tentados no próximo ciclo.
- Para alterar o cron (ex.: a cada 30 min), reescalone `nia-alertas-hourly` em `cron.job`.
