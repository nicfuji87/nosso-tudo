-- =============================================================================
-- ML — 04: V2 (docs/ml/ESPECIFICACAO-V2.md) — mídia do anúncio, famílias de
-- criativos, presets de cena, templates de prompt, fidelidade e pacote Pinterest.
--
-- Incremental (§14): estende ml_creatives / ml_creative_assets / ml_pins /
-- ml_affiliate_links. Tabelas novas só onde não havia equivalente:
--   ml_product_media      (ml_products.pictures é jsonb sem proveniência/papel)
--   ml_creative_families  (não havia agrupamento de variantes)
--   ml_scene_presets      (cenas administráveis pelo painel)
--   ml_prompt_templates   (prompts versionados; antes eram constantes no código)
-- O pacote Pinterest fica em ml_creatives (title/description/alt_text/board_id já
-- existiam) + colunas de pacote — sem tabela nova (§14.4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mídia do anúncio (§4)
-- -----------------------------------------------------------------------------
create table public.ml_product_media (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.ml_products(id) on delete cascade,
  source_type        text not null check (source_type in ('ml_api', 'discovery', 'apify', 'manual_url', 'upload')),
  source_url         text,                                -- URL original (null em upload)
  storage_path       text,                                -- cópia no bucket ml-media
  public_url         text,                                -- URL estável da cópia
  media_role         text not null default 'consult_only'
                     check (media_role in ('primary_reference', 'complementary', 'do_not_use', 'consult_only')),
  sort_order         int not null default 0,              -- ordem original no anúncio
  width              int,
  height             int,
  mime_type          text,
  checksum           text,                                -- sha256 da cópia
  is_primary         boolean not null default false,      -- imagem principal do anúncio
  reference_priority int,                                 -- ordem entre complementares
  role_source        text not null default 'auto' check (role_source in ('auto', 'user')),
  status             text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error              text,
  provenance_note    text,
  -- recorte (fundo removido) para composição exata (§5.1 A)
  cutout_path        text,
  cutout_url         text,
  cutout_status      text not null default 'none' check (cutout_status in ('none', 'ready', 'not_possible', 'failed')),
  cutout_note        text,
  captured_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index ml_product_media_source_idx on public.ml_product_media (product_id, source_url) where source_url is not null;
create index ml_product_media_product_idx on public.ml_product_media (product_id, sort_order);
-- no máximo UMA referência principal por produto
create unique index ml_product_media_primary_ref_idx on public.ml_product_media (product_id) where media_role = 'primary_reference';

alter table public.ml_products
  add column if not exists media_imported_at timestamptz,
  add column if not exists media_count int not null default 0;

-- -----------------------------------------------------------------------------
-- 2. Presets de cena (§7) e templates de prompt versionados (§8)
-- -----------------------------------------------------------------------------
create table public.ml_scene_presets (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  environment   text not null,                 -- ex.: "banheiro pequeno"
  palette       text,
  lighting      text,
  style         text,
  realism       text not null default 'fotográfico',
  text_area     text not null default 'top' check (text_area in ('top', 'bottom', 'none')),
  restrictions  text,
  category_hint text,                          -- palavras para sugerir por categoria (ex.: "banheiro|box")
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.ml_prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key in ('lifestyle_no_text', 'lifestyle_text', 'editorial', 'reference_generation',
                                           'exact_background', 'manual_chatgpt', 'pinterest_copy', 'fidelity_check')),
  version     int not null,
  body        text not null,
  active      boolean not null default true,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (key, version)
);
create unique index ml_prompt_templates_active_idx on public.ml_prompt_templates (key) where active;

-- -----------------------------------------------------------------------------
-- 3. Famílias de criativos (§3, §14.2)
-- -----------------------------------------------------------------------------
create table public.ml_creative_families (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.ml_products(id) on delete cascade,
  angle_id          uuid references public.ml_creative_angles(id) on delete set null,
  name              text not null,                -- ex.: "Organize o box sem reforma"
  hypothesis        text,
  objective         text,                         -- benefício principal
  default_board_id  uuid references public.ml_pinterest_boards(id) on delete set null,
  affiliate_link_id uuid references public.ml_affiliate_links(id) on delete set null,
  plan              jsonb not null default '{}'::jsonb,   -- plano do lote (mix, cenas, modo, referências)
  status            text not null default 'planning'
                    check (status in ('planning', 'generating', 'active', 'archived')),
  batch_job_id      uuid references public.ml_jobs(id) on delete set null,
  cost_estimated_usd numeric(10,4),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index ml_creative_families_product_idx on public.ml_creative_families (product_id, created_at desc);
create index ml_creative_families_status_idx on public.ml_creative_families (status);

-- -----------------------------------------------------------------------------
-- 4. Variantes: extensão de ml_creatives (§14.3) + pacote Pinterest (§9/§14.4)
-- -----------------------------------------------------------------------------
alter table public.ml_creatives
  add column if not exists family_id            uuid references public.ml_creative_families(id) on delete set null,
  add column if not exists visual_type          text not null default 'product_layout'
    check (visual_type in ('lifestyle_no_text', 'lifestyle_text', 'editorial', 'product_layout')),
  add column if not exists scene_preset_id      uuid references public.ml_scene_presets(id) on delete set null,
  add column if not exists fidelity_mode        text not null default 'original_layout'
    check (fidelity_mode in ('exact_composition', 'reference_generation', 'original_layout')),
  add column if not exists source_media_ids     uuid[] not null default '{}',
  add column if not exists base_asset_id        uuid references public.ml_creative_assets(id) on delete set null,
  add column if not exists has_text_overlay     boolean not null default false,
  add column if not exists editorial_points     text[] not null default '{}',
  add column if not exists ai_modified          boolean not null default false,
  add column if not exists fidelity_status      text not null default 'not_required'
    check (fidelity_status in ('not_required', 'pending', 'ok', 'warning', 'failed', 'human_ok')),
  add column if not exists fidelity_score       numeric(5,2),
  add column if not exists fidelity_notes       jsonb,
  add column if not exists fidelity_checked_at  timestamptz,
  -- pacote Pinterest
  add column if not exists board_section_id     text,
  add column if not exists interests            text[] not null default '{}',   -- só referência de UI (API não aceita escrita)
  add column if not exists disclosure_text      text,
  add column if not exists copy_template_version text,
  add column if not exists package_status       text not null default 'missing'
    check (package_status in ('missing', 'incomplete', 'ready', 'invalid')),
  add column if not exists package_errors       jsonb,
  add column if not exists package_version      int not null default 0,
  add column if not exists package_updated_at   timestamptz,
  -- custo (jobs pagos — §15)
  add column if not exists cost_estimated_usd   numeric(10,4),
  add column if not exists cost_actual_usd      numeric(10,4),
  -- similaridade visual (dHash 64 bits em hex) para anti-repetição (§16)
  add column if not exists image_hash           text;

create index if not exists ml_creatives_family_idx on public.ml_creatives (family_id);
create index if not exists ml_creatives_fidelity_idx on public.ml_creatives (fidelity_status) where fidelity_status in ('pending', 'warning', 'failed');
create index if not exists ml_creatives_package_idx on public.ml_creatives (package_status) where package_status in ('incomplete', 'invalid');

alter table public.ml_creative_assets
  add column if not exists kind            text not null default 'final' check (kind in ('final', 'base', 'background')),
  add column if not exists parent_asset_id uuid references public.ml_creative_assets(id) on delete set null,
  add column if not exists image_hash      text;

-- Pins guardam o que foi publicado (família e flag de IA no momento da publicação)
alter table public.ml_pins
  add column if not exists family_id        uuid references public.ml_creative_families(id) on delete set null,
  add column if not exists board_section_id text,
  add column if not exists ai_modified      boolean not null default false,
  add column if not exists ai_disclosure_sent boolean;

create index if not exists ml_pins_family_idx on public.ml_pins (family_id);

-- -----------------------------------------------------------------------------
-- 5. Links de afiliado: validação de redirect persistida (§10)
-- -----------------------------------------------------------------------------
alter table public.ml_affiliate_links
  add column if not exists final_url       text,
  add column if not exists final_host      text,
  add column if not exists redirect_status text not null default 'unchecked'
    check (redirect_status in ('unchecked', 'ok', 'ok_unverified', 'inconsistent', 'error')),
  add column if not exists last_checked_at timestamptz;

-- -----------------------------------------------------------------------------
-- 6. updated_at + RLS (mesmo padrão da ml01: leitura por papel, escrita servidor)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ml_product_media', 'ml_scene_presets', 'ml_creative_families']
  loop
    execute format('create trigger tg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.trigger_set_updated_at()', t);
  end loop;
  foreach t in array array['ml_product_media', 'ml_scene_presets', 'ml_prompt_templates', 'ml_creative_families']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.ml_has_role(''viewer''))',
                   'p_' || t || '_read', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Dados iniciais: presets (§7) e templates v1 (§8)
-- -----------------------------------------------------------------------------
insert into public.ml_scene_presets (key, name, environment, palette, lighting, style, text_area, restrictions, category_hint, sort) values
  ('banheiro_pequeno_claro', 'Banheiro pequeno claro', 'banheiro pequeno de apartamento', 'branco, bege claro e madeira clara', 'luz natural suave da manhã', 'escandinavo, limpo e organizado', 'top', 'sem pessoas; sem marcas visíveis', 'banheiro|box|chuveiro|lavabo', 10),
  ('banheiro_minimalista_quente', 'Banheiro minimalista quente', 'banheiro minimalista', 'terracota, areia e off-white', 'luz quente de fim de tarde', 'minimalista aconchegante', 'top', 'sem pessoas; poucos objetos', 'banheiro|box|chuveiro', 20),
  ('banheiro_moderno_neutro', 'Banheiro moderno neutro', 'banheiro moderno', 'cinza, branco e preto fosco', 'luz difusa de estúdio', 'contemporâneo', 'top', 'sem pessoas', 'banheiro|box|chuveiro', 30),
  ('banheiro_premium_escuro', 'Banheiro premium escuro', 'banheiro sofisticado', 'grafite, preto e dourado discreto', 'iluminação indireta quente', 'premium, hotel boutique', 'bottom', 'sem pessoas; sem excesso de reflexos', 'banheiro|box|chuveiro', 40),
  ('cozinha_compacta_clara', 'Cozinha compacta clara', 'cozinha compacta de apartamento', 'branco, verde-sálvia e madeira', 'luz natural de janela', 'funcional e organizado', 'top', 'sem pessoas; sem comida de marca', 'cozinha|geladeira|pia|panela|pote|tempero', 50),
  ('cozinha_minimalista', 'Cozinha minimalista', 'cozinha minimalista', 'off-white, cinza claro e inox', 'luz natural difusa', 'minimalista', 'top', 'sem pessoas', 'cozinha|geladeira|pia', 60),
  ('lavanderia_pequena', 'Lavanderia pequena organizada', 'área de serviço pequena', 'branco, azul-claro e madeira', 'luz natural', 'organizado e prático', 'top', 'sem pessoas; sem marcas de produto de limpeza', 'lavanderia|roupa|varal|limpeza', 70),
  ('espaco_compacto_multifuncional', 'Espaço compacto multifuncional', 'apartamento compacto multifuncional', 'neutros quentes', 'luz natural', 'contemporâneo prático', 'top', 'sem pessoas', 'organiza|quarto|sala|escritorio|closet', 80)
on conflict (key) do nothing;

insert into public.ml_prompt_templates (key, version, body, notes) values
  ('lifestyle_no_text', 1,
   'Use a imagem anexada do produto como referência de identidade visual. Preserve rigorosamente quantidade de peças, cor, formato, estrutura, acabamento e função do produto "{product_title}". Não invente acessórios ou características. Crie uma cena vertical (2:3) realista e premium mostrando o produto instalado e em uso em um {scene_environment} ({scene_style}; paleta {scene_palette}; {scene_lighting}). O ambiente deve transmitir {benefit}. A composição deve parecer uma fotografia editorial de decoração e organização, com iluminação natural, proporções realistas e integração convincente. Não inclua texto, preço, selos, logotipos de marketplace, marcas inventadas ou badges. O produto deve ser o elemento principal, mas a cena precisa parecer um ambiente real e desejável. Restrições: {scene_restrictions}.',
   'Especificação V2 §8.1'),
  ('lifestyle_text', 1,
   'Use a imagem anexada do produto como referência de identidade visual. Preserve rigorosamente quantidade de peças, cor, formato, estrutura, acabamento e função do produto "{product_title}". Não invente acessórios ou características. Crie uma cena vertical (2:3) realista em um {scene_environment} ({scene_style}; paleta {scene_palette}; {scene_lighting}) que transmita {benefit}. Deixe o {text_area_label} da imagem com área limpa e calma (o texto será aplicado depois pelo app). Não escreva texto, preço, selos, logotipos ou badges. Restrições: {scene_restrictions}.',
   'Especificação V2 §8.2 — imagem sem texto; overlay aplicado pelo compositor'),
  ('editorial', 1,
   'Use a imagem anexada do produto como referência. Preserve rigorosamente quantidade, cor, formato e acabamento do produto "{product_title}". Crie uma imagem vertical limpa e editorial, estilo revista de organização, com o produto em destaque sobre {scene_environment} ({scene_palette}). Deixe o terço superior livre para um título e uma lista curta aplicados depois. Sem texto, preço, selos ou logotipos.',
   'Especificação V2 §6.3'),
  ('reference_generation', 1,
   'Use as imagens anexadas como referência EXATA do produto "{product_title}" (primeira = principal). Preserve quantidade de peças ({fidelity_constraints}), cor, geometria, proporções, acabamento e função. Não adicione nem remova peças, não invente modo de instalação ou acessórios. Cena: {scene_environment}, {scene_style}, paleta {scene_palette}, {scene_lighting}, transmitindo {benefit}. Fotografia vertical 2:3 realista. Sem texto, preço, selos ou logotipos.',
   'Modo B — geração com referência; sempre passa por verificação de fidelidade'),
  ('exact_background', 1,
   'Fotografia vertical 2:3 de um {scene_environment} vazio, {scene_style}, paleta {scene_palette}, {scene_lighting}. Deixe uma área livre e plana na região {placement_label} para posicionar um produto depois (sem nenhum objeto nessa área). Realista, profundidade de campo suave, sem pessoas, sem texto, sem logotipos. Restrições: {scene_restrictions}.',
   'Modo A — só o cenário; o produto real é composto por cima sem alteração'),
  ('manual_chatgpt', 1,
   'Anexe as imagens de referência do produto "{product_title}" (a primeira é a principal). Preserve rigorosamente quantidade de peças, cor, formato, estrutura, acabamento e função — não invente acessórios. Crie uma imagem vertical 2:3 realista mostrando o produto em uso em um {scene_environment} ({scene_style}; paleta {scene_palette}; {scene_lighting}), transmitindo {benefit}. {text_instruction} Sem preço, selos, logotipos de marketplace ou marcas inventadas.',
   'Modo manual via ChatGPT (§8.3)'),
  ('pinterest_copy', 1,
   'Escreva o pacote de um Pin do Pinterest em pt-BR para o produto informado. Título: enfatize problema, benefício ou intenção (não apenas o nome do SKU), até 90 caracteres. Descrição: explique a utilidade, consistente com o produto real, natural, sem keyword stuffing, sem preço, sem claims não comprovados, até 550 caracteres (o aviso de afiliado é adicionado pelo app). Alt text: descreva objetivamente a imagem ({visual_description}), sem SEO agressivo. Tom de voz: {tone}. Regras extras de título: {title_rules}. Regras extras de descrição: {description_rules}. Regra de alt text: {alt_rules}.',
   'Especificação V2 §9.1–9.2'),
  ('fidelity_check', 1,
   'Compare a imagem GERADA (última anexada) com as imagens de REFERÊNCIA do produto real (as demais). Avalie com rigor se a imagem gerada representa materialmente o mesmo produto: quantidade de peças, cor e acabamento, geometria e estrutura, modo de instalação, acessórios não incluídos parecendo parte do produto, texto/preço/garantia/claim inexistente, funções não sustentadas, escala materialmente enganosa. Seja conservador: na dúvida, marque como problema.',
   'Checklist V2 §5.2')
on conflict (key, version) do nothing;

-- -----------------------------------------------------------------------------
-- 8. Novos agendamentos (§11.10) — geração/publicação em massa NUNCA ligada por padrão
-- -----------------------------------------------------------------------------
insert into public.ml_schedules (key, name, description, job_type, cron_expression, enabled, overlap_policy, config) values
  ('refresh_media', 'Atualizar imagens dos produtos', 'Reimporta as imagens do anúncio dos produtos aprovados.',
   'REFRESH_PRODUCT_MEDIA', '0 5 * * 1', true, 'skip', '{"batch":30}'),
  ('validate_affiliate_links', 'Revalidar links de afiliado', 'Resolve o redirecionamento dos links de produtos com publicação próxima.',
   'VALIDATE_AFFILIATE_REDIRECT', '15 */6 * * *', true, 'skip', '{"batch":50}'),
  ('generate_packages', 'Gerar pacotes Pinterest pendentes', 'Gera/valida o pacote dos criativos aprovados que ainda não têm pacote pronto.',
   'GENERATE_PINTEREST_PACKAGE', '*/30 * * * *', true, 'skip', '{"batch":20}')
on conflict (key) do nothing;

-- Rollup por variante/família: o COMPUTE_PERFORMANCE existente cobre (§15 ROLLUP_CREATIVE_PERFORMANCE).
update public.ml_schedules
   set description = 'Rollup diário de performance por categoria, produto, família, variante, cena e tipo visual.'
 where key = 'compute_performance';
