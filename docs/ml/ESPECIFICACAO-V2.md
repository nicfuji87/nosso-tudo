# ML Afiliados — Especificação V2 incremental

**Projeto:** módulo `/ml` dentro do Nosso Tudo  
**Objetivo desta versão:** evoluir a implementação já existente sem reescrever a fundação validada. A principal mudança é tratar cada produto como uma **família de criativos**, usando as fotos reais do anúncio como referência, gerando múltiplas cenas e construindo automaticamente o pacote completo de publicação do Pinterest.

## 0. Regra principal para o agente

Não reinicie o módulo e não substitua a arquitetura que já funciona. Antes de criar migration, tabela, rota, serviço ou componente, inspecione a branch atual e o schema remoto. Reutilize o que já existe. As mudanças desta V2 são incrementais.

Preservar obrigatoriamente, salvo defeito comprovado:

- rota funcional sob `/ml` dentro do Nosso Tudo;
- prefixo `ml_` em estruturas específicas do módulo;
- autenticação existente do Nosso Tudo;
- Supabase/Postgres como fonte de verdade;
- Supabase Vault para secrets, tokens e credenciais;
- worker próprio e fila no Postgres;
- `pg_cron` chamando o worker periodicamente;
- schedules e crons editáveis pelo painel;
- idempotência, leases, retries e recuperação de jobs travados;
- fluxo manual de link afiliado com “Salvar e próximo”;
- OpenAI e Apify opcionais;
- funcionamento sem OpenAI;
- modo manual de imagem via ChatGPT;
- logs, auditoria e testes existentes.

Antes de implementar esta V2, ler: `PLANO-ML.md`, `docs/ml/`, migrations existentes e o schema real das tabelas `ml_*`.

---

# 1. Resultado desejado

O sistema deve operar o seguinte ciclo:

1. Descobrir produtos relevantes no Mercado Livre.
2. Enriquecer, pontuar e recomendar candidatos.
3. Usuário aprova o produto.
4. Se necessário, usuário gera e cola o link de afiliado oficial.
5. Sistema importa e organiza as **imagens reais do anúncio**.
6. Usuário ou regra automática seleciona as melhores imagens de referência.
7. Sistema cria uma **família de criativos** para o produto.
8. Para a mesma família, gerar diferentes variações visuais e editoriais.
9. Para cada criativo, gerar automaticamente o **pacote Pinterest**.
10. Usuário aprova em lote ou individualmente.
11. Sistema agenda e publica respeitando limites, diversidade e cooldown.
12. Sistema coleta métricas e compara produto, ângulo, cena e variante.
13. Aprendizado posterior influencia priorização e geração futura.

O princípio deixa de ser “um produto gera um Pin” e passa a ser:

> **um produto gera uma família de criativos, e cada criativo possui seu próprio pacote de publicação e métricas.**

---

# 2. O que já existe e não deve ser refeito

A base atual já possui as 11 telas da especificação anterior, fila rápida de links e fluxo manual ChatGPT. O banco já possui dezenas de tabelas `ml_*`, a fila roda no Postgres, os horários são configuráveis, credenciais ficam no Vault e há testes para fila, cron, score, estados e criação de criativo.

A V2 deve aproveitar isso. Se um conceito novo puder ser representado estendendo uma tabela existente, prefira extensão a criar uma tabela duplicada. Crie nova tabela apenas quando houver ganho claro de normalização, histórico ou auditoria.

---

# 3. Nova unidade conceitual: Família de Criativos

Uma família de criativos representa um único produto e uma única hipótese de marketing, mas contém múltiplas variantes.

Exemplo:

- produto: kit com duas prateleiras adesivas pretas para banheiro;
- problema: falta de espaço no box;
- benefício: organização sem furar a parede;
- board principal: Banheiro Pequeno;
- família: “Organize o box sem reforma”.

Variantes possíveis da mesma família:

- lifestyle sem texto, banheiro pequeno claro;
- lifestyle sem texto, banheiro minimalista quente;
- lifestyle sem texto, banheiro moderno escuro;
- lifestyle com headline curta;
- lifestyle com headline alternativa;
- editorial com dica ou lista.

Cada variante deve continuar relacionada ao mesmo produto, link afiliado e família, mas possuir sua própria imagem, prompt, copy, publicação e métricas.

