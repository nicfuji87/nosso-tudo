import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/format";
import type { CompromissosFuturos } from "@/lib/db/queries";

const COR_REC = "#3D6D84";
const COR_PARC = "#E08A4B";

/**
 * Seção "Futuro": o que a família já tem comprometido daqui pra frente —
 * contas fixas (recorrências) + parcelas a vencer. Olhar pra frente, não pro
 * retrovisor.
 */
export function CompromissosFuturosSecao({ dados }: { dados: CompromissosFuturos }) {
  const { porMes, contasFixas, parcelasAbertas, totalMensalRecorrente, totalParcelasRestante } = dados;
  const maxMes = Math.max(1, ...porMes.map((m) => m.total));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h4 font-semibold tracking-tight">Futuro — o que já está comprometido</h2>
        <p className="text-caption text-muted-foreground">
          Contas fixas e parcelas que já têm destino certo nos próximos meses.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Contas fixas por mês</p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(totalMensalRecorrente)}</p>
            <p className="text-caption text-muted-foreground">
              {contasFixas.length} {contasFixas.length === 1 ? "recorrência" : "recorrências"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-caption text-muted-foreground">Parcelas em aberto</p>
            <p className="tabular mt-1 text-h4 font-semibold">{formatBRL(totalParcelasRestante)}</p>
            <p className="text-caption text-muted-foreground">
              {parcelasAbertas.length} {parcelasAbertas.length === 1 ? "compra parcelada" : "compras parceladas"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cronograma por mês */}
      <Card>
        <CardContent className="p-5">
          <p className="text-body-sm font-medium">A vencer nos próximos meses</p>
          <p className="text-caption text-muted-foreground">Soma das contas fixas + parcelas de cada mês</p>
          <ul className="mt-4 space-y-3">
            {porMes.map((m) => (
              <li key={m.mes}>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="capitalize">{m.label}</span>
                  <span className="tabular font-medium">
                    {formatBRL(m.total)}
                    {m.parcelas > 0 && (
                      <span className="text-caption font-normal text-muted-foreground">
                        {" "}
                        · {formatBRL(m.parcelas)} em parcelas
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full"
                    style={{ width: `${(m.recorrencias / maxMes) * 100}%`, backgroundColor: COR_REC }}
                  />
                  <div
                    className="h-full"
                    style={{ width: `${(m.parcelas / maxMes) * 100}%`, backgroundColor: COR_PARC }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-4 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: COR_REC }} /> Contas fixas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: COR_PARC }} /> Parcelas
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Parceladas em aberto */}
      {parcelasAbertas.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Compras parceladas em aberto</p>
            <p className="text-caption text-muted-foreground">Quanto ainda falta pagar de cada uma</p>
            <ul className="mt-4 divide-y divide-border/70">
              {parcelasAbertas.map((p) => (
                <li key={p.serieId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">{p.descricao}</p>
                    <p className="text-caption text-muted-foreground">
                      {p.restantes} de {p.totalParcelas} a vencer · {formatBRL(p.valorParcela)}/mês
                      {p.proxima ? ` · próxima ${formatDate(p.proxima)}` : ""}
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-body-sm font-semibold">{formatBRL(p.totalRestante)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Contas fixas (normalizadas por mês) */}
      {contasFixas.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-body-sm font-medium">Contas fixas</p>
            <p className="text-caption text-muted-foreground">Valor médio por mês (normalizado pela frequência)</p>
            <ul className="mt-4 divide-y divide-border/70">
              {contasFixas.slice(0, 10).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm">{c.descricao}</p>
                    <p className="text-caption text-muted-foreground">{c.frequenciaLabel}</p>
                  </div>
                  <p className="tabular shrink-0 text-body-sm font-medium">{formatBRL(c.valorMensal)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
