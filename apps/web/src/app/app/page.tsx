import Link from "next/link";
import { ArrowRight, Layers, Sparkles, Wallet } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getGastosPorCategoria,
  getGastosPorContexto,
  getGastosPorEssencialidade,
  getResumoMes,
  listCartoes,
  listTransacoes,
} from "@/lib/db/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { TransacaoItem } from "@/components/transacoes/transacao-item";
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

  const [resumo, gastos, essenc, eventos, recentes, cartoes, colecoesRes] = await Promise.all([
    getResumoMes(workspace.id),
    getGastosPorCategoria(workspace.id),
    getGastosPorEssencialidade(workspace.id),
    getGastosPorContexto(workspace.id),
    listTransacoes(workspace.id, { limit: 6 }),
    listCartoes(workspace.id),
    supabase.from("v_colecoes_em_aberto").select("*").eq("workspace_id", workspace.id).limit(4),
  ]);

  const totalEssenc = essenc.reduce((s, e) => s + e.total, 0);
  const eventosTop = eventos.slice(0, 4);

  const colecoes = (colecoesRes.data as { id: string; nome: string; cor: string | null; icone: string | null }[] | null) ?? [];
  const primeiroNome = profile.nome.split(" ")[0];
  const semDados = resumo.total_transacoes === 0;

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
    <div className="space-y-8">
      {/* Saudação */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-body-sm text-muted-foreground">
            {greeting()}, {primeiroNome}
          </p>
          <h1 className="text-h2 font-semibold capitalize tracking-tight">
            {formatDate(new Date(), "MMMM 'de' yyyy")}
          </h1>
        </div>
        {plan.slug === "free" && (
          <Badge variant="tech" className="hidden sm:inline-flex">
            <Sparkles className="size-3" /> Pro: WhatsApp + IA
          </Badge>
        )}
      </div>

      {/* Card saúde do mês */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="atmosphere-soft relative overflow-hidden rounded-2xl bg-brand-graphite p-7 text-brand-offwhite shadow-card">
          <p className="text-overline uppercase tracking-wide text-brand-offwhite/50">
            Saldo do mês
          </p>
          <p
            className="tabular mt-2 text-display-md font-semibold tracking-tight"
            style={{ color: resumo.saldo >= 0 ? "#8FA993" : "#EF8A8A" }}
          >
            {formatBRL(resumo.saldo, { sign: true })}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-caption text-brand-offwhite/50">Receitas</p>
              <p className="tabular text-body-lg font-medium">{formatBRL(resumo.receitas)}</p>
            </div>
            <div>
              <p className="text-caption text-brand-offwhite/50">Despesas</p>
              <p className="tabular text-body-lg font-medium">{formatBRL(resumo.despesas)}</p>
            </div>
          </div>
        </div>

        {/* Donut gastos por categoria */}
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Gastos por categoria</p>
            {donut.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-center text-caption text-muted-foreground">
                Sem despesas neste mês ainda.
              </div>
            ) : (
              <div className="relative mt-2">
                <CategoryDonut data={donut} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-caption text-muted-foreground">Total</span>
                  <span className="tabular text-body font-semibold">{formatBRL(resumo.despesas)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Essencial × Supérfluo (essencialidade) */}
      {totalEssenc > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Essencial × Supérfluo</p>
            <p className="text-caption text-muted-foreground">
              Para onde o dinheiro vai por natureza do gasto
            </p>
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
                    <p className="tabular text-body-sm font-medium">
                      {Math.round((e.total / totalEssenc) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eventos (contexto) — custo por evento da vida familiar */}
      {eventosTop.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">Eventos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {eventosTop.map((ev) => (
              <Card key={ev.contextoId}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ev.icone ?? "🗓️"}</span>
                    <p className="truncate text-body-sm font-medium">{ev.nome}</p>
                  </div>
                  <p className="tabular mt-3 text-body-lg font-semibold">{formatBRL(ev.total)}</p>
                  <p className="text-caption text-muted-foreground">
                    {ev.nTransacoes} {ev.nTransacoes === 1 ? "lançamento" : "lançamentos"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
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

      {/* Transações recentes */}
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
          <Card>
            <CardContent className="divide-y divide-border/70 p-2 px-5">
              {recentes.map((tx) => (
                <TransacaoItem key={tx.id} tx={tx} />
              ))}
            </CardContent>
          </Card>
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
                    <p className="tabular mt-3 text-body-sm">
                      Limite {formatBRL(c.limite)}
                    </p>
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