---

# 4. Imagens do anúncio e referências visuais

## 4.1 Ingestão

Ao descobrir ou abrir um produto, o sistema deve tentar obter e armazenar todas as imagens úteis do anúncio por fonte permitida e disponível.

Fontes possíveis:

- API oficial do Mercado Livre;
- dados já retornados pelo processo de descoberta;
- Apify, se configurado e necessário;
- URL de imagem adicionada manualmente;
- upload manual.

Nunca depender do Apify para o app funcionar.

## 4.2 Armazenamento e proveniência

Para cada mídia, guardar ao menos:

- produto;
- origem;
- URL original;
- URL no Storage, quando houver cópia local permitida;
- largura e altura;
- tipo MIME;
- checksum quando viável;
- ordem original;
- data de captura;
- se é imagem principal;
- se está aprovada para referência;
- observação de proveniência ou uso.

Não remover de forma automática marcas, selos ou elementos da imagem original para criar uma representação enganosa. Se uma imagem contiver elementos comerciais que não devem aparecer no criativo, ela pode servir apenas como referência do produto.

## 4.3 Papel das imagens

O usuário deve poder marcar cada imagem como:

- Referência principal;
- Referência complementar;
- Não usar para geração;
- Somente consulta.

A geração deverá aceitar uma ou mais imagens de referência.

---

# 5. Fidelidade do produto

A V2 deve priorizar fidelidade comercial. Uma imagem bonita que modifica materialmente o produto é pior que uma imagem menos sofisticada e fiel.

## 5.1 Modos de fidelidade

### A. Composição exata — preferencial para comércio

Usar o produto real como camada preservada e criar apenas o contexto visual ao redor.

Fluxo lógico:

1. obter imagem real;
2. preparar recorte ou máscara quando possível;
3. gerar ou selecionar cenário;
4. posicionar o produto real no cenário;
5. aplicar sombra, perspectiva e integração visual sem alterar o produto;
6. aplicar texto de forma programática quando necessário.

Esse modo deve ser o padrão quando a forma exata do item importa.

### B. Geração com imagem de referência

Enviar a foto do anúncio junto ao prompt para um modelo multimodal de imagem. O prompt deve exigir preservação de quantidade, cor, geometria, proporções e função.

Esse modo sempre deve passar por revisão de fidelidade antes de publicação automática.

### C. Layout com foto original

Usar a própria foto do anúncio em uma composição vertical com fundo, margens, cards, headline e identidade visual. É o fallback de maior fidelidade e menor custo.

## 5.2 Checklist de fidelidade

Antes de aprovar uma imagem gerada, verificar:

- quantidade de peças igual ao produto;
- cor e acabamento coerentes;
- geometria e estrutura coerentes;
- modo de instalação não inventado;
- acessórios não incluídos não podem parecer parte do produto;
- não inserir garantia, preço ou claim inexistente;
- não criar funções que o anúncio não sustenta;
- não fazer o produto parecer maior ou menor de forma materialmente enganosa.

O sistema pode calcular uma análise de fidelidade assistida por IA, mas no modo Assistido ela não substitui revisão humana.

---

# 6. Mix de criativos por produto

O default recomendado deve ser configurável. Sugestão inicial:

- 3 variantes lifestyle sem texto;
- 2 variantes lifestyle com texto curto;
- 1 variante editorial.

Total sugerido: 6 criativos gerados por produto aprovado.

Isso não significa publicar os seis imediatamente. Os criativos entram em uma **piscina de experimentos** e são agendados respeitando cooldown e diversidade.

## 6.1 Lifestyle sem texto

Objetivo: inspiração e desejo. Deve parecer “veja como ficaria no seu banheiro”.

Exemplos de cenas:

- banheiro pequeno claro;
- box minimalista;
- banheiro moderno com tons neutros;
- banheiro sofisticado escuro;
- apartamento compacto;
- banheiro funcional do dia a dia.

Não inserir texto, preço, selo, logo do marketplace ou badge de garantia.

## 6.2 Lifestyle com texto curto

Mesma lógica de ambiente, com headline curta e legível.

Exemplos:

- Ganhe espaço no banheiro sem reforma
- Organize o box sem furar a parede
- Solução prática para banheiro pequeno

