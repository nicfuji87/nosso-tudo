"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Search, Trash2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "@/components/ui/sonner";
import { excluirTransacao } from "@/app/app/transacoes/actions";
import type { Categoria, TransacaoComRelacoes } from "@/lib/types/db";

export function TransacoesView({
  transacoes,
  categorias,
}: {
  transacoes: TransacaoComRelacoes[];
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [excluindo, setExcluindo] = useState<TransacaoComRelacoes | null>(null);
  const [loading, setLoading] = useState(false);

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
            {filtradas.map((tx) => (
              <div key={tx.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <TransacaoItem tx={tx} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-full p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary focus-visible:opacity-100 group-hover:opacity-100">
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem destructive onClick={() => setExcluindo(tx)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
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
    </div>
  );
}
