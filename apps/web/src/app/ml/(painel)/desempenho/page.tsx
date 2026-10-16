import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Info, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireMlPage, temPapel } from "@/lib/ml/acesso";
import { lerDesempenho, pct, taxa, type Desempenho } from "@/lib/ml/estudio/desempenho";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ml/campos";
import { AtualizarDesempenho, ProximosPins } from "@/components/ml/desempenho/acoes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Desempenho" };
export const maxDuration = 60;

const PERIODOS = [7, 30, 90] as const;
const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("pt-BR");

export default async function DesempenhoPage({ searchParams }: { searchParams: { dias?: string } }) {
  const sessao = await requireMlPage("viewer");
  const dias = PERIODOS.includes(Number(searchParams.dias) as 7) ? Number(searchParams.dias) : 30;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ml_desempenho", { p_dias: dias });
  const d = (data ?? { dias, totais: { pins: 0, impressoes: 0, saves: 0, cliques: 0, saidas: 0, pins_com_metrica: 0 }, por_board: [], pins: [] }) as unknown as Desempenho;
  const leituras = lerDesempenho(d);
  const imp = d.totais.impressoes ?? 0;
  const podeOperar = temPapel(sessao.role, "operator");

  const kpis = [
    { l: "Pins publicados", v: n(d.totais.pins) },
    { l: "Impressões", v: n(d.totais.impressoes) },
    { l: "Saves", v: n(d.totais.saves), s: imp ? `${pct(taxa(d.totais.saves ?? 0, imp))} das impressões` : null },
    { l: "Cliques no Pin", v: n(d.totais.cliques) },
    { l: "Cliques no link", v: n(d.totais.saidas), s: imp ? `${pct(taxa(d.totais.saidas ?? 0, imp))} das impressões` : null, destaque: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Desempenho"
        description="Todos os Pins da conta (os criados aqui e os feitos direto no Pinterest), para decidir o próximo."
        actions={podeOperar ? <AtualizarDesempenho /> : null}
      />

      <nav className="flex gap-1" aria-label="Período">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`?dias=${p}`}
            aria-current={p === dias ? "page" : undefined}
            className={cn("rounded-full px-3 py-1 text-caption font-medium", p === dias ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
          >
            {p} dias
          </Link>
        ))}
      </nav>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-caption text-destructive">Não foi possível carregar: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.l} className={cn("rounded-xl border border-border bg-card p-3", k.destaque && "border-primary/40")}>
            <p className="text-caption text-muted-foreground">{k.l}</p>
            <p className="text-h4 font-semibold tabular">{k.v}</p>
            {k.s && <p className="text-caption text-muted-foreground">{k.s}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="O que os números dizem">
          <ul className="space-y-2">
            {leituras.map((l) => (
              <li key={l.texto} className="flex gap-2 text-body-sm">
                {l.tipo === "positivo" ? (
                  <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : l.tipo === "atencao" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {l.texto}
              </li>
            ))}
          </ul>
        </Secao>
        <ProximosPins dias={dias} podeOperar={podeOperar} />
      </div>

      <Secao titulo="Por board" descricao="Onde os Pins rendem mais. Taxas sobre as impressões.">
        {d.por_board.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-caption text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Board</th>
                  <th className="py-2 pr-3 text-right font-medium">Pins</th>
                  <th className="py-2 pr-3 text-right font-medium">Impressões</th>
                  <th className="py-2 pr-3 text-right font-medium">Saves</th>
                  <th className="py-2 pr-3 text-right font-medium">Cliques no link</th>
                  <th className="py-2 text-right font-medium">Taxa de clique</th>
                </tr>
              </thead>
              <tbody>
                {d.por_board.map((b) => (
                  <tr key={b.board} className="border-t border-border tabular">
                    <td className="py-2 pr-3">{b.board}</td>
                    <td className="py-2 pr-3 text-right">{n(b.pins)}</td>
                    <td className="py-2 pr-3 text-right">{n(b.impressoes)}</td>
                    <td className="py-2 pr-3 text-right">{n(b.saves)}</td>
                    <td className="py-2 pr-3 text-right">{n(b.saidas)}</td>
                    <td className="py-2 text-right">{b.impressoes ? pct(taxa(b.saidas, b.impressoes)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">Sem dados ainda.</p>
        )}
      </Secao>

      <Secao titulo="Pins" descricao="Ordenados por cliques no link, depois saves.">
        {d.pins.length ? (
          <ul className="divide-y divide-border">
            {d.pins.slice(0, 60).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                {p.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem do Pinterest/Storage
                  <img src={p.imagem} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded-md bg-secondary object-cover" />
                ) : (
                  <div className="h-16 w-11 shrink-0 rounded-md bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">{p.titulo || "Sem título"}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                    <span>{p.board ?? "—"}</span>
                    {p.publicado_em && <span>· {new Date(p.publicado_em).toLocaleDateString("pt-BR")}</span>}
                    <Badge variant="outline" size="sm">
                      {p.origem === "app" ? "criado aqui" : "feito no Pinterest"}
                    </Badge>
                  </p>
                </div>
                <dl className="hidden shrink-0 grid-cols-4 gap-4 text-right text-caption tabular sm:grid">
                  {(
                    [
                      ["Impr.", p.impressoes],
                      ["Saves", p.saves],
                      ["Cliques", p.cliques],
                      ["Link", p.saidas],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={l}>
                      <dt className="text-muted-foreground">{l}</dt>
                      <dd className="font-medium">{n(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="shrink-0 text-caption tabular sm:hidden">
                  {n(p.impressoes)} impr. · {n(p.saidas)} link
                </p>
                {p.external_pin_id && (
                  <a href={`https://www.pinterest.com/pin/${p.external_pin_id}/`} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Pinterest" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">Nenhum Pin ainda. Clique em “Atualizar dados” para trazer os Pins da conta.</p>
        )}
      </Secao>
    </div>
  );
}