O texto deve ser aplicado preferencialmente de forma programática depois da imagem, para evitar erros tipográficos do modelo.

## 6.3 Editorial

Usar composição mais informativa, por exemplo:

- 3 ideias para organizar o box
- Como aproveitar melhor um banheiro pequeno
- Uma solução para tirar os frascos do chão do box

Evitar aparência de anúncio agressivo.

---

# 7. Presets de cena

Criar presets administráveis. Cada preset deve ter:

- nome;
- ambiente;
- paleta;
- iluminação;
- estilo;
- nível de realismo;
- áreas reservadas para texto;
- restrições;
- ativo ou inativo.

Presets iniciais sugeridos:

- Banheiro pequeno claro;
- Banheiro minimalista quente;
- Banheiro moderno neutro;
- Banheiro premium escuro;
- Cozinha compacta clara;
- Cozinha minimalista;
- Lavanderia pequena organizada;
- Espaço compacto multifuncional.

A lista deve ser extensível pelo painel sem alterar código.

---

# 8. Prompt builder

O prompt não deve ser texto solto hardcoded. Deve ser montado a partir de um template versionado.

Entrada mínima:

- produto e categoria;
- características confirmadas;
- referência principal e complementares;
- tipo de criativo;
- preset de cena;
- ângulo;
- benefício;
- headline quando houver;
- restrições de fidelidade;
- proporção e tamanho.

## 8.1 Template — lifestyle sem texto

Use a imagem anexada do produto como referência de identidade visual. Preserve rigorosamente quantidade de peças, cor, formato, estrutura, acabamento e função do produto. Não invente acessórios ou características. Crie uma cena vertical realista e premium mostrando o produto instalado e em uso em um {scene_preset}. O ambiente deve transmitir {benefit}. A composição deve parecer uma fotografia editorial de decoração e organização, com iluminação natural, proporções realistas e integração convincente. Não inclua texto, preço, selos, logotipos de marketplace, marcas inventadas ou badges. O produto deve ser o elemento principal, mas a cena precisa parecer um ambiente real e desejável.

## 8.2 Template — lifestyle com texto

Gerar primeiro a imagem sem texto. O overlay deve ser aplicado pelo compositor do app sempre que possível.

Campos:

- headline;
- subtítulo opcional;
- posição;
- área segura;
- tipografia da marca;
- contraste mínimo.

## 8.3 Template — manual ChatGPT

A tela deve mostrar:

- referências selecionadas;
- botão Baixar referência;
- botão Baixar todas;
- prompt final pronto;
- botão Copiar prompt;
- instrução curta para anexar as imagens no ChatGPT;
- área de upload do resultado;
- botão Salvar e próximo.

Não automatizar a interface de consumo do ChatGPT.

---

# 9. Pacote Pinterest por criativo

Cada criativo deve possuir um pacote de publicação próprio, gerado automaticamente e editável.

Campos internos obrigatórios:

- `title`;
- `description`;
- `affiliate_url`;
- `board_id` sugerido ou escolhido;
- `board_section_id` quando aplicável;
- `alt_text`;
- interesses sugeridos para referência de UI, quando não houver suporte de escrita pela API;
- `ai_modified`;
- disclosure comercial;
- método de geração;
- versão do template de copy;
- status de validação.

O adapter do Pinterest só deve enviar campos realmente suportados pela versão atual da API. Não inventar parâmetro. Campos auxiliares continuam armazenados no app para revisão e auditoria.

## 9.1 Regras de copy

O título deve enfatizar problema, benefício ou intenção, e não apenas repetir o nome do SKU.

A descrição deve:

- explicar utilidade;
- permanecer consistente com o produto real;
- conter disclosure comercial claro quando aplicável;
- evitar claims não comprovados;
- evitar preço fixo salvo quando houver verificação de validade;
- evitar keyword stuffing.

## 9.2 Alt text

Descrever a imagem de forma objetiva e acessível. Não usar o alt text como campo de SEO agressivo.

## 9.3 AI disclosure

Guardar explicitamente se o criativo foi gerado ou modificado por IA. O adapter deve mapear essa informação para o mecanismo oficial disponível na API atual quando suportado. Se a versão da API não aceitar gravação explícita, não criar campo fictício: registrar a limitação, manter o flag interno e depender do comportamento oficial do Pinterest, incluindo seus mecanismos de detecção e rotulagem.

