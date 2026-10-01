import type { Metadata } from "next";
import Link from "next/link";
import { ImageOff, Package, SearchX } from "lucide-react";
import { lerConfig } from "@/lib/ml/config";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect } from "@/components/ml/campos";
import { ScoreBadge, StatusBadge } from "@/components/ml/status";
import { FormFiltros } from "@/components/ml/produtos/form-filtros";
import { Paginacao } from "@/components/ml/produtos/paginacao";
import { brl, caminhoCategoria, inteiro, n, param, termoBusca } from "@/components/ml/produtos/formato";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Produtos" };

const POR_PAGINA = 30;

const ABAS = [
  { key: "todos", label: "Todos", status: null },
  { key: "triagem", label: "Triagem", status: ["discovered", "enriching", "analyzed"] },
  { key: "aprovados", label: "Aprovados", status: ["approved", "ready_for_creative"] },
  { key: "aguardando_link", label: "Aguardando link", status: ["waiting_affiliate_link"] },
  { key: "em_producao", label: "Em produção", status: ["creative_draft"] },
  { key: "prontos", label: "Prontos p/ agendar", status: ["ready_to_schedule"] },
  { key: "agendados", label: "Agendados", status: ["scheduled"] },
  { key: "publicados", label: "Publicados", status: ["published"] },
  { key: "pausados", label: "Pausados", status: ["paused"] },
  { key: "descartados", label: "Descartados", status: ["rejected"] },
  { key: "erro", label: "Erro", status: ["error"] },
] as const;
type Aba = (typeof ABAS)[number];

const ORDENS = {
  atualizados: { label: "Atualizados recentemente", col: "updated_at", asc: false },
  score: { label: "Maior score", col: "score", asc: false },
  recentes: { label: "Descobertos recentemente", col: "first_seen_at", asc: false },
  titulo: { label: "Título (A–Z)", col: "title", asc: true },
  preco: { label: "Menor preço", col: "current_price", asc: true },
  preco_desc: { label: "Maior preço", col: "current_price", asc: false },
} as const;
type Ordem = keyof typeof ORDENS;

interface Linha {
  id: string;
  title: string;
  thumbnail: string | null;
  external_id: string;
  status: string;
  status_reason: string | null;
  score: number | string | null;
  score_confidence: number | string | null;
  current_price: number | string | null;
  category_id: string | null;
  updated_at: string;
}

type Cliente = ReturnType<typeof createClient>;

