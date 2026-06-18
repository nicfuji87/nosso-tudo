import Link from "next/link";
import { ArrowRight, Sparkles, Wallet } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getGastosPorCategoria,
  getGastosPorContexto,
  getGastosPorEssencialidade,
  getGastosPorPessoa,
  getResumoMes,
  listTransacoes,
} from "@/lib/db/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { CategoriasCard } from "@/components/dashboard/categorias-card";
import { CollapsibleCard } from "@/components/dashboard/collapsible-card";
import { EssencialidadeCard } from "@/components/dashboard/essencialidade-card";
import { GastoPorPessoa } from "@/components/dashboard/gasto-por-pessoa";
import { AtividadeRecente } from "@/components/dashboard/atividade-recente";
import { EventosLista } from "@/components/dashboard/eventos-lista";
import { greeting, formatBRL, formatDate } from "@/lib/format";

const PALETTE = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

export default async function HomePage() {
  const { profile, workspace, plan } = await getWorkspaceContext();
  const supabase = createClient();

  const [resumo, gastos, essenc, pessoas, eventos, recentes, colecoesRes] = await Promise.all([
    getResumoMes(workspace.id),
    getGastosPorCategoria(workspace.id),
    getGastosPorEssencialidade(workspace.id),
    getGastosPorPessoa(workspace.id),
    getGastosPorContexto(workspace.id),
    listTransacoes(workspace.id, { limit: 6, ordenarPor: "criacao" }),
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

  const categoriasResumo = gastos.map((g, i) => ({
    id: g.categoria_id,
    nome: g.categoria_nome,
    total: Number(g.total),
    cor: g.cor || PALETTE[i % PALETTE.length]!,
  }));

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
              <CategoriasCard categorias={categoriasResumo} total={resumo.despesas} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gasto por pessoa — recolhível */}
      {pessoas.length > 0 && (
        <CollapsibleCard
          id="gasto-pessoa"
          titulo="Gasto por pessoa"
          subtitulo="Despesas do mês por pessoa"
          resumo={formatBRL(pessoas.reduce((s, p) => s + p.total, 0))}
        >
          <GastoPorPessoa dados={pessoas} />
        </CollapsibleCard>
      )}

      {/* Essencial × Supérfluo — recolhível e clicável */}
      {totalEssenc > 0 && (
        <CollapsibleCard
          id="essencialidade"
          titulo="Essencial × Supérfluo"
          subtitulo="Toque numa faixa para ver o que entra nela"
        >
          <EssencialidadeCard data={essenc} />
        </CollapsibleCard>
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
    </div>
  );
}
