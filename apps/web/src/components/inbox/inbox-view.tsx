"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Store, Package, Tag, FileText, Pencil, Repeat, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/transacoes/money-input";
import { EmptyState } from "@/components/patterns/empty-state";
import { toast } from "@/components/ui/sonner";
import { formatBRL } from "@/lib/format";
import {
  ajustarEConfirmarTransacao,
  confirmarTransacaoRevisao,
  descartarTransacaoRevisao,
  resolverSugestao,
} from "@/app/app/inbox/actions";

export interface InboxItem {
  tipo_item: "sugestao_match" | "transacao_revisao" | "fatura_pendente";
  item_id: string;
  texto: string;
  valor: number | null;
  data_referencia: string | null;
  score_confianca: number | null;
  origem: string | null;
  status: string;
  created_at: string;
}

const TIPO_ICON: Record<string, typeof Store> = {
  estabelecimento: Store,
  produto: Package,
  categoria: Tag,
};

const TIPO_LABEL: Record<string, string> = {
  estabelecimento: "Estabelecimento",
  produto: "Produto",
  categoria: "Categoria",
};

function SugestaoCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [acao, setAcao] = useState<"mesmo" | "diferente" | null>(null);

  const [origem, sugerido] = item.texto.split(" → ");
  const Icon = TIPO_ICON[item.status] ?? Sparkles;
  const pct = item.score_confianca != null ? Math.round(Number(item.score_confianca) * 100) : null;

  function decidir(decisao: "mesmo" | "diferente") {
    setAcao(decisao);
    startTransition(async () => {
      const res = await resolverSugestao(item.item_id, decisao);
      if (res.error) {
        toast.error("Erro", { description: res.error });
        setAcao(null);
        return;
      }
      toast.success(decisao === "mesmo" ? "Sincronizado ✨" : "Mantidos separados");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Icon className="size-4" />
          </span>
          <Badge size="sm">{TIPO_LABEL[item.status] ?? item.status}</Badge>
          {pct != null && (
            <span className="text-caption text-muted-foreground">{pct}% parecido</span>
          )}
        </div>

        <p className="text-body-sm">
          É o mesmo que <span className="font-semibold text-foreground">{sugerido}</span>?
          <br />
          <span className="text-muted-foreground">Veio como “{origem}”.</span>
        </p>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => decidir("mesmo")}
            disabled={pending}
            className="flex-1"
          >
            {pending && acao === "mesmo" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Sim, é o mesmo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => decidir("diferente")}
            disabled={pending}
            className="flex-1"
          >
            {pending && acao === "diferente" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
            Não, é diferente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TransacaoRevisaoCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<number>(item.valor != null ? Number(item.valor) : 0);
  const ehRecorrente = item.origem === "recorrente";

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          {ehRecorrente ? <Repeat className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium">{item.texto}</p>
          <p className="text-caption text-muted-foreground">
            {ehRecorrente ? "Conta fixa" : "Capturado pela IA"}
            {item.data_referencia ? ` · ${item.data_referencia}` : ""}
          </p>
        </div>
        {!editando && item.valor != null && (
          <p className="tabular shrink-0 text-body-sm font-medium">{formatBRL(Number(item.valor))}</p>
        )}
      </div>

      {editando ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <MoneyInput value={valor} onChange={(v) => setValor(v ?? 0)} autoFocus />
          </div>
          <Button size="sm" onClick={() => run(() => ajustarEConfirmarTransacao(item.item_id, valor), "Confirmado")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Salvar e confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => run(() => confirmarTransacaoRevisao(item.item_id), "Confirmado")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditando(true)} disabled={pending}>
            <Pencil className="size-4" /> Editar valor
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(() => descartarTransacaoRevisao(item.item_id), "Descartado")}
            disabled={pending}
            aria-label="Descartar"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ item, icon: Icon }: { item: InboxItem; icon: typeof Store }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">{item.texto}</p>
          {item.data_referencia && (
            <p className="text-caption text-muted-foreground">{item.data_referencia}</p>
          )}
        </div>
      </div>
      {item.valor != null && (
        <p className="tabular shrink-0 text-body-sm font-medium">{formatBRL(Number(item.valor))}</p>
      )}
    </div>
  );
}

export function InboxView({ itens }: { itens: InboxItem[] }) {
  const sugestoes = itens.filter((i) => i.tipo_item === "sugestao_match");
  const novos = itens.filter((i) => i.tipo_item === "transacao_revisao");
  const faturas = itens.filter((i) => i.tipo_item === "fatura_pendente");

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="Tudo conferido 🎉"
        description="Quando a IA capturar algo que talvez já exista (um produto ou estabelecimento), a sugestão aparece aqui para você confirmar."
      />
    );
  }

  return (
    <div className="space-y-8">
      {sugestoes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">
            Sugestões para conferir
            <span className="ml-2 text-body-sm font-normal text-muted-foreground">
              {sugestoes.length}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sugestoes.map((s) => (
              <SugestaoCard key={s.item_id} item={s} />
            ))}
          </div>
        </section>
      )}

      {novos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">
            Contas a confirmar
            <span className="ml-2 text-body-sm font-normal text-muted-foreground">{novos.length}</span>
          </h2>
          <p className="text-body-sm text-muted-foreground">
            Contas fixas e lançamentos capturados pela IA. Só entram no saldo depois de confirmados.
          </p>
          <div className="space-y-2">
            {novos.map((n) => (
              <TransacaoRevisaoCard key={n.item_id} item={n} />
            ))}
          </div>
        </section>
      )}

      {faturas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-h4 font-semibold tracking-tight">Itens de fatura</h2>
          <div className="space-y-2">
            {faturas.map((f) => (
              <InfoRow key={f.item_id} item={f} icon={FileText} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
