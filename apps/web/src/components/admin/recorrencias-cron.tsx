"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { formatDate } from "@/lib/format";
import type { RecorrenciasCronStatus } from "@/lib/admin/recorrencias";
import { alternarCronRecorrencias, executarRecorrenciasAgora } from "@/app/app/admin/actions";

export function RecorrenciasCron({
  status,
  canEdit,
}: {
  status: RecorrenciasCronStatus | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(status?.ativo ?? false);
  const [salvando, setSalvando] = useState(false);
  const [rodando, startRun] = useTransition();

  if (!status || !status.agendado) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-body-sm text-muted-foreground">
        O agendamento <code className="font-mono">gerar-recorrencias-diario</code> não foi encontrado.
        Aplique a migration <code className="font-mono">0017_recorrencias_gen</code>.
      </div>
    );
  }

  async function toggle(novo: boolean) {
    if (!canEdit) return;
    setAtivo(novo);
    setSalvando(true);
    const r = await alternarCronRecorrencias(novo);
    setSalvando(false);
    if (r.error) {
      setAtivo(!novo); // desfaz o otimista
      toast.error("Erro", { description: r.error });
      return;
    }
    toast.success(novo ? "Geração automática ligada" : "Geração automática desligada");
    router.refresh();
  }

  function rodarAgora() {
    startRun(async () => {
      const r = await executarRecorrenciasAgora();
      if (r.error) {
        toast.error("Erro", { description: r.error });
        return;
      }
      toast.success(
        r.geradas && r.geradas > 0
          ? `${r.geradas} lançamento(s) gerado(s).`
          : "Nada a gerar agora (nada vencido).",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Geração automática</h3>
            <Badge variant={ativo ? "success" : "warning"} size="sm">
              {ativo ? "Ligada" : "Pausada"}
            </Badge>
          </div>
          <p className="mt-1 text-caption text-muted-foreground">
            Quando ligada, o job roda diariamente e lança as contas fixas vencidas.
          </p>
        </div>
        <Switch checked={ativo} onCheckedChange={toggle} disabled={!canEdit || salvando} aria-label="Ligar/desligar" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4 text-body-sm">
        <Info label="Agendamento" value={`${status.schedule} (UTC)`} mono />
        <Info
          label="Última execução"
          value={status.ultimaExecucao ? formatDate(status.ultimaExecucao, "dd/MM/yyyy HH:mm") : "ainda não rodou"}
        />
        <Info label="Último status" value={status.ultimoStatus ?? "—"} />
        <Info label="Contas fixas ativas" value={String(status.recorrenciasAtivas)} mono />
        <Info label="Lançamentos já gerados" value={String(status.lancamentosGerados)} mono />
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button size="sm" variant="outline" onClick={rodarAgora} disabled={!canEdit || rodando}>
          {rodando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Rodar agora
        </Button>
        <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
        {!canEdit && (
          <span className="text-caption text-muted-foreground">
            Controles disponíveis apenas para admin de plataforma.
          </span>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : undefined}>{value}</dd>
    </div>
  );
}
