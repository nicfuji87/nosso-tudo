"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Loader2, Sparkles, Undo2 } from "lucide-react";
import type { ContaFixaMes } from "@/lib/db/queries";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { CollapsibleCard } from "./collapsible-card";
import { desfazerBaixaContaFixa, marcarContaFixaPaga } from "./actions";

/**
 * Contas fixas do mês, ocorrência a ocorrência: o que já foi pago e o que
 * falta. A baixa costuma vir sozinha — um lançamento avulso que casa com o
 * vencimento é conciliado no banco (migration 0038) e aparece aqui como
 * "baixa automática". O botão existe para o resto.
 */
export function ContasFixasCard({ contas }: { contas: ContaFixaMes[] }) {
  if (contas.length === 0) return null;

  const pagas = contas.filter((c) => c.paga);
  const abertas = contas.filter((c) => !c.paga);
  const totalPago = pagas.reduce((s, c) => s + (c.valor ?? 0), 0);
  const totalAberto = abertas.reduce((s, c) => s + c.valorPrevisto, 0);

  // Semanal e quinzenal enchem o mês de ocorrências; recolhido, o cabeçalho
  // já responde "quanto falta" sem ocupar meia tela.
  return (
    <CollapsibleCard
      id="contas-fixas"
      titulo="Contas fixas"
      subtitulo={`${pagas.length} de ${contas.length} pagas neste mês`}
      resumo={totalAberto > 0 ? `falta ${formatBRL(totalAberto)}` : "tudo pago"}
      defaultOpen
    >
      <div className="space-y-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-accent transition-all duration-base"
            style={{ width: `${(pagas.length / contas.length) * 100}%` }}
          />
        </div>

        <ul className="divide-y divide-border/60">
          {contas.map((c) => (
            <LinhaConta key={`${c.recorrenciaId}-${c.data}`} conta={c} />
          ))}
        </ul>

        {totalPago > 0 && (
          <p className="text-caption text-muted-foreground">
            Pago até agora: <span className="font-medium text-foreground">{formatBRL(totalPago)}</span>
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}

function LinhaConta({ conta }: { conta: ContaFixaMes }) {
  const [pendente, iniciar] = useTransition();
  const [ajustando, setAjustando] = useState(false);
  const [valor, setValor] = useState(String(conta.valorPrevisto));

  function darBaixa(valorAjustado?: number) {
    if (!conta.transacaoId) return;
    iniciar(async () => {
      const res = await marcarContaFixaPaga(conta.transacaoId!, valorAjustado);
      if (res.error) toast.error("Não deu certo", { description: res.error });
      else {
        setAjustando(false);
        toast.success(`${conta.nome} — baixa dada`);
      }
    });
  }

  function desfazer() {
    if (!conta.transacaoId) return;
    iniciar(async () => {
      const res = await desfazerBaixaContaFixa(conta.transacaoId!);
      if (res.error) toast.error("Não deu certo", { description: res.error });
      else toast.success("Baixa desfeita", { description: `${conta.nome} voltou para em aberto.` });
    });
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          conta.paga
            ? "bg-accent/15 text-accent"
            : conta.atrasada
              ? "bg-destructive/15 text-destructive"
              : "bg-secondary text-muted-foreground",
        )}
        aria-hidden
      >
        {conta.paga ? <Check className="size-3.5" /> : <Clock className="size-3.5" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-body-sm", conta.paga && "text-muted-foreground")}>{conta.nome}</p>
        <p className="truncate text-caption text-muted-foreground">
          {conta.paga ? "Pago em " : "Vence "}
          {formatDate(conta.data, "dd/MM")}
          {conta.atrasada && <span className="text-destructive"> · em atraso</span>}
          {conta.baixaPorLancamento && (
            <span className="inline-flex items-center gap-1">
              {" · "}
              <Sparkles className="size-3" />
              baixa automática
            </span>
          )}
        </p>
      </div>

      {ajustando ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            step="0.01"
            value={valor}
            autoFocus
            onChange={(e) => setValor(e.target.value)}
            className="h-9 w-24 rounded-full border border-input bg-card px-3 text-body-sm tabular-nums focus:outline-none focus-visible:border-foreground/40"
            aria-label={`Valor pago de ${conta.nome}`}
          />
          <Button size="sm" disabled={pendente} onClick={() => darBaixa(Number(valor))}>
            {pendente && <Loader2 className="animate-spin" />}
            Dar baixa
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "text-body-sm tabular-nums",
              conta.paga ? "text-muted-foreground" : "font-medium",
            )}
          >
            {formatBRL(conta.valor ?? conta.valorPrevisto)}
          </span>

          {conta.paga
            ? conta.baixaPorLancamento && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pendente}
                  onClick={desfazer}
                  aria-label={`Desfazer baixa de ${conta.nome}`}
                  title="Desfazer baixa"
                >
                  {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
                </Button>
              )
            : // Sem transação ainda: o vencimento é futuro e o cron só
              // materializa no dia — não há o que dar baixa.
              conta.transacaoId && (
                <Button variant="secondary" size="sm" onClick={() => setAjustando(true)}>
                  Dar baixa
                </Button>
              )}
        </div>
      )}
    </li>
  );
}
