import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  ListOrdered,
  Palette,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { CalendarioMes, Semana, somarDias } from "@/components/ml/publicacoes/calendario";
import { FiltroSelect } from "@/components/ml/publicacoes/filtro-select";
import { ListaPins } from "@/components/ml/publicacoes/lista-pins";
import { PinDetalhe } from "@/components/ml/publicacoes/pin-detalhe";
import { hrefCom, PIN_COLUNAS, quandoPin, type BoardOpcao, type ParamsUrl, type PinView } from "@/components/ml/publicacoes/tipos";
import { getMlRole, temPapel } from "@/lib/ml/acesso";
import { lerConfig } from "@/lib/ml/config";
import { deFusoParaUtc, diaNoFuso, inicioDaSemana } from "@/lib/ml/tempo";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { filtrar, GRUPOS_STATUS, hidratarPins, lerPinPorId, orIntervalo, type FiltrosPin } from "./dados";

export const metadata: Metadata = { title: "Publicações" };

const BASE = "/ml/publicacoes";
const POR_PAGINA = 50;
const LIMITE_CALENDARIO = 300;
const VISTAS = ["fila", "calendario", "semana", "falhas"] as const;
type Vista = (typeof VISTAS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const uuidOu = (v: string | undefined) => (v && UUID.test(v) ? v : undefined);

/** Meia-noite (no fuso) do dia "YYYY-MM-DD" → ISO UTC. */
function inicioDoDia(dia: string, tz: string): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return deFusoParaUtc(a, m, d, 0, 0, tz).toISOString();
}