---

# 10. Links de afiliado

Preservar o fluxo atual “Abrir produto → colar link → Validar → Salvar e próximo”.

Melhorias:

- mostrar ID do produto;
- mostrar etiqueta de afiliado associada;
- resolver redirecionamento server-side de forma segura para validar que o destino final corresponde ao Mercado Livre esperado;
- registrar host final e data da última validação;
- bloquear publicação se o link estiver ausente, inválido ou apontar para destino inconsistente;
- nunca substituir link oficial por encurtador próprio.

Se o Pinterest rejeitar um formato de URL, gerar uma pendência específica em vez de alterar o destino silenciosamente.

---

# 11. Telas — alterações completas

## 11.1 Dashboard

Manter blocos atuais e adicionar:

- Famílias de criativos em teste;
- Criativos sem referência aprovada;
- Criativos com alerta de fidelidade;
- Pins publicados por tipo visual;
- melhor cena e melhor tipo de criativo no período;
- pendências de pacote Pinterest.

Ações:

- Executar descoberta agora;
- Abrir pendências;
- Gerar lote de criativos dos produtos elegíveis;
- Pausar ou retomar automações.

## 11.2 Descobertas

Manter a tela atual. Acrescentar indicadores:

- número de imagens disponíveis;
- qualidade visual da imagem principal;
- potencial de uso lifestyle;
- se já existe família criativa ativa.

Ações em lote devem continuar disponíveis.

## 11.3 Produto / Detalhe

Adicionar aba ou seção **Imagens do anúncio**.

Mostrar:

- galeria completa;
- origem da imagem;
- dimensão;
- imagem principal;
- flags de referência;
- histórico de atualização.

Botões:

- Importar ou atualizar imagens;
- Usar como referência principal;
- Usar como complementar;
- Não usar;
- Abrir original;
- Baixar referência;
- Criar família de criativos;
- Gerar lote.

Na mesma tela, mostrar famílias e variantes já criadas para o produto.

## 11.4 Links de afiliado

Preservar fluxo rápido atual. Adicionar:

- miniatura principal;
- ID externo;
- etiqueta;
- status da validação de redirect;
- destino final detectado.

Botões:

- Abrir produto;
- Colar;
- Validar;
- Salvar e próximo;
- Ignorar por agora.

## 11.5 Criativos

A tela deixa de ser apenas lista de imagens e passa a trabalhar por família.

Visões:

- Por família;
- Todas as variantes;
- A gerar;
- Em geração;
- Revisão;
- Aprovados;
- Rejeitados;
- Publicados.

Card de família:

- produto;
- hipótese ou ângulo;
- imagem de referência;
- quantidade de variantes;
- quantidade aprovada;
- board principal;
- melhor métrica quando houver;
- status.

Card de variante:

- imagem;
- tipo visual;
- cena;
- texto na imagem ou sem texto;
- fidelity status;
- título Pinterest;
- board;
- método de geração;
- AI modified;
- status;
- métricas.

Botões de família:

- Gerar lote;
- Adicionar variante;
- Duplicar hipótese;
- Aprovar selecionados;
- Agendar aprovados;
- Arquivar família.

Botões de variante:

- Ver referência lado a lado;
- Aprovar;
- Rejeitar;
- Marcar problema de fidelidade;
- Regerar cena;
- Regerar copy;
- Trocar referência;
- Editar pacote Pinterest;
- Baixar;
- Duplicar;
- Excluir rascunho.

## 11.6 Wizard Gerar Lote

Etapa 1 — Referências:

- selecionar imagem principal;
- selecionar complementares.

Etapa 2 — Estratégia:

- lifestyle sem texto;
- lifestyle com texto;
- editorial;
- composição exata;
- geração por referência.

Etapa 3 — Cenas:

- escolher presets;
- permitir seleção múltipla.

Etapa 4 — Quantidade:

- número total;
- distribuição entre tipos.

Etapa 5 — Pinterest:

- board padrão;
- gerar títulos e descrições;
- disclosure padrão;
- regra de alt text.

Etapa 6 — Confirmação:

