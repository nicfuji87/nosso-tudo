"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { excluirPreco, salvarPreco } from "@/app/app/admin/actions";
import type { PrecoModelo } from "@/lib/nia/admin";

const usd = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(v);

export function NiaPrecos({ precos, canEdit }: { precos: PrecoModelo[]; canEdit: boolean }) {
  const router = useRouter();
  const [provedor, setProvedor] = useState("openai");
  const [modelo, setModelo] = useState("");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [cache, setCache] = useState("");
  const [saving, startSave] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function editar(p: PrecoModelo) {
    setProvedor(p.provedor);
    setModelo(p.modelo);
    setEntrada(String(p.precoEntrada));
    setSaida(String(p.precoSaida));
    setCache(p.precoEntradaCache != null ? String(p.precoEntradaCache) : "");
  }

  function salvar() {
    startSave(async () => {
      const res = await salvarPreco({
        provedor,
        modelo,
        precoEntrada: entrada,
        precoSaida: saida,
        precoEntradaCache: cache,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success("Preço salvo");
      setModelo("");
      setEntrada("");
      setSaida("");
      setCache("");
      router.refresh();
    });
  }

  async function remover(p: PrecoModelo) {
    setBusy(`${p.provedor}/${p.modelo}`);
    const res = await excluirPreco(p.provedor, p.modelo);
    setBusy(null);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preços por modelo</CardTitle>
        <CardDescription>
          USD por 1M tokens. O custo do relatório usa estes valores; cadastre modelos novos (ex.:
          GPT-5.5) aqui. O preço de cache é opcional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-caption text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Modelo</th>
                <th className="px-3 py-2 text-right font-medium">Entrada</th>
                <th className="px-3 py-2 text-right font-medium">Saída</th>
                <th className="px-3 py-2 text-right font-medium">Cache</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {precos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum preço cadastrado.
                  </td>
                </tr>
              ) : (
                precos.map((p) => (
                  <tr key={`${p.provedor}/${p.modelo}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => canEdit && editar(p)}
                        className="text-left hover:underline disabled:no-underline"
                        disabled={!canEdit}
                      >
                        <span className="font-mono">{p.modelo}</span>
                        <span className="ml-2 text-caption text-muted-foreground">{p.provedor}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{usd(p.precoEntrada)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{usd(p.precoSaida)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {usd(p.precoEntradaCache)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => remover(p)}
                          aria-label="Remover"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={busy === `${p.provedor}/${p.modelo}`}
                        >
                          {busy === `${p.provedor}/${p.modelo}` ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-caption uppercase tracking-wide text-muted-foreground">
              Adicionar / editar modelo
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-provedor">Provedor</Label>
                <Input id="pr-provedor" value={provedor} onChange={(e) => setProvedor(e.target.value)} placeholder="openai" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-modelo">Modelo</Label>
                <Input id="pr-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="gpt-5.5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-entrada">Entrada (USD/1M)</Label>
                <Input id="pr-entrada" type="number" step="0.0001" min="0" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="5.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-saida">Saída (USD/1M)</Label>
                <Input id="pr-saida" type="number" step="0.0001" min="0" value={saida} onChange={(e) => setSaida(e.target.value)} placeholder="30.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-cache">Cache de entrada (opcional)</Label>
                <Input id="pr-cache" type="number" step="0.0001" min="0" value={cache} onChange={(e) => setCache(e.target.value)} placeholder="0.50" />
              </div>
            </div>
            <Button onClick={salvar} disabled={saving || !modelo || !entrada || !saida}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Salvar preço
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
