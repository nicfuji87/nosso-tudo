# ML — Convenções de interface

Leia antes de criar/editar telas em `apps/web/src/app/ml/(painel)/**` e `apps/web/src/components/ml/**`.

## Estrutura

- Páginas: `src/app/ml/(painel)/<area>/page.tsx` (Server Components). O layout `(painel)/layout.tsx` já faz o guard
  (`requireMlPage("viewer")`) e desenha a navegação (`components/ml/shell.tsx`). Não repita header de app.
- Ações: `src/app/ml/(painel)/<area>/actions.ts` (já existem — use, não duplique regra de negócio). Todas devolvem
  `{ ok: true, mensagem?, jobId?, ... } | { error }` via `executarAcao`. Ações globais em `src/app/ml/actions.ts`.
- Componentes de uma área: `src/components/ml/<area>/*.tsx`. Componentes compartilhados (só leitura para quem cria telas):
  - `components/ml/status.tsx` — `StatusBadge tipo="product|creative|pin|job"` e `ScoreBadge` (texto + ícone, nunca só cor).
  - `components/ml/acao-botao.tsx` — `AcaoBotao` (chama action, desabilita durante, toast, `router.refresh()`; `confirmar="..."`).
  - `components/ml/job-status.tsx` — `JobStatus jobId` (polling a cada 2 s até terminar; toast e refresh no fim).
  - `components/ml/campos.tsx` — `Textarea`, `Checkbox`, `NativeSelect`, `Campo` (label+dica), `Secao` (card com título/ações).
  - Primitivos do projeto: `components/ui/{button,badge,card,dialog,sheet,tabs,select,switch,tooltip,dropdown-menu,input,label,skeleton,separator}`,
    `components/patterns/{page-header,empty-state,stat-tile}`. Ícones: `lucide-react`. Toasts: `sonner` (`toast.success/error`).
  - Gráficos: `recharts` (já instalado).

## Leitura de dados

- Em Server Components use o cliente do usuário: `import { createClient } from "@/lib/supabase/server"` — RLS garante
  que só membros do ML leem. Tabelas `ml_*` (tipos em `@/lib/ml/tipos`, gerados do schema).
- Agregações SEMPRE no banco: `supabase.rpc("ml_dashboard")`, `rpc("ml_analytics_summary", {p_from,p_to,p_filters})`,
  `rpc("ml_analytics_breakdown", {p_from,p_to,p_dimension,p_filters})`. Listas com `.range()`/`.limit()` (PostgREST corta em 1000).
- Configurações: `lerConfig("geral" | "descoberta" | …)` de `@/lib/ml/config` (server-only). O timezone de exibição é
  `(await lerConfig("geral")).timezone`; formate datas com `formatarNoFuso(data, tz)` de `@/lib/ml/tempo` (funciona no client também).
- Papel do usuário: `getMlRole()` / `temPapel(role, "admin")` de `@/lib/ml/acesso` — esconda/desabilite ações que o papel não permite
  (o servidor valida de novo).

## UX obrigatória (spec §25)

- Toda ação longa vira job: mostre `<JobStatus jobId=…/>` com o `jobId` devolvido pela action — nunca spinner infinito.
- Botões críticos ficam desabilitados enquanto rodam (`AcaoBotao` faz isso).
- Lote: checkbox por item + barra de ações para os selecionados.
- Filtros persistidos na URL (`searchParams`; use `<form method="get">` ou `router.replace` com `URLSearchParams`).
- Feedback por toast; erros legíveis.
- Empty states com CTA claro (`EmptyState` com `action`).
- Datas no timezone configurado.
- Status com texto + ícone.
- Mobile: layout responsivo (grid que vira coluna, tabelas viram cards ou rolam horizontalmente dentro de um container).

## Visual

- Tokens do projeto (nunca cor hardcoded): `bg-card`, `text-muted-foreground`, `border-border`, `bg-secondary`,
  `text-tech`/`bg-tech` (azul petróleo — cor de destaque da área ML), `success`, `warning`, `destructive`, `accent`.
- Tipografia: `text-h2` (título da página via `PageHeader`), `text-h4` (seções), `text-body-sm`, `text-caption`, `text-overline`.
- Números: classe `tabular`. Cards: `rounded-xl border border-border/70 bg-card shadow-card`.
- Densidade: painel operacional — objetivo, sem excesso; destaque só o que exige ação.
- Português do Brasil em toda a UI.

## V2 — famílias de criativos (docs/ml/ESPECIFICACAO-V2.md)

Dados novos (tipos em `@/lib/ml/database.types`): `ml_product_media` (galeria do anúncio: `media_role`
primary_reference|complementary|do_not_use|consult_only, `public_url`, `source_url`, `source_type`, dimensões,
`cutout_status`/`cutout_url`), `ml_creative_families` (name, hypothesis, objective, plan{mix,modo,metodo,headlines,editorial},
status planning|generating|active|archived), `ml_scene_presets`, `ml_prompt_templates`; `ml_creatives` ganhou
family_id, visual_type, scene_preset_id, fidelity_mode, source_media_ids, base_asset_id, has_text_overlay,
editorial_points, ai_modified, fidelity_status (not_required|pending|ok|warning|failed|human_ok), fidelity_score,
fidelity_notes, board_section_id, interests, disclosure_text, package_status (missing|incomplete|ready|invalid),
package_errors, cost_estimated_usd/cost_actual_usd, image_hash; `ml_pins` ganhou family_id, ai_modified,
ai_disclosure_sent, board_section_id; `ml_affiliate_links` ganhou final_url, final_host, redirect_status
(unchecked|ok|ok_unverified|inconsistent|error), last_checked_at.

Rótulos e regras puras (client-safe): `@/lib/ml/familias/plano` (TIPO_VISUAL_LABEL, MODO_FIDELIDADE_LABEL, MIX_PADRAO,
TIPOS_VISUAIS, MODOS_FIDELIDADE), `@/lib/ml/conteudo/ia-v2` (ITENS_FIDELIDADE — checklist §5.2).

Actions V2: `src/app/ml/(painel)/criativos/actions-v2.ts` (imagens do anúncio, wizard estimar/criar família,
lotes elegíveis, família, variante, fidelidade, pacote, upload V2), `configuracoes/actions.ts` (salvarSecao também para
`criativos_v2` e `pinterest_copy`, salvarPreset, salvarTemplate, ativarTemplate), `pendencias/actions.ts`
(validarRedirectAgora). RPCs: `ml_dashboard_v2()`, `ml_analytics_breakdown` com dimensões novas
(family, visual_type, scene, text, method, ai, pin), `ml_analytics_cohort(p_dias, p_dimension, p_filters)`;
filtros novos em `p_filters`: family_id, visual_type, scene, has_text ('true'|'false'), fidelity_mode.
