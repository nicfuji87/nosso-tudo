"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { EmptyState } from "@/components/patterns/empty-state";
import { salvarAnuncio, excluirAnuncio } from "@/app/app/admin/actions";
import type { Anuncio } from "@/lib/types/db";

interface FormState {
  id?: string;
  posicao: string;
  titulo: string;
  texto: string;
  url_destino: string;
  imagem_url: string;
  prioridade: string;
  ativo: boolean;
}

const EMPTY: FormState = {
  posicao: "home_topo",
  titulo: "",
  texto: "",
  url_destino: "",
  imagem_url: "",
  prioridade: "0",
  ativo: true,
};

export function AnunciosManager({ anuncios }: { anuncios: Anuncio[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, startSave] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function abrirNovo() {
    setForm({ ...EMPTY });
  }

  function abrirEdicao(a: Anuncio) {
    setForm({
      id: a.id,
      posicao: a.posicao,
      titulo: a.titulo,
      texto: a.texto ?? "",
      url_destino: a.url_destino ?? "",
      imagem_url: a.imagem_url ?? "",
      prioridade: a.prioridade.toString(),
      ativo: a.ativo,
    });
  }

  function salvar() {
    if (!form) return;
    startSave(async () => {
      const res = await salvarAnuncio({
        id: form.id,
        posicao: form.posicao,
        titulo: form.titulo,
        texto: form.texto || undefined,
        url_destino: form.url_destino || undefined,
        imagem_url: form.imagem_url || undefined,
        prioridade: form.prioridade,
        ativo: form.ativo,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success(form.id ? "Anúncio atualizado" : "Anúncio criado");
      setForm(null);
      router.refresh();
    });
  }

  async function excluir(id: string) {
    setDeletingId(id);
    const res = await excluirAnuncio(id);
    setDeletingId(null);
    if (res.error) {
      toast.error("Erro", { description: res.error });
      return;
    }
    toast.success("Anúncio excluído");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!form && (
          <Button onClick={abrirNovo}>
            <Plus className="size-4" /> Novo anúncio
          </Button>
        )}
      </div>

      {form && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {form.id ? "Editar anúncio" : "Novo anúncio"}
              <Button variant="ghost" size="icon-sm" onClick={() => setForm(null)} aria-label="Fechar">
                <X className="size-4" />
              </Button>
            </CardTitle>
            <CardDescription>Mantenha discreto e relevante.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="an-pos">Posição</Label>
                <Input
                  id="an-pos"
                  value={form.posicao}
                  onChange={(e) => setForm({ ...form, posicao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="an-prio">Prioridade</Label>
                <Input
                  id="an-prio"
                  inputMode="numeric"
                  value={form.prioridade}
                  onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-tit">Título</Label>
              <Input
                id="an-tit"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-txt">Texto</Label>
              <Input
                id="an-txt"
                value={form.texto}
                onChange={(e) => setForm({ ...form, texto: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="an-url">URL de destino</Label>
                <Input
                  id="an-url"
                  placeholder="https://..."
                  value={form.url_destino}
                  onChange={(e) => setForm({ ...form, url_destino: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="an-img">Imagem (URL)</Label>
                <Input
                  id="an-img"
                  placeholder="https://..."
                  value={form.imagem_url}
                  onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
              <span className="text-body-sm">Ativo</span>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {anuncios.length === 0 && !form ? (
        <EmptyState
          title="Nenhum anúncio"
          description="Crie anúncios discretos para exibir no plano Free."
        />
      ) : (
        <div className="space-y-2">
          {anuncios.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-body-sm font-medium">{a.titulo}</p>
                  <Badge variant={a.ativo ? "accent" : "default"} size="sm">
                    {a.ativo ? "ativo" : "inativo"}
                  </Badge>
                </div>
                <p className="truncate text-caption text-muted-foreground">
                  {a.posicao} · prioridade {a.prioridade}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => abrirEdicao(a)} aria-label="Editar">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  onClick={() => excluir(a.id)}
                  disabled={deletingId === a.id}
                  aria-label="Excluir"
                >
                  {deletingId === a.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