function rotuloMes(mes: string) {
  const t = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${mes}-15T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function mesVizinho(mes: string, delta: number) {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function rotuloDiaCurto(dia: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`));
}

const nf = new Intl.NumberFormat("pt-BR");

export default async function PublicacoesPage({ searchParams }: { searchParams: SearchParams }) {
  const vistaParam = um(searchParams.vista);
  const vista: Vista = (VISTAS as readonly string[]).includes(vistaParam ?? "") ? (vistaParam as Vista) : "fila";
  const statusParam = um(searchParams.status);
  const statusKey = vista === "falhas" ? "falhas" : statusParam && GRUPOS_STATUS[statusParam] ? statusParam : undefined;
  const produto = uuidOu(um(searchParams.produto));
  const board = uuidOu(um(searchParams.board));
  const pinId = uuidOu(um(searchParams.pin));
  const pagina = Math.max(1, Math.floor(Number(um(searchParams.pagina)) || 1));

  const supabase = createClient();
  const [geral, role] = await Promise.all([lerConfig("geral"), getMlRole()]);
  const tz = geral.timezone;
  const podeOperar = temPapel(role, "operator");
  const agora = new Date();
  const hoje = diaNoFuso(agora, tz);

  const mesParam = um(searchParams.mes);
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : hoje.slice(0, 7);
  const semanaParam = um(searchParams.semana);
  const semana = semanaParam && /^\d{4}-\d{2}-\d{2}$/.test(semanaParam) && !Number.isNaN(Date.parse(semanaParam)) ? semanaParam : inicioDaSemana(hoje);

  // Parâmetros que os links preservam (o `pin` aberto nunca é propagado).
  const params: ParamsUrl = {
    vista: vista === "fila" ? undefined : vista,
    status: vista === "falhas" ? undefined : statusKey,
    produto,
    board,
    mes: vista === "calendario" && mesParam ? mes : undefined,
    semana: vista === "semana" && semanaParam ? semana : undefined,
    pagina: (vista === "fila" || vista === "falhas") && pagina > 1 ? String(pagina) : undefined,
  };
  const filtrosBase: FiltrosPin = { produto, board };
  const filtros: FiltrosPin = { ...filtrosBase, status: statusKey ? GRUPOS_STATUS[statusKey]?.status : undefined };

  // ---------------------------------------------------------------------------
  // Contadores (globais) e contagem por aba (respeita produto/board)
  // ---------------------------------------------------------------------------
  const contar = () => supabase.from("ml_pins").select("id", { count: "exact", head: true });
  const em7dias = new Date(agora.getTime() + 7 * 86_400_000).toISOString();
  const [prox7, pubHoje, aguardando, falhas, total, boardsRes, produtoRes, ...abas] = await Promise.all([
    contar().eq("status", "scheduled").gte("scheduled_at", agora.toISOString()).lte("scheduled_at", em7dias),
    contar().eq("status", "published").gte("published_at", inicioDoDia(hoje, tz)),
    contar().eq("status", "pending_approval"),
    contar().in("status", ["failed", "blocked"]),
    contar(),
    supabase.from("ml_pinterest_boards").select("id, name").eq("active", true).is("removed_at", null).order("name").limit(200),
    produto ? supabase.from("ml_products").select("id, title").eq("id", produto).maybeSingle() : Promise.resolve({ data: null }),
    ...Object.values(GRUPOS_STATUS).map((g) => filtrar(contar(), { ...filtrosBase, status: g.status })),
  ]);
  const contagemAba = Object.fromEntries(Object.keys(GRUPOS_STATUS).map((k, i) => [k, abas[i]?.count ?? 0]));
  const boards = ((boardsRes.data ?? []) as BoardOpcao[]).map((b) => ({ id: b.id, name: b.name }));
  const produtoSel = produtoRes.data as { id: string; title: string } | null;
  const semNada = (total.count ?? 0) === 0;

  // ---------------------------------------------------------------------------
  // Dados da vista
  // ---------------------------------------------------------------------------
  let pins: PinView[] = [];
  let totalLista = 0;
  let truncado = false;
  const porDia = new Map<string, PinView[]>();

  if (vista === "fila" || vista === "falhas") {
    let q = filtrar(supabase.from("ml_pins").select(PIN_COLUNAS, { count: "exact" }), filtros);
    if (statusKey === "published") q = q.order("published_at", { ascending: false, nullsFirst: false });
    else if (statusKey && ["scheduled", "pending_approval", "paused", "draft"].includes(statusKey))
      q = q.order("scheduled_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    else q = q.order("updated_at", { ascending: false });
    const de = (pagina - 1) * POR_PAGINA;
    const { data, count } = await q.range(de, de + POR_PAGINA - 1);
    pins = await hidratarPins(supabase, data);
    totalLista = count ?? 0;
  } else {
    let deDia: string;
    let ateDia: string;
    if (vista === "calendario") {
      const primeiro = `${mes}-01`;
      const dow = (new Date(`${primeiro}T00:00:00Z`).getUTCDay() + 6) % 7;
      deDia = somarDias(primeiro, -dow);
      ateDia = somarDias(deDia, 42);
    } else {
      deDia = semana;
      ateDia = somarDias(semana, 7);
    }
    let q = filtrar(supabase.from("ml_pins").select(PIN_COLUNAS), filtros).or(orIntervalo(inicioDoDia(deDia, tz), inicioDoDia(ateDia, tz)));
    if (!statusKey) q = q.neq("status", "canceled");
    const { data } = await q.order("scheduled_at", { ascending: true }).limit(LIMITE_CALENDARIO);
    pins = await hidratarPins(supabase, data);
    truncado = pins.length >= LIMITE_CALENDARIO;
    for (const p of pins) {
      const quando = quandoPin(p);
      if (!quando) continue;
      const dia = diaNoFuso(new Date(quando), tz);
      const lista = porDia.get(dia) ?? [];
      lista.push(p);
      porDia.set(dia, lista);
    }
    for (const lista of Array.from(porDia.values())) lista.sort((a, b) => (quandoPin(a) ?? "").localeCompare(quandoPin(b) ?? ""));
  }

  const selecionado = pinId ? (pins.find((p) => p.id === pinId) ?? (await lerPinPorId(supabase, pinId))) : null;
  const totalPaginas = Math.max(1, Math.ceil(totalLista / POR_PAGINA));
  const temFiltro = Boolean(produto || board || statusKey);

  // ---------------------------------------------------------------------------
  const vistas: { v: Vista; label: string; icon: LucideIcon }[] = [
    { v: "fila", label: "Fila", icon: ListOrdered },
    { v: "calendario", label: "Calendário", icon: CalendarDays },
    { v: "semana", label: "Semana", icon: CalendarRange },
    { v: "falhas", label: "Falhas", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicações"
        description={`Fila, calendário e falhas dos Pins. Horários no fuso ${tz}.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ml/criativos?status=approved">
              <Palette />
              Criativos aprovados
            </Link>
          </Button>
        }
      />

      {/* Contadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Contador
          href={hrefCom(BASE, {}, { status: "scheduled" })}
          icon={CalendarClock}
          label="Agendados · próximos 7 dias"
          valor={prox7.count ?? 0}
          tom="tech"
        />
        <Contador href={hrefCom(BASE, {}, { status: "published" })} icon={Send} label="Publicados hoje" valor={pubHoje.count ?? 0} tom="success" />
        <Contador
          href={hrefCom(BASE, {}, { status: "pending_approval" })}
          icon={Hourglass}
          label="Aguardando aprovação"
          valor={aguardando.count ?? 0}
          tom={(aguardando.count ?? 0) > 0 ? "warning" : "muted"}
        />
        <Contador
          href={hrefCom(BASE, {}, { vista: "falhas" })}
          icon={AlertTriangle}
          label="Falhas e bloqueios"
          valor={falhas.count ?? 0}
          tom={(falhas.count ?? 0) > 0 ? "destructive" : "muted"}
        />
      </div>

      {/* Barra: vistas + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex rounded-full border border-border/70 bg-card p-1 shadow-card" aria-label="Visualização">
          {vistas.map(({ v, label, icon: Icon }) => (
            <Link
              key={v}
              href={hrefCom(BASE, { produto, board, status: v === "falhas" ? undefined : statusKey === "falhas" ? undefined : statusKey }, { vista: v === "fila" ? null : v })}
              aria-current={vista === v ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors",
                vista === v ? "bg-tech text-tech-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className={cn(vista !== v && "hidden sm:inline")}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {produto && (
            <Link
              href={hrefCom(BASE, params, { produto: null, pagina: null })}
              className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-caption hover:bg-secondary/70"
              title="Remover filtro de produto"
            >
              <span className="truncate">Produto: {produtoSel?.title ?? "selecionado"}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">remover filtro</span>
            </Link>
          )}
          <FiltroSelect nome="board" rotulo="Board" valor={board} params={params} opcoes={boards.map((b) => ({ value: b.id, label: b.name }))} />
          {temFiltro && (
            <Button asChild variant="ghost" size="sm">
              <Link href={hrefCom(BASE, { vista: params.vista, mes: params.mes, semana: params.semana }, {})}>Limpar filtros</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Abas de status */}
      {vista !== "falhas" && (
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Filtrar por status">
          <AbaStatus href={hrefCom(BASE, params, { status: null, pagina: null })} ativa={!statusKey} label="Todos" />
          {Object.entries(GRUPOS_STATUS).map(([k, g]) => (
            <AbaStatus
              key={k}
              href={hrefCom(BASE, params, { status: k, pagina: null })}
              ativa={statusKey === k}
              label={g.label}
              contagem={contagemAba[k] ?? 0}
              alerta={k === "falhas" || k === "pending_approval"}
            />
          ))}
        </nav>
      )}

      {/* Navegação de período */}
      {vista === "calendario" && (
        <NavPeriodo
          titulo={rotuloMes(mes)}
          anterior={hrefCom(BASE, params, { mes: mesVizinho(mes, -1) })}
          proximo={hrefCom(BASE, params, { mes: mesVizinho(mes, 1) })}
          hoje={mes !== hoje.slice(0, 7) ? hrefCom(BASE, params, { mes: null }) : undefined}
        />
      )}
      {vista === "semana" && (
        <NavPeriodo
          titulo={`${rotuloDiaCurto(semana)} – ${rotuloDiaCurto(somarDias(semana, 6))}`}
          anterior={hrefCom(BASE, params, { semana: somarDias(semana, -7) })}
          proximo={hrefCom(BASE, params, { semana: somarDias(semana, 7) })}
          hoje={semana !== inicioDaSemana(hoje) ? hrefCom(BASE, params, { semana: null }) : undefined}
        />
      )}
      {truncado && (
        <p className="text-caption text-warning">
          Mostrando os primeiros {LIMITE_CALENDARIO} Pins do período. Use os filtros ou a vista de semana para ver todos.
        </p>
      )}

      {/* Conteúdo */}
      {semNada ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma publicação ainda"
          description="Os Pins nascem de criativos aprovados. Aprove um criativo e agende a publicação para vê-la aqui."
          action={
            <Button asChild variant="tech">
              <Link href="/ml/criativos?status=approved">Ver criativos aprovados</Link>
            </Button>
          }
        />
      ) : vista === "calendario" ? (
        <CalendarioMes mes={mes} hoje={hoje} porDia={porDia} tz={tz} params={params} />
      ) : vista === "semana" ? (
        <Semana inicio={semana} hoje={hoje} porDia={porDia} tz={tz} params={params} />
      ) : pins.length === 0 ? (
        vista === "falhas" && !produto && !board ? (
          <EmptyState icon={Send} title="Nenhuma falha" description="Nenhum Pin falhou ou foi bloqueado na validação. Tudo em dia." />
        ) : (
          <EmptyState
            icon={ListOrdered}
            title="Nada por aqui com esses filtros"
            description="Troque o status ou limpe os filtros. Para criar novas publicações, parta de um criativo aprovado."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href={hrefCom(BASE, { vista: params.vista }, {})}>Limpar filtros</Link>
                </Button>
                <Button asChild variant="tech">
                  <Link href="/ml/criativos?status=approved">Criativos aprovados</Link>
                </Button>
              </div>
            }
          />
        )
      ) : (
        <>
          {vista === "falhas" && (
            <p className="text-body-sm text-muted-foreground">
              Pins que falharam ao publicar ou foram bloqueados pela validação pré-publicação. Corrija o motivo e use <strong>Reprocessar</strong>;
              se o preço mudou e ainda vale a pena, use <strong>Aceitar novo preço</strong>.
            </p>
          )}
          {!statusKey && vista === "fila" && <p className="text-caption text-muted-foreground">Ordenado pela atualização mais recente.</p>}
          <ListaPins pins={pins} boards={boards} tz={tz} podeOperar={podeOperar} params={params} />
          {totalPaginas > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Paginação">
              <span className="text-caption text-muted-foreground">
                Página {pagina} de {totalPaginas} · {nf.format(totalLista)} Pins
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className={cn(pagina <= 1 && "pointer-events-none opacity-50")}>
                  <Link href={hrefCom(BASE, params, { pagina: pagina > 2 ? String(pagina - 1) : null })} aria-disabled={pagina <= 1}>
                    <ChevronLeft />
                    Anterior
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className={cn(pagina >= totalPaginas && "pointer-events-none opacity-50")}>
                  <Link href={hrefCom(BASE, params, { pagina: String(pagina + 1) })} aria-disabled={pagina >= totalPaginas}>
                    Próxima
                    <ChevronRight />
                  </Link>
                </Button>
              </div>
            </nav>
          )}
        </>
      )}

      {selecionado && (
        <PinDetalhe key={selecionado.id} pin={selecionado} boards={boards} tz={tz} podeOperar={podeOperar} hrefFechar={hrefCom(BASE, params, {})} />
      )}
      {pinId && !selecionado && <p className="text-caption text-warning">O Pin indicado no link não foi encontrado.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
const TONS = {
  tech: "text-tech bg-tech/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/15",
  destructive: "text-destructive bg-destructive/10",
  muted: "text-muted-foreground bg-secondary",
} as const;

function Contador({ href, icon: Icon, label, valor, tom }: { href: string; icon: LucideIcon; label: string; valor: number; tom: keyof typeof TONS }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONS[tom])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="tabular block text-h3 font-semibold leading-none">{nf.format(valor)}</span>
        <span className="mt-1 block text-caption text-muted-foreground group-hover:text-foreground">{label}</span>
      </span>
    </Link>
  );
}

function AbaStatus({ href, ativa, label, contagem, alerta }: { href: string; ativa: boolean; label: string; contagem?: number; alerta?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-body-sm transition-colors",
        ativa ? "border-foreground/80 bg-foreground text-background" : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {contagem != null && (
        <span
          className={cn(
            "tabular rounded-full px-1.5 text-caption",
            ativa ? "bg-background/20" : alerta && contagem > 0 ? "bg-warning/15 text-warning" : "bg-secondary",
          )}
        >
          {nf.format(contagem)}
        </span>
      )}
    </Link>
  );
}

function NavPeriodo({ titulo, anterior, proximo, hoje }: { titulo: string; anterior: string; proximo: string; hoje?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon-sm">
        <Link href={anterior} aria-label="Período anterior">
          <ChevronLeft />
        </Link>
      </Button>
      <h2 className="min-w-[10rem] text-center text-h4 font-semibold tracking-tight">{titulo}</h2>
      <Button asChild variant="outline" size="icon-sm">
        <Link href={proximo} aria-label="Próximo período">
          <ChevronRight />
        </Link>
      </Button>
      {hoje && (
        <Button asChild variant="ghost" size="sm">
          <Link href={hoje}>Hoje</Link>
        </Button>
      )}
    </div>
  );
}
