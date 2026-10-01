"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { executarDescobertaAgora } from "@/app/ml/actions";
import { adicionarProdutoManual } from "@/app/ml/(painel)/produtos/actions";
import { JobStatus } from "@/components/ml/job-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** "Executar descoberta agora" — pede confirmação só se já houver uma rodando. */
export function BotaoExecutarDescoberta({
  variant = "tech",
  aoIniciar,
}: {
  variant?: "tech" | "secondary";
  aoIniciar?: (jobId: string) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [jobId, setJobId] = useState<string | null>(null);

  function executar() {
    iniciar(async () => {
      let r = await executarDescobertaAgora(false);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      if ("jaAtiva" in r && r.jaAtiva) {
        const forcar = window.confirm("Já existe uma descoberta em execução. Iniciar outra mesmo assim?");
        if (!forcar) {
          setJobId(r.jobId);
          aoIniciar?.(r.jobId);
          return;
        }
        r = await executarDescobertaAgora(true);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
      }
      toast.success(r.mensagem);
      setJobId(r.jobId);
      aoIniciar?.(r.jobId);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant={variant} size="sm" onClick={executar} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Play />}
        Executar descoberta agora
      </Button>
      {jobId && <JobStatus jobId={jobId} />}
    </div>
  );
}

/** "Adicionar produto" por URL ou código MLB (origem manual). */
export function BotaoAdicionarProduto() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [entrada, setEntrada] = useState("");
  const [criado, setCriado] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar() {
    iniciar(async () => {
      const r = await adicionarProdutoManual(entrada.trim());
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      setCriado(r.productId);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setEntrada("");
          setCriado(null);
          setAberto(true);
        }}
      >
        <Plus /> Adicionar produto
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !pendente && setAberto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar produto</DialogTitle>
            <DialogDescription>
              Cole a URL do anúncio ou do produto no Mercado Livre (ou o código MLB). Ele entra como origem
              “manual” e é analisado em seguida.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (entrada.trim().length >= 3) enviar();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-body-sm font-medium">URL ou código</span>
              <Input
                value={entrada}
                onChange={(e) => {
                  setEntrada(e.target.value);
                  setCriado(null);
                }}
                placeholder="https://www.mercadolivre.com.br/… ou MLB1234567890"
                autoFocus
                disabled={pendente}
              />
            </label>
            {criado && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-body-sm">
                <span>Produto registrado.</span>
                <Link
                  href={`/ml/produtos/${criado}`}
                  className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setAberto(false)}
                >
                  Abrir produto <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
                Fechar
              </Button>
              <Button type="submit" variant="tech" disabled={pendente || entrada.trim().length < 3}>
                {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
