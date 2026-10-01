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
