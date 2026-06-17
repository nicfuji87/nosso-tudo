import Link from "next/link";
import { ArrowRight, Layers, Sparkles, Wallet } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getGastosPorCategoria,
  getGastosPorContexto,
  getGastosPorEssencialidade,
  getGastosPorPessoa,
  getResumoMes,
  listCartoes,
  listTransacoes,
} from "@/lib/db/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { CategoriasCard } from "@/components/dashboard/categorias-card";
import { GastoPorPessoa } from "@/components/dashboard/gasto-por-pessoa";
import { AtividadeRecente } from "@/components/dashboard/atividade-recente";
import { EventosLista } from "@/components/dashboard/eventos-lista";
import { greeting, formatBRL, formatDate } from "@/lib/format";
import { LABEL_ESSENCIALIDADE, type Essencialidade } from "@/lib/types/db";

const PALETTE = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

const COR_ESSENCIALIDADE: Record<Essencialidade, string> = {
  essencial: "#8FA993",
  necessario: "#3D6D84",
  superfluo: "#E08A4B",
  investimento: "#7E57C2",
};

export default async function HomePage() {
  const { profile, workspace, plan } = await getWorkspaceContext();
  const supabase = createClient();

  const [resumo, gastos, essenc, pessoas, eventos, recentes, cartoes, colecoesRes] = await Promise.all([
    getResumoMes(workspace.id),
    getGastosPorCategoria(workspace.id),
    getGastosPorEssencialidade(workspace.id),
    getGastosPorPessoa(workspace.id),
    getGastosPorContexto(workspace.id),
    listTransacoes(workspace.id, { limit: 6 }),
    listCartoes(workspace.id),
    supabase.from("v_colecoes_em_aberto").select("*").eq("workspace_id", workspace.id).limit(4),
  ]);

  const totalEssenc = essenc.reduce((s, e) => s + e.total, 0);
  const eventosTop = eventos.slice(0, 6);

  const colecoes =
    (colecoesRes.data as { id: string; nome: string; cor: string | null; icone: string | null }[] | null) ?? [];
  const primeiroNome = profile.nome.split(" ")[0];
  const semDados = resumo.total_transacoes === 0;

  const mesAno = formatDate(new Date(), "MMMM 'de' yyyy");
  const mesLabel = mesAno.charAt(0).toUpperCase() + mesAno.slice(1);

  const donut = gastos.slice(0, 5).map((g, i) => ({
    nome: g.categoria_nome,
    valor: Number(g.total),
    cor: g.cor || PALETTE[i % PALETTE.length]!,
  }));
  if (gastos.length > 5) {
    const resto = gastos.slice(5).reduce((s, g) => s + Number(g.total), 0);
    donut.push({ nome: "Outros", valor: resto, cor: "#C4B8B0" });
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho enxuto */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-body-sm text-muted-foreground">
            {greeting()}, {primeiroNome}
          </p>
          <h1 className="text-h3 font-semibold tracking-tight">{mesLabel}</h1>
        </div>
        {plan.slug === "free" && (
          <Badge variant="tech" className="hidden sm:inline-flex">
            <Sparkles className="size-3" /> Pro: WhatsApp + IA
          </Badge>
        )}
      </div>

      {/* Hero: saldo + categorias */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <BalanceCard saldo={resumo.saldo} receitas={resumo.receitas} despesas={resumo.despesas} />
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Gastos por categoria</p>
            <div className="mt-4">
              <CategoriasCard data={donut} total={resumo.despesas} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gasto por pessoa */}
      {pessoas.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Gasto por pessoa</p>
            <p className="mb-4 text-caption text-muted-foreground">Quem se beneficiou — despesas do mês</p>
            <GastoPorPessoa dados={pessoas} />
          </CardContent>
        </Card>
      )}

      {/* Essencial × Supérfluo */}
      {totalEssenc > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Essencial × Supérfluo</p>
            <p className="text-caption text-muted-foreground">Para onde o dinheiro vai por natureza do gasto</p>
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {essenc.map((e) => (
                <div
                  key={e.essencialidade}
                  style={{
                    width: `${(e.total / totalEssenc) * 100}%`,
                    backgroundColor: COR_ESSENCIALIDADE[e.essencialidade],
                  }}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {essenc.map((e) => (
                <div key={e.essencialidade} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COR_ESSENCIALIDADE[e.essencialidade] }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-caption text-muted-foreground">
                      {LABEL_ESSENCIALIDADE[e.essencialidade]}
                    </p>
                    <p className="text-body-sm font-medium tabular-nums">
                      {Math.round((e.total / totalEssenc) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eventos — abríveis */}
      {eventosTop.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">Eventos</h2>
          <EventosLista
            eventos={eventosTop.map((ev) => ({
              contextoId: ev.contextoId,
              nome: ev.nome,
              icone: ev.icone,
              tipo: ev.tipo,
              total: Number(ev.total),
              nTransacoes: Number(ev.nTransacoes),
            }))}
          />
        </section>
      )}

      {/* Coleções ativas */}
      {colecoes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-h4 font-semibold tracking-tight">Coleções ativas</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/colecoes">Ver todas</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {colecoes.map((c) => (
              <Card key={c.id} interactive>
                <CardContent className="flex items-center gap-3 p-4">
                  <span
                    className="flex size-10 items-center justify-center rounded-[12px] text-lg"
                    style={{ backgroundColor: `${c.cor ?? "#8FA993"}22` }}
                  >
                    {c.icone ?? "📦"}
                  </span>
                  <p className="truncate text-body-sm font-medium">{c.nome}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Atividade recente — abrível */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h4 font-semibold tracking-tight">Atividade recente</h2>
          {!semDados && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/transacoes">
                Ver tudo <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>

        {semDados ? (
          <EmptyState
            icon={Wallet}
            title="Sua primeira transação começa aqui"
            description="Toque em “Nova transação” para registrar um gasto ou receita. Em segundos, o Nosso Tudo organiza por você."
          />
        ) : (
          <AtividadeRecente transacoes={recentes} />
        )}
      </section>

      {/* Atalho cartões */}
      {cartoes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">Seus cartões</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cartoes.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-body-sm font-medium">{c.apelido}</p>
                    <Layers className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {c.banco}
                    {c.ultimos_digitos ? ` ·· ${c.ultimos_digitos}` : ""}
                  </p>
                  {c.limite != null && (
                    <p className="mt-3 text-body-sm tabular-nums">Limite {formatBRL(c.limite)}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
