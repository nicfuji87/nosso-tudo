# ML — Setup, operação e checklist de produção

## 1. Variáveis de ambiente

O módulo **não exige nenhuma variável nova**. Ele usa as que o Nosso Tudo já tem:

| Variável | Onde | Uso no ML |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `apps/web/.env.local` | Leitura com RLS nas páginas `/ml` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + `.env.local` (só servidor) | Escritas, jobs, Vault |
| `NEXT_PUBLIC_SITE_URL` | Vercel (`https://nossotudo.com.br`) | Redirect URIs do OAuth e URL que o pg_cron chama |

Tudo que é de integração (App IDs, secrets, tokens, API keys, actor do Apify) é configurado **no painel**
(`/ml/integracoes`) e guardado no **Supabase Vault** — nunca em `.env`.

## 2. Banco

Migrations `supabase/migrations/2026100*_ml01…ml06` (ml01–ml03 em 01/10/2026, ml04–ml06 da V2 em 02/10/2026,
todas aplicadas com `pnpm sb db push`). Ver [BANCO.md](./BANCO.md).
Tipos TS gerados: `pnpm ml:types` (apps/web) → `src/lib/ml/database.types.ts`.

## 3. Primeiro uso (onboarding — spec §3.1)

1. **Login** no Nosso Tudo com a conta de platform admin (é owner do ML automaticamente). Acesse `/ml`.
2. **Mercado Livre** — em https://developers.mercadolivre.com.br/devcenter crie um app:
   - Redirect URI: `https://nossotudo.com.br/api/ml/oauth/mercadolivre/callback` (HTTPS obrigatório — por isso a
     conexão só funciona no domínio publicado);
   - escopos de leitura (read + offline_access); PKCE pode ficar ligado (o app sempre envia).
   - Em `/ml/integracoes` cole **App ID** e **Secret Key** → **Conectar Mercado Livre**.
3. **Pinterest** — em https://developers.pinterest.com/apps/ crie um app:
   - Redirect URI: `https://nossotudo.com.br/api/ml/oauth/pinterest/callback`;
   - **Trial**: escolha ambiente *Sandbox* (Pins só visíveis para você, sem métricas). Para publicar de verdade,
     peça **Standard access** (vídeo do fluxo OAuth) e troque para *Produção*.
   - Cole App ID + App secret → **Conectar Pinterest** → os boards sincronizam sozinhos.
4. **Boards**: em Configurações › Publicação marque o board padrão e mapeie categorias → boards.
5. **Categorias**: Configurações › Categorias → "Carregar categorias" → marque as que quer acompanhar (o ranking do
   ML existe nas subcategorias-folha; marcar a mãe faz o app olhar as filhas). Informe a **comissão %** de cada uma
   (melhora o score).
6. **Opcional**: OpenAI (análise, textos e imagem automática) e Apify (complemento de dados).
7. **Automação**: escolha o nível (Configurações › Automação) e ajuste horários em `/ml/automacoes`.
8. **Teste completo**: Integrações › Executar diagnóstico.

## 4. Como roda sozinho

- O **pg_cron** (`ml-worker-tick`, 1×/min) chama `POST {app_url}/api/ml/worker` com o segredo do Vault.
  `app_url` é registrado automaticamente quando um admin abre `/ml` no domínio publicado
  (`ml_settings.runtime.app_url`). Desligar: `update ml_settings set value = value || '{"tick_enabled":false}' where key='runtime'`
  ou `select cron.unschedule('ml-worker-tick');`.
- O worker: devolve jobs com lease vencido, dispara agendamentos vencidos (cron + timezone + política de
  sobreposição) e consome a fila por ~50 s (jobs longos até 300 s).
- **Pausar tudo**: botão no Dashboard (os agendamentos ficam salvos).

## 5. Desenvolvimento local

```bash
pnpm dev            # apps/web — http://localhost:3000/ml
pnpm ml:worker      # outro terminal: faz o papel do pg_cron contra o localhost
pnpm test           # testes unitários (scoring, estados, cron, janelas, guardrails, links, CSV, redação, imagem)
```

OAuth do Mercado Livre não funciona em `localhost` (exige HTTPS). Para testar Pinterest localmente, use
"Usar token de acesso (sandbox)" em Integrações.

## 6. Checklist de produção

- [ ] Migrations `ml01`…`ml06` aplicadas (`pnpm sb migration list` local = remoto).
- [ ] Deploy na Vercel com o código do módulo (rota `/api/ml/worker` com `maxDuration = 300`).
- [ ] Abrir `/ml` logado como admin no domínio publicado (registra a URL do worker).
- [ ] Apps criados no Mercado Livre e Pinterest com as Redirect URIs acima; conectados pelo painel.
- [ ] Pinterest em **Produção** só com acesso Standard (senão use Sandbox).
- [ ] Categorias acompanhadas + comissões; board padrão; janelas/limite diário de publicação revisados.
- [ ] Diagnóstico completo verde (OpenAI/Apify podem ficar "não configurado").
- [ ] Nível de automação escolhido (começar em 1 — Assistido).
- [ ] Conferir após 1 dia: `/ml/logs` sem falhas recorrentes; `/ml/automacoes` com última execução OK.

