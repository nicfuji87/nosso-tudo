"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { formatBRL, formatDate } from "@/lib/format";
import {
  removerLancamentoDoEvento,
  renomearEvento,
  transacoesDoContexto,
  type ContextoDetalhe,
  type ContextoTransacao,
} from "./actions";

export interface EventoResumo {
  contextoId: string;
  nome: string;
  icone: string | null;
  tipo: string | null;
  total: number;
  nTransacoes: number;
}

export function EventosLista({ eventos }: { eventos: EventoResumo[] }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((ev) => (
          <Card key={ev.contextoId} interactive>
            <CardContent className="p-4">
              <button type="button" onClick={() => setSel(ev.contextoId)} className="block w-full text-left">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{ev.icone ?? "🗓️"}</span>
                  <p className="min-w-0 flex-1 truncate text-body-sm font-medium">{ev.nome}</p>
                </div>
                <p className="mt-3 text-body-lg font-semibold tabular-nums">{formatBRL(ev.total)}</p>
                <p className="text-caption text-muted-foreground">
                  {ev.nTransacoes} {ev.nTransacoes === 1 ? "lançamento" : "lançamentos"} · ver detalhes
                </p>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
      <EventoSheet contextoId={sel} onClose={() => setSel(null)} />
    </>
  );
}

function EventoSheet({ contextoId, onClose }: { contextoId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [det, setDet] = useState<ContextoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Edição do nome
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeInput, setNomeInput] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);

  // Remoção de lançamento (id em andamento)
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  useEffect(() => {
    if (!contextoId) return;
    setDet(null);
    setEditandoNome(false);
    setCarregando(true);
    let vivo = true;
    transacoesDoContexto(contextoId).then((d) => {
      if (!vivo) return;
      setDet(d);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [contextoId]);

  async function salvarNome() {
    if (!contextoId || !det) return;
    const nome = nomeInput.trim();
    if (!nome || nome === det.nome) {
      setEditandoNome(false);
      return;
    }
    setSalvandoNome(true);
    const r = await renomearEvento(contextoId, nome);
    setSalvandoNome(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setDet({ ...det, nome });
    setEditandoNome(false);
    router.refresh();
  }

  async function remover(t: ContextoTransacao) {
    if (!contextoId || !det) return;
    setRemovendoId(t.id);
    const r = await removerLancamentoDoEvento(contextoId, t.id);
    setRemovendoId(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setDet({
      ...det,
      transacoes: det.transacoes.filter((x) => x.id !== t.id),
      total: det.total - t.valor,
    });
    toast.success("Lançamento removido do evento");
    router.refresh();
  }

  return (
    <Sheet open={!!contextoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto">
        {carregando || !det ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <SheetHeader className="pr-8">
              {editandoNome ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nomeInput}
                    autoFocus
                    onChange={(e) => setNomeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarNome();
                      if (e.key === "Escape") setEditandoNome(false);
                    }}
                    className="h-9"
                  />
                  <Button size="icon" onClick={salvarNome} disabled={salvandoNome} aria-label="Salvar nome">
                    {salvandoNome ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditandoNome(false)}
                    disabled={salvandoNome}
                    aria-label="Cancelar"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <SheetTitle>{det.nome}</SheetTitle>
                  <button
                    type="button"
                    onClick={() => {
                      setNomeInput(det.nome);
                      setEditandoNome(true);
                    }}
                    aria-label="Renomear evento"
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )}
              <p className="text-body-sm text-muted-foreground">
                {det.transacoes.length} {det.transacoes.length === 1 ? "lançamento" : "lançamentos"} ·{" "}
                <span className="font-medium text-foreground tabular-nums">{formatBRL(det.total)}</span>
              </p>
            </SheetHeader>
            {det.transacoes.length === 0 ? (
              <p className="rounded-2xl border border-border px-4 py-6 text-center text-body-sm text-muted-foreground">
                Nenhum lançamento neste evento.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-2xl border border-border">
                {det.transacoes.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium">{t.descricao}</p>
                      <p className="text-caption text-muted-foreground">
                        {t.categoriaNome ? `${t.categoriaIcone ? `${t.categoriaIcone} ` : ""}${t.categoriaNome} · ` : ""}
                        {formatDate(t.data)}
                      </p>
                    </div>
                    <span className="shrink-0 text-body-sm font-medium tabular-nums">{formatBRL(t.valor)}</span>
                    <button
                      type="button"
                      onClick={() => remover(t)}
                      disabled={removendoId === t.id}
                      aria-label="Tirar do evento"
                      title="Tirar do evento"
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    >
                      {removendoId === t.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