- mostrar custo estimado quando API paga estiver ativa;
- mostrar quantidade de jobs;
- iniciar.

## 11.7 Modo manual ChatGPT

Para cada variante manual:

- mostrar as imagens de referência;
- mostrar prompt final;
- Copiar prompt;
- Baixar referência;
- Baixar todas as referências;
- Upload do resultado;
- Marcar automaticamente `ai_modified = true` após upload pelo fluxo;
- Fazer revisão de fidelidade;
- Gerar pacote Pinterest;
- Salvar e próximo.

## 11.8 Calendário / Publicações

Manter visualizações atuais e adicionar:

- badge de família;
- badge do tipo de criativo;
- indicador de repetição do mesmo produto;
- cooldown restante;
- validação do link;
- validação do produto;
- AI disclosure interno.

O agendador não deve publicar várias variantes praticamente idênticas em sequência.

## 11.9 Analytics

Adicionar análise por:

- família;
- variante;
- tipo visual;
- cena;
- com texto versus sem texto;
- headline;
- board;
- produto;
- faixa de preço;
- período após publicação.

Criar coortes de 7, 14 e 30 dias quando houver dados suficientes.

KPIs:

- impressões;
- saves;
- pin clicks;
- outbound clicks;
- CTR;
- comissão quando importada;
- EPC quando possível;
- receita por Pin;
- receita por família;
- outbound clicks por mil impressões.

## 11.10 Automações e Crons

Preservar o editor atual e acrescentar schedules configuráveis para:

- atualização de imagens do produto;
- geração automática de pacote Pinterest após aprovação do criativo;
- rollup diário de performance por variante e família;
- revalidação de links e produtos agendados;
- limpeza de assets rejeitados após retenção configurada.

Não gerar ou publicar grandes lotes automaticamente por padrão.

## 11.11 Integrações

Manter cards atuais. Em OpenAI, mostrar separadamente:

- texto;
- visão e análise de fidelidade;
- imagem.

Permitir modelos diferentes por função quando configurável.

## 11.12 Configurações

Adicionar grupo **Criativos V2**:

- quantidade padrão por produto;
- distribuição por tipo;
- presets de cena ativos;
- modo de fidelidade padrão;
- exigir revisão humana para geração por referência;
- aplicar texto programaticamente;
- formato padrão 2:3;
- resolução preferencial;
- limite de custo por lote;
- cooldown entre variantes do mesmo produto;
- máximo de variantes ativas por família;
- retenção de rejeitados.

Adicionar grupo **Pinterest Copy**:

- disclosure padrão;
- tom de voz;
- regras de título;
- regras de descrição;
- regra de alt text;
- board mapping.

## 11.13 Logs e Erros

Adicionar filtros e eventos:

- importação de mídia;
- falha de download;
- falha de Storage;
- prompt gerado;
- imagem gerada;
- fidelity warning;
- Pinterest package invalid;
- link redirect inconsistente;
- variante bloqueada por cooldown;
- variante bloqueada por repetição.

---

# 12. Central de Pendências

Manter como centro de trabalho humano. Novas categorias:

- Selecionar referência do produto;
- Link afiliado pendente;
- Criativo manual aguardando ChatGPT;
- Criativo com baixa fidelidade;
- Criativo aguardando aprovação;
- Pacote Pinterest incompleto;
- Publicação bloqueada;
- Reconectar integração.

Ordenação recomendada:

1. bloqueios que impedem publicações próximas;
2. links afiliados;
3. referências;
4. fidelidade;
5. aprovação de criativos;
6. exceções.

A meta continua sendo poucos minutos por dia.

---

# 13. Estados e transições adicionais

Preservar os estados existentes. Adicionar estados internos apenas se o schema atual não representar adequadamente:

- MEDIA_PENDING;
- MEDIA_READY;
- REFERENCE_REVIEW;
- CREATIVE_FAMILY_READY;
- CREATIVE_GENERATING;
- FIDELITY_REVIEW;
- PINTEREST_PACKAGE_READY;
- READY_TO_SCHEDULE.

Não duplicar status se já existirem equivalentes.

---

# 14. Dados — extensão incremental

Antes de criar migration, inspecionar as tabelas existentes.

## 14.1 Mídia de produto

Se não existir estrutura equivalente, criar `ml_product_media` com:

