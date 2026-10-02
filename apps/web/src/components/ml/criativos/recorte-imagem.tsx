"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crop, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recortarImagem } from "@/app/ml/(painel)/criativos/actions";
import { Button } from "@/components/ui/button";

/**
 * Crop do editor (spec §10): ponto focal + zoom com pré-visualização 2:3 em CSS.
 * O servidor refaz o mesmo enquadramento (renderizarRecorte) e grava nova versão.
 */
export function RecorteImagem({ creativeId, src, aoAplicar }: { creativeId: string; src: string; aoAplicar?: () => void }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pendente, iniciar] = useTransition();

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setAberto(true)}>
        <Crop /> Recortar
      </Button>
    );
  }

  const aplicar = () =>
    iniciar(async () => {
      const r = await recortarImagem(creativeId, { x: x / 100, y: y / 100, zoom });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      setAberto(false);
      aoAplicar?.();
      router.refresh();
    });

  const deslizador = (rotulo: string, valor: number, set: (n: number) => void, min: number, max: number, passo: number) => (
    <label className="block space-y-1">
      <span className="flex justify-between text-caption text-muted-foreground">
        {rotulo} <span className="tabular">{passo < 1 ? `${valor.toFixed(1)}×` : `${valor}%`}</span>
      </span>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[rgb(var(--tech))]" />
    </label>
  );

  return (
    <div className="space-y-2 rounded-xl border border-border/70 p-2">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Pré-visualização do recorte"
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }}
        />
      </div>
      {deslizador("Horizontal", x, setX, 0, 100, 1)}
      {deslizador("Vertical", y, setY, 0, 100, 1)}
      {deslizador("Zoom", zoom, setZoom, 1, 3, 0.1)}
      <div className="flex gap-2">
        <Button type="button" variant="tech" size="sm" className="flex-1" disabled={pendente} onClick={aplicar}>
          {pendente ? <Loader2 className="animate-spin" /> : <Crop />} Aplicar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">Gera uma nova versão 1000×1500; a anterior fica no histórico.</p>
    </div>
  );
}
