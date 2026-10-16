"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { atualizarDesempenho, sugerirProximos } from "@/app/ml/(painel)/desempenho/actions";
import { Button } from "@/components/ui/button";
import { Secao } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";

export function AtualizarDesempenho() {
  const [jobs, setJobs] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await atualizarDesempenho();
            if ("error" in r) toast.error(r.error);
            else {
              toast.success(r.mensagem);
              setJobs(r.jobIds);
            }
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar dados
      </Button>
      {jobs.map((j) => (
        <JobStatus key={j} jobId={j} compacto />
      ))}
    </div>
  );
}

interface Sugestao {
  tema: string;
  palavra_chave: string;
  board: string | null;
  motivo: string;
}

/** Sugestões de próximos Pins (IA) → um clique leva à busca no Criar Pin. */
export function ProximosPins({ dias, podeOperar }: { dias: number; podeOperar: boolean }) {
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Secao
      titulo="Próximos Pins"
      descricao="A IA lê o que funcionou e sugere o que publicar. Cada sugestão vira uma busca no Criar Pin."
      acoes={
        podeOperar ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await sugerirProximos(dias);
                if ("error" in r) toast.error(r.error);
                else setSugestoes(r.sugestoes);
              })
            }
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />} {sugestoes ? "Sugerir de novo" : "Sugerir"}
          </Button>
        ) : null
      }
    >
      {!sugestoes ? (
        <p className="text-body-sm text-muted-foreground">Clique em “Sugerir” para receber até 5 ideias baseadas nos seus números.</p>
      ) : sugestoes.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">Sem sugestões agora.</p>
      ) : (
        <ul className="space-y-3">
          {sugestoes.map((s) => (
            <li key={s.tema + s.palavra_chave} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-body-sm font-medium">{s.tema}</p>
                  <p className="text-caption text-muted-foreground">{s.motivo}</p>
                  {s.board && <p className="text-caption">Board: {s.board}</p>}
                </div>
                <Button asChild size="sm">
                  <Link href={`/ml/estudio?q=${encodeURIComponent(s.palavra_chave)}`}>
                    <Search /> {s.palavra_chave}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
