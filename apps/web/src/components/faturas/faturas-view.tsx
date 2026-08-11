import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { formatBRL, formatDate, hojeISO } from "@/lib/format";
import type { FaturasEContasFixas, FaturaResumo, VencimentoContaFixa } from "@/lib/db/queries";

/** Agrupa por vencimento: é assim que a fatura chega na vida real. */
function agruparPorVencimento(faturas: FaturaResumo[]) {
  const mapa = new Map<string, FaturaResumo[]>();
  for (const f of faturas) {
    const chave = f.vencimento ?? f.mesReferencia;
    const lista = mapa.get(chave) ?? [];
    lista.push(f);
    mapa.set(chave, lista);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, lista]) => ({
      data,
      lista: lista.sort((a, b) => b.total - a.total),
      total: lista.reduce((s, f) => s + f.total, 0),
    }));
}

function StatusFatura({ fatura, hoje }: { fatura: FaturaResumo; hoje: string }) {
  if (fatura.paga) return <Badge variant="success">paga</Badge>;
  if (fatura.vencimento && fatura.vencimento < hoje) return <Badge variant="destructive">vencida</Badge>;
  return <Badge variant="warning">a pagar</Badge>;
}

function LinhaFatura({ fatura, hoje }: { fatura: FaturaResumo; hoje: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-medium">{fatura.cartao}</span>
          {fatura.ultimosDigitos && (
            <span className="text-caption text-muted-foreground">•••• {fatura.ultimosDigitos}</span>
          )}
          <StatusFatura fatura={fatura} hoje={hoje} />
        </div>
        <p className="text-caption text-muted-foreground">
          {fatura.qtdLancamentos} {fatura.qtdLancamentos === 1 ? "lançamento" : "lançamentos"}
          {fatura.confere ? (
            <span className="ml-2 inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3" aria-hidden />
              confere com a fatura
            </span>
          ) : (
            /* A soma dos lançamentos não fecha com o total impresso: falta
               importar alguma linha, ou sobrou alguma que não é dessa fatura. */
            <span className="ml-2 inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3" aria-hidden />
              lançado {formatBRL(fatura.lancado)} — diferença de{" "}
              {formatBRL(Math.abs(fatura.total - fatura.lancado))}
            </span>
          )}
        </p>
      </div>
      <span className="tabular text-body-sm font-semibold">{formatBRL(fatura.total)}</span>
    </li>
  );
}

function LinhaVencimento({ v, aberto }: { v: VencimentoContaFixa; aberto: boolean }) {
  const diferente = Math.abs(v.valorLancado - v.valorPrevisto) >= 0.01;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0">
        <p className="text-body-sm">{v.descricao}</p>
        <p className="text-caption text-muted-foreground">
          {aberto ? "venceu" : "pago"} em {formatDate(v.data)}
          {!aberto && diferente && (
            <span className="ml-2 text-warning">
              previsto {formatBRL(v.valorPrevisto)}
            </span>
          )}
        </p>
      </div>
      <span className="tabular text-body-sm font-medium">
        {formatBRL(aberto ? v.valorPrevisto : v.valorLancado)}
      </span>
    </li>
  );
}

export function FaturasView({ dados }: { dados: FaturasEContasFixas }) {
  const hoje = hojeISO();
  const grupos = agruparPorVencimento(dados.faturas);
  const abertos = dados.vencimentosAbertos;
  const totalAberto = abertos.reduce((s, v) => s + v.valorPrevisto, 0);

  return (
    <div className="space-y-8">
      {/* Números do topo: o que ainda sai da conta e o que já foi. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Faturas a pagar</p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(dados.totalEmAberto)}</p>
            <p className="text-caption text-muted-foreground">
              {dados.faturas.filter((f) => !f.paga).length} em aberto
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Contas fixas sem baixa</p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(totalAberto)}</p>
            <p className="text-caption text-muted-foreground">
              {abertos.length} {abertos.length === 1 ? "vencimento" : "vencimentos"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Conferência</p>
            <p className="tabular mt-1 text-h4 font-semibold">
              {dados.faturas.length - dados.divergentes}/{dados.faturas.length}
            </p>
            <p className="text-caption text-muted-foreground">
              {dados.divergentes === 0
                ? "todas batem com o PDF"
                : `${dados.divergentes} com diferença`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Faturas por vencimento */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-h4 font-semibold tracking-tight">Faturas por vencimento</h2>
        </div>
        {grupos.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma fatura importada"
            description="Mande o PDF da fatura para a Nia e ela concilia com o que já está lançado."
          />
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <Card key={g.data}>
                <CardContent className="p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-body-sm font-medium">
                      <CalendarClock className="mr-1.5 inline size-3.5 text-muted-foreground" aria-hidden />
                      Vence em {formatDate(g.data)}
                    </p>
                    <span className="tabular text-body-sm font-semibold">{formatBRL(g.total)}</span>
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {g.lista.map((f) => (
                      <LinhaFatura key={f.id} fatura={f} hoje={hoje} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Contas fixas: o valor está em mostrar o que NÃO achou pagamento. */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Repeat className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-h4 font-semibold tracking-tight">Contas fixas</h2>
        </div>

        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Venceram e não achei o pagamento</p>
            <p className="text-caption text-muted-foreground">
              A baixa é automática quando entra um lançamento que casa em descrição e valor. Estes
              ficaram sem par — ou não foram pagos, ou foram pagos por um meio que ainda não importamos.
            </p>
            {abertos.length === 0 ? (
              <p className="mt-4 inline-flex items-center gap-2 text-body-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                Nenhuma conta fixa em aberto.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {abertos.map((v) => (
                  <LinhaVencimento key={v.id} v={v} aberto />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {dados.vencimentosPagos.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="text-body-sm font-medium">Com baixa dada</p>
              <p className="text-caption text-muted-foreground">
                Últimos vencimentos conciliados. Quando o valor real difere do previsto, o previsto
                aparece ao lado — é sinal de que a recorrência precisa ser atualizada.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {dados.vencimentosPagos.slice(0, 12).map((v) => (
                  <LinhaVencimento key={v.id} v={v} aberto={false} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