- id;
- product_id;
- source_type;
- source_url;
- storage_path;
- media_role;
- sort_order;
- width;
- height;
- mime_type;
- checksum;
- is_primary;
- use_as_reference;
- reference_priority;
- provenance_note;
- captured_at;
- created_at;
- updated_at.

## 14.2 Famílias de criativos

Se não existir equivalente, criar `ml_creative_families`:

- id;
- product_id;
- angle_id;
- hypothesis;
- objective;
- default_board_id;
- affiliate_link_id;
- status;
- created_at;
- archived_at.

## 14.3 Criativos

Preferir estender `ml_creatives` existente com os campos necessários:

- family_id;
- visual_type;
- scene_preset_id;
- fidelity_mode;
- source_media_ids;
- generation_method;
- prompt_text;
- prompt_version;
- image_url;
- width;
- height;
- aspect_ratio;
- ai_modified;
- fidelity_status;
- fidelity_score opcional;
- fidelity_notes;
- approved_at;
- rejected_reason.

## 14.4 Pacote Pinterest

Se `ml_publications` ou `ml_creatives` já tiver os campos, não criar tabela nova. Caso contrário, criar estrutura versionada para:

- creative_id;
- title;
- description;
- alt_text;
- affiliate_link_id;
- board_id;
- board_section_id;
- interests_json;
- ai_modified;
- disclosure_text;
- payload_json;
- payload_version;
- validation_status;
- validation_errors;
- created_at;
- updated_at.

## 14.5 Presets e templates

Criar apenas se não houver configuração equivalente:

- `ml_scene_presets`;
- `ml_prompt_templates`.

Templates devem ter versão, tipo, ativo e data de alteração.

---

# 15. Novos jobs

Reutilizar fila existente. Adicionar handlers quando necessários:

- IMPORT_PRODUCT_MEDIA;
- REFRESH_PRODUCT_MEDIA;
- PREPARE_PRODUCT_CUTOUT;
- PLAN_CREATIVE_FAMILY;
- GENERATE_CREATIVE_BATCH;
- GENERATE_LIFESTYLE_BACKGROUND;
- GENERATE_REFERENCE_IMAGE;
- COMPOSE_EXACT_PRODUCT;
- APPLY_TEXT_OVERLAY;
- GENERATE_PINTEREST_PACKAGE;
- CHECK_CREATIVE_FIDELITY;
- VALIDATE_AFFILIATE_REDIRECT;
- ROLLUP_CREATIVE_PERFORMANCE.

Regras:

- todos idempotentes;
- nenhum job pode sobrescrever um asset aprovado;
- nova geração cria variante nova;
- retries preservam contexto;
- jobs pagos devem registrar custo estimado e realizado quando disponível;
- jobs de lote precisam de parent job ou batch id para acompanhamento.

---

# 16. Regras de publicação e anti-repetição

O sistema deve separar **gerar** de **publicar**. Pode gerar seis variantes e publicar apenas uma.

Regras configuráveis:

- cooldown entre variantes do mesmo produto;
- limite por produto em uma janela;
- limite por board;
- similaridade visual máxima antes de alertar;
- similaridade de headline;
- não publicar a mesma imagem com copy quase idêntica;
- priorizar variações realmente úteis ao usuário;
- impedir flood após recuperação de fila atrasada.

O objetivo é consistência e aprendizado, não volume cego.

---

# 17. Analytics e aprendizado

Cada publicação deve permitir responder:

- qual produto era;
- qual família;
- qual variante;
- qual imagem de referência;
- qual tipo visual;
- qual preset de cena;
- qual headline;
- qual board;
- qual método de geração;
- qual prompt version;
- se continha texto na imagem;
- se era IA modificada;
- qual link afiliado.

Não alterar pesos do score automaticamente sem versionamento.

Primeiro criar relatórios. Depois, quando houver volume suficiente, implementar sugestões de ajuste. Automação de pesos deve ser fase posterior e reversível.

---

# 18. Exemplo de produto — fluxo de referência

Produto: kit com duas prateleiras pretas adesivas para banheiro.

Entrada:

- foto principal do anúncio;
- fotos secundárias;
- produto aprovado;
- link afiliado inserido.

Família:

- hipótese: pessoas com banheiro pequeno respondem a “organizar sem reforma”.

