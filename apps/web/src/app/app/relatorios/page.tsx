import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import {
  getComparativoMes,
  getGastosPorCategoria,
  getGastosPorContexto,
  getGastosPorEssencialidade,
  getResumoMes,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/empty-state";
import { BarChart3 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ComparativoCard } from "@/components/dashboard/comparativo-card";
import { EssencialidadeCard } from "@/components/dashboard/essencialidade-card";
import { PeriodoFilter } from "@/components/dashboard/periodo-filter";

export const metadata: Metadata = { title: "Relatórios" };

const PALETTE = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const { workspace } = await getWorkspaceContext();

  // Mês de referência via URL (?mes=YYYY-MM); inválido/ausente = mês atual.
  const hoje = new Date();
  const valido = typeof searchParams.mes === "string" && /^\d{4}-\d{2}$/.test(searchParams.mes);
  const ref = valido
    ? new Date(`${searchParams.mes}-01T00:00:00`)
    : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const mesUI = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const mesRef = `${mesUI}-01`;
  const ehMesAtual = ref.getFullYear() === hoje.getFullYear() && ref.getMonth() === hoje.getMonth();

  const [resumo, categorias, essenc, eventos, comparativo] = await Promise.all([
    getResumoMes(workspace.id, mesRef),
    getGastosPorCategoria(workspace.id, mesRef),
    getGastosPorEssencialidade(workspace.id, mesRef),
    getGastosPorContexto(workspace.id),
    getComparativoMes(workspace.id, mesRef),
  ]);

  const totalCat = categorias.reduce((s, c) => s + Number(c.total), 0);
  const totalEssenc = essenc.reduce((s, e) => s + e.total, 0);
  const semDados = totalCat === 0 && totalEssenc === 0 && eventos.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Para onde o dinheiro vai — por categoria, por natureza e por evento."
      />

      <PeriodoFilter mes={mesUI} ehMesAtual={ehMesAtual} />

      {/* Resumo do mês */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Receitas</p>
            <p className="tabular mt-1 text-h4 font-semibold text-success">
              {formatBRL(resumo.receitas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Despesas</p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(resumo.despesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Saldo</p>
            <p
              className="tabular mt-1 text-h4 font-semibold"
              style={{ color: resumo.saldo >= 0 ? "#8FA993" : "#EF8A8A" }}
            >
              {formatBRL(resumo.saldo, { sign: true })}
            </p>
          </CardContent>
        </Card>
      </div>

      {semDados ? (
        <EmptyState
          icon={BarChart3}
          title="Ainda não há dados para os relatórios"
          description="Assim que houver despesas classificadas (pelo WhatsApp, pela Nia ou manualmente), os gráficos aparecem aqui."
        />
      ) : (
        <>
          {/* Comparativo mês a mês (mesmo período) */}
          <ComparativoCard comparativo={comparativo} />

          {/* Gastos por categoria */}
          <Card>
            <CardContent className="p-5">
              <p className="text-body-sm font-medium">Gastos por categoria</p>
              <p className="text-caption text-muted-foreground">
                Onde o dinheiro foi de verdade (somado item a item)
              </p>
              {categorias.length === 0 ? (
                <p className="mt-4 text-caption text-muted-foreground">
                  Sem despesas categorizadas neste mês.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {categorias.map((c, i) => {
                    const pct = totalCat > 0 ? (Number(c.total) / totalCat) * 100 : 0;
                    return (
                      <li key={c.categoria_id}>
                        <div className="flex items-center justify-between text-body-sm">
                          <span className="truncate">
                            {c.icone ? `${c.icone} ` : ""}
                            {c.categoria_nome}
                          </span>
                          <span className="tabular font-medium">
                            {formatBRL(Number(c.total))}{" "}
                            <span className="text-caption text-muted-foreground">
                              ({Math.round(pct)}%)
                            </span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: c.cor || PALETTE[i % PALETTE.length],
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Essencial × Supérfluo */}
          {totalEssenc > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="text-body-sm font-medium">Essencial × Supérfluo</p>
                <p className="text-caption text-muted-foreground">
                  Por natureza do gasto — toque para ver o que entra em cada
                </p>
                <div className="mt-4">
                  <EssencialidadeCard data={essenc} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custo por evento (contexto) */}
          {eventos.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="text-body-sm font-medium">Custo por evento</p>
                <p className="text-caption text-muted-foreground">
                  Quanto custou cada passeio, viagem ou compra do mês
                </p>
                <ul className="mt-4 divide-y divide-border/70">
                  {eventos.map((ev) => (
                    <li key={ev.contextoId} className="flex items-center gap-3 py-2.5">
                      <span className="text-lg">{ev.icone ?? "🗓️"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium">{ev.nome}</p>
                        <p className="text-caption text-muted-foreground">
                          {ev.nTransacoes} {ev.nTransacoes === 1 ? "lançamento" : "lançamentos"}
                        </p>
                      </div>
                      <p className="tabular text-body-sm font-semibold">{formatBRL(ev.total)}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
