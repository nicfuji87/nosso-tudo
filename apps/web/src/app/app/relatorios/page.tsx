import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/auth";
import {
  getComparativoPeriodo,
  getCompromissosFuturos,
  getDependenciaFornecedores,
  getDinheiroSemDono,
  getGastosPorCategoriaPeriodo,
  getGastosPorContexto,
  getGastosPorEssencialidadePeriodo,
  getGastosPorSubcategoriaPeriodo,
  getResumoPeriodo,
  listBeneficiarios,
  listCategoriasPai,
} from "@/lib/db/queries";
import { PERIODO_PRESETS, resolverPeriodo, type PeriodoPreset } from "@/lib/periodo";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/patterns/empty-state";
import { BarChart3 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { CategoriaFilter } from "@/components/dashboard/categoria-filter";
import { ComparativoCard } from "@/components/dashboard/comparativo-card";
import { EssencialidadeCard } from "@/components/dashboard/essencialidade-card";
import { PeriodoFilter } from "@/components/dashboard/periodo-filter";
import { PessoaFilter } from "@/components/dashboard/pessoa-filter";
import { CompromissosFuturosSecao } from "@/components/dashboard/compromissos-futuros";
import { DependenciaFornecedoresCard, DinheiroSemDonoCard } from "@/components/dashboard/insights-extra";

export const metadata: Metadata = { title: "Relatórios" };

const PALETTE = ["#3D6D84", "#8FA993", "#FF7043", "#7E57C2", "#EC407A", "#C4B8B0"];

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pessoa?: string; categoria?: string };
}) {
  const { workspace } = await getWorkspaceContext();

  // Filtro de tempo via URL (?periodo=… &de=&ate=); ausente/ inválido = mês atual.
  const periodo = resolverPeriodo(searchParams);
  const presetUI: PeriodoPreset = (PERIODO_PRESETS as readonly string[]).includes(searchParams.periodo ?? "")
    ? (searchParams.periodo as PeriodoPreset)
    : "mes-atual";

  // Opções e seleção dos filtros por pessoa e categoria (validadas contra a lista).
  const [pessoas, categoriasPai, compromissos] = await Promise.all([
    listBeneficiarios(workspace.id),
    listCategoriasPai(workspace.id),
    getCompromissosFuturos(workspace.id),
  ]);
  const temFuturo = compromissos.contasFixas.length > 0 || compromissos.parcelasAbertas.length > 0;
  const pessoaSel = pessoas.find((p) => p.id === searchParams.pessoa) ?? null;
  const beneficiarioId = pessoaSel?.id;
  const catSel = categoriasPai.find((c) => c.id === searchParams.categoria) ?? null;

  const [resumo, categorias, essenc, eventos, comparativo, fornecedores, semDono] = await Promise.all([
    getResumoPeriodo(workspace.id, periodo.inicio, periodo.fim),
    // Com categoria escolhida, o card vira o detalhe dela (subcategorias).
    catSel
      ? getGastosPorSubcategoriaPeriodo(workspace.id, periodo.inicio, periodo.fim, catSel.id, beneficiarioId)
      : getGastosPorCategoriaPeriodo(workspace.id, periodo.inicio, periodo.fim, beneficiarioId),
    getGastosPorEssencialidadePeriodo(workspace.id, periodo.inicio, periodo.fim, beneficiarioId),
    getGastosPorContexto(workspace.id),
    getComparativoPeriodo(workspace.id, periodo, beneficiarioId),
    getDependenciaFornecedores(workspace.id, periodo.inicio, periodo.fim),
    getDinheiroSemDono(workspace.id, periodo.inicio, periodo.fim),
  ]);

  const totalCat = categorias.reduce((s, c) => s + Number(c.total), 0);
  const totalEssenc = essenc.reduce((s, e) => s + e.total, 0);
  const filtrado = catSel || pessoaSel;
  // Filtros estreitam o que conta como "sem dados".
  const semDados = catSel
    ? totalCat === 0
    : pessoaSel
      ? totalCat === 0 && totalEssenc === 0
      : totalCat === 0 && totalEssenc === 0 && eventos.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Para onde o dinheiro vai — por categoria, por natureza e por evento."
      />

      {temFuturo && <CompromissosFuturosSecao dados={compromissos} />}

      <div className="flex flex-wrap items-center gap-2">
        <PeriodoFilter preset={presetUI} de={searchParams.de ?? null} ate={searchParams.ate ?? null} />
        <PessoaFilter pessoas={pessoas} pessoaId={pessoaSel?.id ?? null} />
        <CategoriaFilter categorias={categoriasPai} categoriaId={catSel?.id ?? null} />
      </div>

      {/* Resumo — com filtro de categoria/pessoa vira só "despesas daquele recorte" */}
      {filtrado ? (
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">
              {catSel ? `Despesas em ${catSel.nome}` : `Despesas de ${pessoaSel!.nome}`}
            </p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(totalCat)}</p>
          </CardContent>
        </Card>
      ) : (
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
      )}

      {semDados ? (
        <EmptyState
          icon={BarChart3}
          title="Ainda não há dados para os relatórios"
          description="Assim que houver despesas classificadas (pelo WhatsApp, pela Nia ou manualmente), os gráficos aparecem aqui."
        />
      ) : (
        <>
          {/* Comparativo do período — não no recorte de uma categoria só */}
          {!catSel && <ComparativoCard comparativo={comparativo} />}

          {/* Gastos por categoria — ou o detalhe (subcategorias) da categoria filtrada */}
          <Card>
            <CardContent className="p-5">
              <p className="text-body-sm font-medium">
                {catSel ? `Detalhe de ${catSel.nome}` : "Gastos por categoria"}
              </p>
              <p className="text-caption text-muted-foreground">
                {catSel
                  ? "Subcategorias, somadas item a item"
                  : "Onde o dinheiro foi de verdade (somado item a item)"}
              </p>
              {categorias.length === 0 ? (
                <p className="mt-4 text-caption text-muted-foreground">
                  Sem despesas no período.
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

          {/* Essencial × Supérfluo — não no recorte de uma categoria só */}
          {!catSel && totalEssenc > 0 && (
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

          {/* Custo por evento (contexto) — all-time, não se aplica a recortes filtrados */}
          {!filtrado && eventos.length > 0 && (
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

          {/* Dependência de fornecedores e dinheiro sem dono — só na visão geral */}
          {!filtrado && <DependenciaFornecedoresCard dados={fornecedores} />}
          {!filtrado && <DinheiroSemDonoCard dados={semDono} />}
        </>
      )}
    </div>
  );
}