## 7. Operação do dia a dia (minutos por dia)

1. **Central de Pendências** (`/ml/pendencias`): aprovar produtos, colar links (fila "Salvar e próximo"),
   enviar imagens manuais (se usar ChatGPT), aprovar criativos e publicações, resolver exceções.
2. **Publicações**: conferir agendados/falhas.
3. **Analytics**: semanalmente; importar comissões (CSV do painel de afiliados).

## 8. Recuperação

- Job falhou definitivamente → aparece na Central e em Logs; "Reprocessar" cria um novo job (handlers idempotentes).
- Token revogado → pendência "Reconectar"; botão Reconectar em Integrações.
- Pin com timeout ambíguo → a próxima tentativa procura o Pin no board antes de criar outro (não duplica).
- Desfazer um descarte → botão "Restaurar" na página do produto.

---

## 9. V2 — famílias de criativos (passo a passo)

**Importar imagens do anúncio.** Ao aprovar um produto o app importa sozinho as fotos do anúncio para a galeria
(Produto › Imagens do anúncio), com origem, URL original, cópia no Storage e dimensões. Botão "Importar ou atualizar
imagens" refaz pela API; "Adicionar por URL" aceita só imagens do Mercado Livre (segurança); outras fontes, use
"Enviar imagem". A automação "Atualizar imagens dos produtos" reimporta semanalmente.

**Selecionar referências.** A foto principal do anúncio vira "Referência principal" automaticamente e as próximas 2
nítidas, "Complementares". Ajuste por imagem: principal / complementar / não usar / somente consulta. Fotos com selos
ou textos comerciais podem ficar como "somente consulta" (não vão para o gerador). "Preparar recorte" testa se dá
para remover o fundo (só funciona com fundo uniforme — foto de estúdio).

**Gerar lote (wizard).** Produto › "Criar família de criativos": referências → estratégia (quantidades por tipo,
modo de fidelidade, método) → cenas → quantidade → Pinterest (board, headlines opcionais) → confirmação com custo
estimado. Modos:
- **Composição exata** (recomendado): o produto real é recortado e colocado sobre um cenário (IA gera só o ambiente;
  sem OpenAI, cenário estilizado). Não há risco de a IA alterar o produto.
- **Geração por referência**: a IA recria a cena com o produto a partir das fotos — passa sempre pela checagem de
  fidelidade e não é aprovada sem ela.
- **Foto original + layout**: máxima fidelidade, custo zero.

**ChatGPT manual com referência.** Pendências › Imagens manuais: baixe as referências (ou "Baixar todas"), copie o
prompt, gere no ChatGPT anexando as imagens, envie o resultado. O app marca "feito com IA", checa a fidelidade (se a
OpenAI estiver configurada) e gera o pacote Pinterest sozinho → "Salvar e próximo".

**Revisar fidelidade.** Criativos › variante › "Ver referência lado a lado" e "Revisar fidelidade" (checklist do §5.2:
quantidade, cor/acabamento, geometria, instalação, acessórios, claims, funções, escala). Tudo marcado = "Fiel
(confirmado)"; qualquer item falho = "Fidelidade reprovada" (bloqueia aprovação até regerar a cena).

**Aprovar pacote Pinterest.** Cada variante tem o próprio pacote (título, descrição com aviso de afiliado, alt text,
board, link, flag de IA). Só aprova/publica com o pacote "pronto"; os erros aparecem no editor e na Central.

**Mix de criativos e cooldown.** Configurações › Criativos V2: quantidade e distribuição por tipo, modo padrão,
limite de custo por lote, cooldown entre variantes do mesmo produto (padrão 72 h), limite por board/dia,
similaridade visual/headline máxima e anti-flood. O agendamento automático escolhe UMA variante por produto por vez,
diferente da última publicada.

**Analytics por família e variante.** Analytics › relatórios "Por família", "Por tipo visual", "Por cena",
"Com × sem texto", "Por modo de criação", "IA × sem IA", "Top Pins" e "Coortes" (7/14/30 dias após publicar — só
Pins com o período completo). Use para descobrir cena e tipo de criativo que mais geram clique; ajuste de pesos do
score continua manual e versionado.

**Troubleshooting.**
- *Variante parada em "Em geração"*: o varredor "Processar pipeline" retoma em até 30 min; veja o job em Logs (filtro
  por evento: falha de download/Storage).
- *Recorte "não possível"*: fundo da foto não é uniforme — a composição usa a foto inteira emoldurada (continua fiel).
- *Fidelidade reprovada*: regere a cena, troque a referência ou use composição exata.
- *AI disclosure*: com a flag ligada, o Pin é criado com `ai_disclosures: AI_MODIFIED` (campo oficial). Se a conta não
  aceitar, o app registra a limitação, publica sem o campo e mantém o flag interno (Publicações mostra "flag interno").
- *Storage*: imagens ficam em `ml-media/creatives/…` e `ml-media/media/…`; a Limpeza remove referências temporárias e,
  depois de `retencao_rejeitados_dias` (Criativos V2), as imagens de variantes rejeitadas que nunca viraram Pin (a linha
  do criativo fica para o histórico).
