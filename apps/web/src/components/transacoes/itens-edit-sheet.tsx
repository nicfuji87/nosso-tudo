"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "./money-input";
import { CategoriaPicker } from "./categoria-picker";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import {
  carregarItensTransacao,
  salvarItensTransacao,
  type ItemEditavel,
} from "@/app/app/transacoes/actions";
import { ESSENCIALIDADES, LABEL_ESSENCIALIDADE, type Categoria } from "@/lib/types/db";

type Linha = ItemEditavel & { remover?: boolean };

export function ItensEditSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<Linha[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setCarregando(true);
    (async () => {
      const supabase = createClient();
      const [its, c] = await Promise.all([
        carregarItensTransacao(id),
        supabase.from("categorias").select("*").eq("ativa", true).order("ordem"),
      ]);
      if (!vivo) return;
      setItens(its);
      setCategorias((c.data as Categoria[] | null) ?? []);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [id]);

  function patch(i: number, p: Partial<Linha>) {
    setItens((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));
  }

  const ativos = itens.filter((i) => !i.remover);
  const total = ativos.reduce((s, it) => s + (it.valorTotal ?? 0), 0);

  async function salvar() {
    if (!id) return;
    setSalvando(true);
    const res = await salvarItensTransacao(
      id,
      itens.map((it) => ({
        id: it.id,
        nome: it.nome,
        quantidade: it.quantidade,
        valorTotal: it.valorTotal,
        categoriaId: it.categoriaId || undefined,
        essencialidade: it.essencialidade,
        remover: it.remover,
      })),
    );
    setSalvando(false);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    toast.success("Itens atualizados");
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col">
        <SheetHeader className="pr-8">
          <SheetTitle>Editar itens</SheetTitle>
        </SheetHeader>

        {carregando ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="-mx-1 mt-3 flex-1 space-y-3 overflow-y-auto px-1">
              {itens.length === 0 && (
                <p className="py-10 text-center text-body-sm text-muted-foreground">
                  Esta transação não tem itens.
                </p>
              )}
              {itens.map((it, i) =>
                it.remover ? (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-body-sm text-muted-foreground"
                  >
                    <span className="truncate line-through">{it.nome}</span>
                    <button
                      type="button"
                      onClick={() => patch(i, { remover: false })}
                      className="shrink-0 text-caption font-medium text-accent"
                    >
                      desfazer
                    </button>
                  </div>
                ) : (
                  <div key={it.id} className="space-y-2 rounded-2xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={it.nome}
                        onChange={(e) => patch(i, { nome: e.target.value })}
                        placeholder="Item"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => patch(i, { remover: true })}
                        aria-label="Remover item"
                        className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-caption text-muted-foreground">Qtd</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.001"
                          value={it.quantidade}
                          onChange={(e) => patch(i, { quantidade: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-caption text-muted-foreground">Valor</Label>
                        <MoneyInput value={it.valorTotal ?? undefined} onChange={(v) => patch(i, { valorTotal: v ?? null })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-caption text-muted-foreground">Categoria</Label>
                      <CategoriaPicker
                        categorias={categorias}
                        value={it.categoriaId || undefined}
                        onChange={(cid) => patch(i, { categoriaId: cid })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-caption text-muted-foreground">Essencialidade</Label>
                      <Select
                        value={it.essencialidade}
                        onValueChange={(v) => patch(i, { essencialidade: v as ItemEditavel["essencialidade"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESSENCIALIDADES.map((e) => (
                            <SelectItem key={e} value={e}>
                              {LABEL_ESSENCIALIDADE[e]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-body-sm text-muted-foreground">
                Total · <span className="font-medium text-foreground tabular-nums">{formatBRL(total)}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={salvando}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={salvando || ativos.length === 0}>
                  {salvando && <Loader2 className="size-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
