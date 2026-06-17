"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";
import {
  LABEL_ESSENCIALIDADE,
  LABEL_MEIO_PAGAMENTO,
  LABEL_TIPO_TRANSACAO,
  type Essencialidade,
} from "@/lib/types/db";
import { detalheTransacao, type TransacaoDetalhe } from "./actions";

const ESS_VARIANT: Record<Essencialidade, "success" | "default" | "warning" | "tech"> = {
  essencial: "success",
  necessario: "default",
  superfluo: "warning",
  investimento: "tech",
};

export function TransacaoSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [det, setDet] = useState<TransacaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!id) return;
    setDet(null);
    setCarregando(true);
    let vivo = true;
    detalheTransacao(id).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const credito = det?.tipo === "receita" || det?.tipo === "investimento_resgate";

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {carregando || !det ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <SheetHeader className="pr-8">
              <SheetTitle>{det.descricao}</SheetTitle>
              <div className="flex items-center gap-2">
                <span
                  className="text-h3 font-semibold tabular-nums"
                  style={{ color: credito ? "#5B8A6F" : undefined }}
                >
                  {credito ? "+ " : "− "}
                  {formatBRL(det.valor)}
                </span>
                {det.status !== "confirmado" && (
                  <Badge variant="warning" size="sm">
                    a confirmar
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <dl className="divide-y divide-border/70 rounded-2xl border border-border">
              <Linha rotulo="Tipo" valor={LABEL_TIPO_TRANSACAO[det.tipo]} />
              <Linha
                rotulo="Categoria"
                valor={det.categoriaNome ? `${det.categoriaIcone ?? ""} ${det.categoriaNome}`.trim() : "Sem categoria"}
              />
              {det.meioPagamento && (
                <Linha rotulo="Pagamento" valor={LABEL_MEIO_PAGAMENTO[det.meioPagamento]} />
              )}
              {(det.cartao || det.conta) && (
                <Linha rotulo={det.cartao ? "Cartão" : "Conta"} valor={(det.cartao ?? det.conta)!} />
              )}
              {det.estabelecimento && <Linha rotulo="Onde" valor={det.estabelecimento} />}
              {det.pagador && <Linha rotulo="Quem pagou" valor={det.pagador} />}
              {det.contexto && <Linha rotulo="Evento" valor={det.contexto} />}
              <Linha rotulo="Data" valor={formatDate(det.data)} />
              {det.observacoes && <Linha rotulo="Notas" valor={det.observacoes} />}
            </dl>

            {det.itens.length > 0 && (
              <div className="space-y-2">
                <p className="text-body-sm font-medium">Itens ({det.itens.length})</p>
                <ul className="divide-y divide-border/70 rounded-2xl border border-border">
                  {det.itens.map((it, i) => (
                    <li key={i} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-body-sm">
                        {it.quantidade && it.quantidade > 1 ? `${it.quantidade}× ` : ""}
                        {it.nome}
                      </span>
                      {it.essencialidade && (
                        <Badge variant={ESS_VARIANT[it.essencialidade]} size="sm">
                          {LABEL_ESSENCIALIDADE[it.essencialidade]}
                        </Badge>
                      )}
                      <span className="w-20 shrink-0 text-right text-body-sm font-medium tabular-nums">
                        {it.valorTotal != null ? formatBRL(it.valorTotal) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-body-sm text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-right text-body-sm font-medium">{valor}</dd>
    </div>
  );
}
