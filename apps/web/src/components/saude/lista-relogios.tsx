"use client";

import { useTransition } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dispositivo } from "@/lib/saude/dados";
import { desvincularRelogio } from "@/app/app/saude/actions";

const quando = (iso: string | null) => {
  if (!iso) return "ainda não enviou";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "enviou agora";
  if (min < 60) return `enviou há ${min} min`;
  if (min < 1440) return `enviou há ${Math.round(min / 60)} h`;
  return `enviou há ${Math.round(min / 1440)} d`;
};

export function ListaRelogios({ dispositivos }: { dispositivos: Dispositivo[] }) {
  const [pendente, iniciar] = useTransition();
  return (
    <ul className="divide-y divide-border/70">
      {dispositivos.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary">
            <Watch className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium">{d.nome}</p>
            <p className="text-caption text-muted-foreground">
              {d.modelo ? `${d.modelo} · ` : ""}
              {quando(d.ultimoEnvioEm)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() => {
              if (!confirm(`Desconectar "${d.nome}"? Ele para de enviar dados; o histórico continua aqui.`)) return;
              iniciar(async () => {
                const r = await desvincularRelogio(d.id);
                if (r.error) toast.error(r.error);
                else toast.success("Relógio desconectado.");
              });
            }}
          >
            Desconectar
          </Button>
        </li>
      ))}
    </ul>
  );
}
