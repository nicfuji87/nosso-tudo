"use client";

import { useState, useTransition } from "react";
import {
  CalendarClock,
  ChevronDown,
  Coins,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatBRL, formatDate, formatNumber, hojeISO } from "@/lib/format";
import { LABEL_ORIGEM_LOTE, ORIGENS_LOTE } from "@/lib/viagens/custo";
import type { Carteira, ProgramaCarteira } from "@/lib/viagens/carteira";
import { adicionarLote, excluirLote } from "@/app/app/viagens/actions";

/**
 * Carteira de milhas.
 *
 * O número em destaque NÃO é o saldo — é o custo por mil. Saldo você vê no site
 * do programa; o que só existe aqui é quanto aquela milha te custou, porque é
 * isso que responde "vale emitir ou pagar?".
 */

function PorMil({ cents, className }: { cents: number | null; className?: string }) {
  if (cents === null) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatBRL(cents / 100)}
      <span className="text-caption font-normal text-muted-foreground">/mil</span>
    </span>
  );
}

function CartaoPrograma({ item }: { item: ProgramaCarteira }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const hoje = hojeISO();

  function excluir(id: string) {
    iniciar(async () => {
      const r = await excluirLote(id);
      if (r.error) toast.error(r.error);
      else toast.success("Lote removido.");
    });
  }

  // Milha de graça (acúmulo puro) é um resultado ótimo, não um dado faltando.
  const deGraca = item.custoPorMilCents === 0;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-body font-semibold">{item.programa.nome}</h3>
            {item.programa.alianca && (
              <Badge variant="outline" size="sm">
                {item.programa.alianca}
              </Badge>
            )}
          </div>
          <p className="text-caption text-muted-foreground">
            {item.lotes.length} lote{item.lotes.length > 1 ? "s" : ""}
            {item.proximaExpiracao && ` · vence a partir de ${formatDate(item.proximaExpiracao)}`}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-body-lg font-semibold tabular-nums">
            {formatNumber(item.saldo)}
          </p>
          <p className="text-caption text-muted-foreground">milhas</p>
        </div>

        <div className="w-[128px] text-right">
          <PorMil
            cents={item.custoPorMilCents}
            className={cn("text-body font-semibold", deGraca && "text-success")}
          />
          <p className="text-caption text-muted-foreground">
            {deGraca ? "acúmulo puro" : "custo real"}
          </p>
        </div>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            aberto && "rotate-180",
          )}
        />
      </button>

      {aberto && (
        <div className="border-t border-border/60 bg-secondary/30">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-left text-caption text-muted-foreground">
                <th className="px-4 py-2 font-medium">Entrada</th>
                <th className="px-4 py-2 font-medium">Origem</th>
                <th className="px-4 py-2 text-right font-medium">Milhas</th>
                <th className="px-4 py-2 text-right font-medium">Custo</th>
                <th className="px-4 py-2 text-right font-medium">Por mil</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {item.lotes.map((l) => {
                const porMil =
                  l.quantidadeRestante > 0
                    ? Math.round(
                        ((l.custoCents * l.quantidadeRestante) / l.quantidade / l.quantidadeRestante) *
                          1000,
                      )
                    : null;
                const vencendo =
                  l.expiraEm !== null &&
                  Date.parse(`${l.expiraEm}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`) <
                    120 * 86_400_000;

                return (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(l.data)}</td>
                    <td className="px-4 py-2">
                      <span className="text-caption">{LABEL_ORIGEM_LOTE[l.origem]}</span>
                      {l.descricao && (
                        <p className="truncate text-caption text-muted-foreground">{l.descricao}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {formatNumber(l.quantidadeRestante)}
                      {l.quantidadeRestante !== l.quantidade && (
                        <span className="text-caption text-muted-foreground">
                          {" "}
                          de {formatNumber(l.quantidade)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {formatBRL(l.custoCents / 100)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <PorMil cents={porMil} className="text-body-sm" />
                    </td>
                    <td className="px-4 py-2">
                      {l.expiraEm ? (
                        <span
                          className={cn(
                            "text-caption",
                            vencendo ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          {formatDate(l.expiraEm)}
                        </span>
                      ) : (
                        <span className="text-caption text-muted-foreground">não vence</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={pendente}
                        onClick={() => excluir(l.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remover lote"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function CarteiraMilhas({ carteira }: { carteira: Carteira }) {
  const [adicionando, setAdicionando] = useState(false);
  const custoMedioGeral =
    carteira.saldoTotal > 0
      ? Math.round((carteira.investidoTotalCents / carteira.saldoTotal) * 1000)
      : null;

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-caption text-muted-foreground">
            <Wallet className="size-3.5" />
            Milhas na família
          </div>
          <p className="font-mono text-h3 font-semibold tabular-nums">
            {formatNumber(carteira.saldoTotal)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="mb-1 flex items-center gap-2 text-caption text-muted-foreground">
            <Coins className="size-3.5" />
            Investido no que ainda resta
          </div>
          <p className="font-mono text-h3 font-semibold tabular-nums">
            {formatBRL(carteira.investidoTotalCents / 100)}
          </p>
        </div>

        <div className="rounded-xl border border-accent/50 bg-accent/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-caption text-muted-foreground">
            <Coins className="size-3.5" />
            Custo médio real
          </div>
          <PorMil cents={custoMedioGeral} className="text-h3 font-semibold" />
        </div>
      </div>

      {/* Expiração */}
      {carteira.alertas.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-body-sm font-semibold">
            <CalendarClock className="size-4 text-warning" />
            Vencendo nos próximos 120 dias
          </h3>
          <ul className="space-y-1.5">
            {carteira.alertas.slice(0, 5).map((a) => (
              <li key={a.loteId} className="flex items-center justify-between gap-3 text-body-sm">
                <span className="text-muted-foreground">
                  {formatNumber(a.quantidade)} milhas · vence em {a.diasRestantes}d
                </span>
                <span className="font-mono tabular-nums">
                  {formatBRL(a.custoCents / 100)} em risco
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-warning/20 pt-2 text-caption text-muted-foreground">
            Ordenado por prejuízo, não por data — perder milha cara dói mais que perder milha
            barata.
          </p>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h4 font-semibold">Por programa</h2>
          <Button size="sm" onClick={() => setAdicionando(true)}>
            <Plus className="size-4" />
            Adicionar lote
          </Button>
        </div>

        {carteira.programas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background-warm/60 p-10 text-center">
            <Wallet className="size-6 text-muted-foreground" />
            <div className="max-w-md space-y-1">
              <p className="text-body-sm font-medium">Sua carteira está vazia</p>
              <p className="text-body-sm text-muted-foreground">
                Adicione um lote à mão, ou mande um extrato do programa no chat da Nia que ela lê e
                preenche. Cada lote guarda o que você pagou — é assim que sai o custo real da sua
                milha.
              </p>
            </div>
            <Button size="sm" onClick={() => setAdicionando(true)}>
              <Plus className="size-4" />
              Adicionar o primeiro lote
            </Button>
          </div>
        ) : (
          carteira.programas.map((p) => <CartaoPrograma key={p.programa.id} item={p} />)
        )}
      </div>

      <NovoLoteDialog
        aberto={adicionando}
        onFechar={() => setAdicionando(false)}
        programas={carteira.programasDisponiveis}
      />
    </div>
  );
}

const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-body-sm focus-visible:outline-none focus-visible:shadow-focus";

function NovoLoteDialog({
  aberto,
  onFechar,
  programas,
}: {
  aberto: boolean;
  onFechar: () => void;
  programas: Carteira["programasDisponiveis"];
}) {
  const [pendente, iniciar] = useTransition();
  const [origem, setOrigem] = useState<string>("compra");

  // Acúmulo e bônus não custam dinheiro — esconder o campo evita o erro mais
  // comum, que é lançar custo em milha que veio de graça e inflar a média.
  const temCusto = origem === "compra" || origem === "promocao";

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await adicionarLote({
        programaId: fd.get("programaId"),
        quantidade: fd.get("quantidade"),
        custoReais: temCusto ? fd.get("custoReais") : 0,
        origem: fd.get("origem"),
        data: fd.get("data"),
        expiraEm: fd.get("expiraEm"),
        descricao: fd.get("descricao"),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Lote adicionado.");
        onFechar();
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar lote de milhas</DialogTitle>
          <DialogDescription>
            Um lote é uma entrada de milhas com o custo dela. Compra, transferência recebida,
            acúmulo por gasto — cada uma tem um custo diferente, e é a média delas que vale.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" key={aberto ? "aberto" : "fechado"}>
          <div className="space-y-1.5">
            <Label>Programa</Label>
            <select name="programaId" required className={CLASSE_SELECT} defaultValue="">
              <option value="">Escolha…</option>
              {programas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Como entrou</Label>
            <select
              name="origem"
              className={CLASSE_SELECT}
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
            >
              {ORIGENS_LOTE.map((o) => (
                <option key={o} value={o}>
                  {LABEL_ORIGEM_LOTE[o]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quantidade de milhas</Label>
              <Input
                name="quantidade"
                inputMode="numeric"
                required
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{temCusto ? "Quanto pagou (R$)" : "Custo"}</Label>
              {temCusto ? (
                <Input
                  name="custoReais"
                  inputMode="decimal"
                  defaultValue="0"
                  className="font-mono tabular-nums"
                />
              ) : (
                <div className="flex h-11 items-center rounded-md bg-secondary/60 px-3 text-body-sm text-muted-foreground">
                  Sem custo — veio de graça
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data da entrada</Label>
              <Input type="date" name="data" required defaultValue={hojeISO()} />
            </div>
            <div className="space-y-1.5">
              <Label>Vence em</Label>
              <Input type="date" name="expiraEm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input name="descricao" placeholder="ex.: promoção 100% de bônus" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
