"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MinusCircle, Stethoscope, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ml/status";
import { executarDiagnostico, resultadoDiagnostico } from "@/app/ml/(painel)/integracoes/actions";
import { cn } from "@/lib/utils";

interface ItemDiagnostico {
  chave: string;
  label: string;
  ok: boolean | null;
  detalhe: string | null;
}

const FINAIS = ["succeeded", "dead", "canceled"];

function normalizar(itens: unknown[]): ItemDiagnostico[] {
  return itens.flatMap((x, i) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    return [
      {
        chave: typeof o.chave === "string" ? o.chave : String(i),
        label: typeof o.label === "string" ? o.label : typeof o.chave === "string" ? o.chave : `Verificação ${i + 1}`,
        ok: typeof o.ok === "boolean" ? o.ok : null,
        detalhe: typeof o.detalhe === "string" ? o.detalhe : null,
      },
    ];
  });
}

/** "Teste completo" (spec §14): valida banco, storage, ML, Pinterest, OpenAI e Apify. */
export function Diagnostico({ podeExecutar }: { podeExecutar: boolean }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemDiagnostico[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, iniciar] = useTransition();

  useEffect(() => {
    if (!jobId) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await resultadoDiagnostico(jobId);
        if (!vivo) return;
        if ("error" in r && r.error) {
          setErro(r.error);
          return;
        }
        if (!r.ok) return;
        setStatus(r.status);
        setItens(normalizar(r.itens));
        setErro(r.erro);
        if (FINAIS.includes(r.status)) {
          if (r.status === "succeeded") toast.success("Diagnóstico concluído.");
          else toast.error("O diagnóstico não terminou. Veja os detalhes.");
          router.refresh();
          return;
        }
      } catch {
        if (!vivo) return;
      }
      timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  const rodando = Boolean(jobId) && !FINAIS.includes(status ?? "");
  const falhas = itens.filter((i) => i.ok === false).length;
  const oks = itens.filter((i) => i.ok === true).length;

  return (
    <section id="diagnostico" className="scroll-mt-20 rounded-xl border border-border/70 bg-card p-5 shadow-card" aria-labelledby="titulo-diagnostico">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tech/10 text-tech" aria-hidden>
            <Stethoscope className="size-5" />
          </span>
          <div>
            <h2 id="titulo-diagnostico" className="text-h4 font-semibold tracking-tight">
              Teste completo
            </h2>
            <p className="mt-0.5 max-w-2xl text-body-sm text-muted-foreground">
              Confere tudo de uma vez: banco, armazenamento de imagens, Mercado Livre (acesso, mais vendidos e tendências), Pinterest (acesso, boards e
              permissão de publicar) e, se configurados, OpenAI e Apify. Rode antes de ligar as automações.
            </p>
          </div>
        </div>
        {podeExecutar && (
          <Button
            variant="tech"
            disabled={iniciando || rodando}
            aria-busy={iniciando || rodando}
            onClick={() =>
              iniciar(async () => {
                const r = await executarDiagnostico();
                if ("error" in r && r.error) {
                  toast.error(r.error);
                  return;
                }
                if (r.ok && r.jobId) {
                  setItens([]);
                  setErro(null);
                  setStatus("queued");
                  setJobId(r.jobId);
                  toast.success(r.mensagem ?? "Diagnóstico iniciado.");
                }
              })
            }
          >
            {(iniciando || rodando) && <Loader2 className="animate-spin" />}
            {rodando ? "Executando…" : "Executar diagnóstico"}
          </Button>
        )}
      </div>

      {!podeExecutar && <p className="mt-4 text-caption text-muted-foreground">Somente operadores e administradores podem executar o diagnóstico.</p>}

      {jobId && (
        <div className="mt-5 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            {status && <StatusBadge tipo="job" status={status} />}
            {itens.length > 0 && (
              <span className="text-muted-foreground">
                {oks} ok · {falhas} com problema · {itens.length - oks - falhas} não configurado(s)
              </span>
            )}
          </div>
          {erro && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">{erro}</p>}
          {itens.length === 0 && rodando && <p className="text-body-sm text-muted-foreground">Aguardando as primeiras verificações…</p>}
          {itens.length > 0 && (
            <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
              {itens.map((it) => (
                <li key={it.chave} className="flex items-start gap-3 px-3 py-2.5">
                  {it.ok === true ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : it.ok === false ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">
                      {it.label}
                      <span className={cn("ml-2 text-caption font-normal", it.ok === true ? "text-success" : it.ok === false ? "text-destructive" : "text-muted-foreground")}>
                        {it.ok === true ? "OK" : it.ok === false ? "Falhou" : "Opcional / não configurado"}
                      </span>
                    </p>
                    {it.detalhe && <p className="break-words text-caption text-muted-foreground">{it.detalhe}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
