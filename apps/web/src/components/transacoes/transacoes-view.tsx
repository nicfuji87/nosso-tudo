"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, Pencil, Search, Trash2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/empty-state";
import { TransacaoItem } from "./transacao-item";
import { TransacaoEditSheet } from "./transacao-edit-sheet";
import { toast } from "@/components/ui/sonner";
import { excluirTransacao } from "@/app/app/transacoes/actions";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import {
  LABEL_ESSENCIALIDADE,
  type Categoria,
  type Essencialidade,
  type TransacaoComRelacoes,
} from "@/lib/types/db";
import type { ItemDeTransacao } from "@/lib/db/queries";

const ESSENCIALIDADE_VARIANT: Record<
  Essencialidade,
  "success" | "default" | "warning" | "tech"
> = {
  essencial: "success",
  necessario: "default",
  superfluo: "warning",
  investimento: "tech",
};

export function TransacoesView({
  transacoes,
  categorias,
  itensPorTx = {},
}: {
  transacoes: TransacaoComRelacoes[];
  categorias: Categoria[];
  itensPorTx?: Record<string, ItemDeTransacao[]>;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [excluindo, setExcluindo] = useState<TransacaoComRelacoes | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    return transacoes.filter((t) => {
      if (tipo !== "todos" && t.tipo !== tipo) return false;
      if (categoria !== "todas" && t.categoria_id !== categoria) return false;
      if (busca && !t.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [transacoes, tipo, categoria, busca]);

  async function confirmarExclusao() {
    if (!excluindo) return;
    setLoading(true);
    const res = await excluirTransacao(excluindo.id);
    setLoading(false);
    setExcluindo(null);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    toast.success("Transação excluída");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar transações"
            className="pl-10"
          />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="despesa">Despesas</SelectItem>
            <SelectItem value="receita">Receitas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.icone ? `${c.icone}  ` : ""}
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={transacoes.length === 0 ? "Nenhuma transação ainda" : "Nada encontrado"}
          description={
            transacoes.length === 0
              ? "Use o botão “Nova transação” para registrar a primeira."
              : "Tente ajustar a busca ou os filtros."
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 px-5 py-1">
            {filtradas.map((tx) => {
              const itens = itensPorTx[tx.id] ?? [];
              const temItens = itens.length > 0;
              const aberto = expandido === tx.id;
              return (
                <div key={tx.id}>
                  <div className="group flex items-center gap-1">
                    {temItens ? (
                      <button
                        type="button"
                        onClick={() => setExpandido(aberto ? null : tx.id)}
                        aria-label={aberto ? "Recolher itens" : "Ver itens"}
                        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary"
                      >
                        <ChevronDown
                          className={cn("size-4 transition-transform", aberto && "rotate-180")}
                        />
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <TransacaoItem tx={tx} />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Ações"
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditando(tx.id)}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setExcluindo(tx)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {temItens && aberto && (
                    <ul className="mb-3 ml-6 space-y-1.5 border-l border-border/70 pl-4">
                      {itens.map((it) => (
                        <li key={it.id} className="flex items-center gap-2 text-caption">
                          <span className="min-w-0 flex-1 truncate">
                            {it.quantidade > 1 ? `${it.quantidade}× ` : ""}
                            {it.descricao}
                          </span>
                          {it.categoriaNome && (
                            <span className="hidden shrink-0 text-muted-foreground sm:inline">
                              {it.categoriaIcone ? `${it.categoriaIcone} ` : ""}
                              {it.categoriaNome}
                            </span>
                          )}
                          <Badge variant={ESSENCIALIDADE_VARIANT[it.essencialidade]} size="sm">
                            {LABEL_ESSENCIALIDADE[it.essencialidade]}
                          </Badge>
                          <span className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums">
                            {it.valorTotal != null ? formatBRL(it.valorTotal) : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Confirmação de exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir transação?</DialogTitle>
            <DialogDescription>
              “{excluindo?.descricao}” será removida. Esta ação fica registrada no
              histórico de auditoria.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={loading}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransacaoEditSheet id={editando} onClose={() => setEditando(null)} />
    </div>
  );
}