function base(supabase: Cliente, colunas: string, aba: Aba, q: string | null, categoria: string | undefined, head = false) {
  let c = supabase.from("ml_products").select(colunas, { count: "exact", head });
  if (aba.status) c = c.in("status", [...aba.status]);
  if (q) c = c.or(`title.ilike.%${q}%,external_id.ilike.%${q}%`);
  if (categoria) c = c.eq("category_id", categoria);
  return c;
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const tz = (await lerConfig("geral")).timezone;

  const abaParam = param(searchParams, "aba");
  const aba: Aba = ABAS.find((a) => a.key === abaParam) ?? ABAS[0];
  const q = termoBusca(param(searchParams, "q"));
  const categoria = param(searchParams, "categoria");
  const ordemParam = param(searchParams, "ordem");
  const ordem: Ordem = ordemParam && ordemParam in ORDENS ? (ordemParam as Ordem) : "atualizados";
  const o = ORDENS[ordem];
  const pagina = inteiro(param(searchParams, "pagina"), 1);

  const paramsAtuais: Record<string, string | undefined> = {};
  for (const k of Object.keys(searchParams)) paramsAtuais[k] = param(searchParams, k);

  const [lista, cats, ...contagens] = await Promise.all([
    base(supabase, "id, title, thumbnail, external_id, status, status_reason, score, score_confidence, current_price, category_id, updated_at", aba, q, categoria)
      .order(o.col, { ascending: o.asc, nullsFirst: false })
      .order("id", { ascending: true })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    supabase.from("ml_categories").select("id, name, path").eq("tracked", true).order("name").limit(500),
    ...ABAS.map((a) => base(supabase, "id", a, q, categoria, true)),
  ]);

  const linhas = (lista.data ?? []) as unknown as Linha[];
  const total = lista.count ?? 0;
  const categorias = (cats.data ?? []) as { id: string; name: string; path: unknown }[];
  const faltando = Array.from(new Set(linhas.map((l) => l.category_id).filter((c): c is string => !!c && !categorias.some((x) => x.id === c))));
  const extras = faltando.length ? await supabase.from("ml_categories").select("id, name, path").in("id", faltando) : { data: [] };
  const nomeCat = new Map<string, string>();
  for (const c of [...categorias, ...((extras.data ?? []) as { id: string; name: string }[])]) nomeCat.set(c.id, c.name);

  const hrefAba = (key: string) => {
    const qs = new URLSearchParams();
    if (key !== "todos") qs.set("aba", key);
    if (q) qs.set("q", q);
    if (categoria) qs.set("categoria", categoria);
    if (ordem !== "atualizados") qs.set("ordem", ordem);
    const s = qs.toString();
    return s ? `/ml/produtos?${s}` : "/ml/produtos";
  };
  const fmt = (d: string) => formatarNoFuso(d, tz, { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos" description="Todos os produtos acompanhados, em qualquer etapa do pipeline." />

      <nav aria-label="Filtrar por etapa" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex w-max gap-1 rounded-full bg-secondary p-1">
          {ABAS.map((a, i) => {
            const ativo = a.key === aba.key;
            const qtd = contagens[i]?.count ?? 0;
            return (
              <li key={a.key}>
                <Link
                  href={hrefAba(a.key)}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-colors",
                    ativo ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.label}
                  <span className={cn("text-caption tabular", ativo ? "text-tech" : "text-muted-foreground/80")}>{qtd}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <FormFiltros key={JSON.stringify(paramsAtuais)} limparHref={aba.key === "todos" ? "/ml/produtos" : `/ml/produtos?aba=${aba.key}`}>
        {aba.key !== "todos" && <input type="hidden" name="aba" value={aba.key} />}
        <Campo label="Buscar" className="col-span-2 lg:col-span-3">
          <Input name="q" defaultValue={q ?? ""} placeholder="Título ou código MLB" className="h-10" />
        </Campo>
        <Campo label="Categoria" className="col-span-2 sm:col-span-1 lg:col-span-2">
          <NativeSelect name="categoria" defaultValue={categoria ?? ""} className="w-full">
            <option value="">Todas</option>
            {categorias.map((c) => {
              const caminho = caminhoCategoria(c.path);
              return (
                <option key={c.id} value={c.id}>
                  {caminho.length > 1 ? caminho.slice(-2).join(" › ") : c.name}
                </option>
              );
            })}
          </NativeSelect>
        </Campo>
        <Campo label="Ordenar por" className="col-span-2 sm:col-span-1">
          <NativeSelect name="ordem" defaultValue={ordem === "atualizados" ? "" : ordem} className="w-full">
            {(Object.keys(ORDENS) as Ordem[]).map((k) => (
              <option key={k} value={k === "atualizados" ? "" : k}>
                {ORDENS[k].label}
              </option>
            ))}
          </NativeSelect>
        </Campo>
      </FormFiltros>

      {lista.error && pagina === 1 ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar os produtos" description={lista.error.message} />
      ) : linhas.length === 0 ? (
        q || categoria || aba.key !== "todos" || pagina > 1 ? (
          <EmptyState
            icon={SearchX}
            title="Nenhum produto aqui"
            description={pagina > 1 ? "Esta página está fora do intervalo." : "Nenhum produto nesta etapa com os filtros atuais."}
            action={
              <Button asChild variant="secondary">
                <Link href="/ml/produtos">Ver todos os produtos</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Package}
            title="Nenhum produto ainda"
            description="Os produtos aparecem aqui depois da primeira descoberta (ou quando você adiciona um manualmente)."
            action={
              <Button asChild variant="tech">
                <Link href="/ml/descobertas">Ir para Descobertas</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-card shadow-card md:block">
            <table className="w-full text-body-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-caption text-muted-foreground">
                <tr>
                  <th scope="col" className="w-14 px-3 py-2.5 font-medium">
                    <span className="sr-only">Imagem</span>
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Produto</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Preço</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Categoria</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {linhas.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-secondary/30">
                    <td className="px-3 py-2">
                      <Miniatura src={l.thumbnail} alt={l.title} />
                    </td>
                    <td className="max-w-[22rem] px-3 py-2">
                      <Link href={`/ml/produtos/${l.id}`} className="line-clamp-2 font-medium hover:underline">
                        {l.title}
                      </Link>
                      <span className="text-caption text-muted-foreground">{l.external_id}</span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tipo="product" status={l.status} />
                      {l.status_reason && (
                        <p className="mt-1 line-clamp-1 max-w-[14rem] text-caption text-muted-foreground" title={l.status_reason}>
                          {l.status_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ScoreBadge score={n(l.score)} confianca={n(l.score_confidence)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular">{brl(l.current_price)}</td>
                    <td className="hidden max-w-[12rem] truncate px-3 py-2 text-muted-foreground lg:table-cell">
                      {l.category_id ? (nomeCat.get(l.category_id) ?? l.category_id) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-caption text-muted-foreground tabular">{fmt(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {linhas.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/ml/produtos/${l.id}`}
                  className="flex gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card"
                >
                  <Miniatura src={l.thumbnail} alt={l.title} grande />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="line-clamp-2 text-body-sm font-medium leading-snug">{l.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tipo="product" status={l.status} />
                      <ScoreBadge score={n(l.score)} confianca={n(l.score_confidence)} />
                    </div>
                    <p className="text-caption text-muted-foreground">
                      <span className="font-medium text-foreground tabular">{brl(l.current_price)}</span>
                      {l.category_id && ` · ${nomeCat.get(l.category_id) ?? l.category_id}`} · {fmt(l.updated_at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Paginacao base="/ml/produtos" params={paramsAtuais} pagina={pagina} total={total} porPagina={POR_PAGINA} />
    </div>
  );
}

function Miniatura({ src, alt, grande }: { src: string | null; alt: string; grande?: boolean }) {
  const tam = grande ? "size-16" : "size-11";
  if (!src)
    return (
      <span className={cn("flex items-center justify-center rounded-lg bg-secondary text-muted-foreground", tam)}>
        <ImageOff className="size-4" aria-hidden />
        <span className="sr-only">Sem imagem</span>
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagens remotas do Mercado Livre
    <img src={src} alt={alt} loading="lazy" className={cn("shrink-0 rounded-lg border border-border/60 bg-white object-contain p-0.5", tam)} />
  );
}