Variantes:

1. Lifestyle sem texto — banheiro pequeno claro.
2. Lifestyle sem texto — banheiro minimalista quente.
3. Lifestyle sem texto — banheiro premium escuro.
4. Lifestyle com headline — “Ganhe espaço no banheiro sem reforma”.
5. Lifestyle com headline — “Organize o box sem furar a parede”.
6. Editorial — “3 ideias para organizar o box”.

Cada variante recebe título, descrição, alt text, board e link afiliado próprios, podendo reutilizar o mesmo destino.

---

# 19. Critérios de aceite V2

A V2 estará pronta quando:

- [ ] produto exibir galeria de imagens reais do anúncio;
- [ ] usuário puder selecionar referência principal e complementares;
- [ ] referências forem enviadas no fluxo automático de imagem quando suportado;
- [ ] modo manual ChatGPT entregar prompt e referências de forma simples;
- [ ] sistema gerar múltiplas variantes por produto;
- [ ] existir pelo menos um modo lifestyle sem texto;
- [ ] existir modo lifestyle com overlay aplicado de forma confiável;
- [ ] existir modo de alta fidelidade com produto real preservado ou fallback equivalente;
- [ ] cada variante tiver pacote Pinterest próprio;
- [ ] pacote contiver título, descrição, alt text, board e affiliate link;
- [ ] AI modified ficar rastreado internamente;
- [ ] adapter Pinterest usar apenas campos suportados na API ativa;
- [ ] aprovação individual e em lote funcionarem;
- [ ] calendário mostrar família e tipo de variante;
- [ ] cooldown e anti-repetição impedirem flood;
- [ ] métricas conseguirem ser agrupadas por família, variante, cena e tipo visual;
- [ ] jobs novos forem idempotentes e observáveis;
- [ ] lint, typecheck, build e testes ficarem verdes;
- [ ] não houver regressão nas 11 telas e fluxos existentes.

---

# 20. Ordem de implementação

1. Auditar schema e código atual.
2. Criar ou adaptar modelo de mídia do produto.
3. Implementar importação e seleção de referências.
4. Criar conceito de família e variantes usando o schema atual sempre que possível.
5. Implementar wizard Gerar Lote.
6. Atualizar modo manual ChatGPT.
7. Implementar prompt builder versionado.
8. Implementar geração automática com referência.
9. Implementar modo de composição exata e overlay programático.
10. Implementar pacote Pinterest por variante.
11. Atualizar aprovação e Central de Pendências.
12. Atualizar calendário e regras anti-repetição.
13. Atualizar Analytics e rollups.
14. Atualizar configurações, logs e documentação.
15. Testar com um produto real em Sandbox antes de habilitar produção.

Não iniciar pelas telas se o modelo de dados e estados ainda estiverem indefinidos.

---

# 21. Definition of Done por fase

Para cada fase:

1. código implementado;
2. migration versionada, se houver;
3. tipos atualizados;
4. testes unitários;
5. testes de integração aplicáveis;
6. lint;
7. typecheck;
8. build;
9. fluxo validado com dados reais ou sandbox quando disponível;
10. documentação atualizada;
11. sem regressão do fluxo existente.

---

# 22. Políticas e guardrails

- Conteúdo afiliado deve ser original, útil e transparente.
- Não produzir ou publicar em massa de forma repetitiva.
- Não alterar silenciosamente o destino de links.
- Não publicar imagem que represente incorretamente o produto.
- Não inventar claim, material, capacidade, garantia ou acessório.
- Não depender de scraping quando API oficial atende o caso.
- Não automatizar interface de consumidor do ChatGPT.
- Não criar parâmetros de API que não existam; adaptar ao schema real da versão ativa.
- Registrar decisões automáticas e versões de prompt.

---

# 23. Atualização da documentação operacional

Após implementar, atualizar `docs/ml/OPERACAO.md` para incluir:

- como importar imagens do anúncio;
- como selecionar referências;
- como gerar lote;
- como usar ChatGPT manualmente com referência;
- como revisar fidelidade;
- como aprovar pacote Pinterest;
- como configurar mix de criativos e cooldown;
- como interpretar Analytics por família e variante;
- troubleshooting de geração, Storage e AI disclosure.

