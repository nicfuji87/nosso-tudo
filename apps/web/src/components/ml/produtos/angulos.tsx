"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Copy, Lightbulb, Loader2, Plus, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import {
  adicionarAnguloManual,
  gerarAngulos,
  gerarCriativos,
  gerarVariacoes,
  marcarAngulo,
} from "@/app/ml/(painel)/produtos/actions";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, NativeSelect } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labelAngulo, TIPOS_ANGULO } from "@/lib/ml/conteudo/angulos";
import { cn } from "@/lib/utils";
import { ANGULO_ORIGEM_LABEL, ANGULO_STATUS_LABEL } from "./formato";

export interface AnguloItem {
  id: string;
  type: string;
  hook: string;
  audience: string | null;
  keyword: string | null;
  rationale: string | null;
  score: number | null;
  status: string;
  source: string;
}

const MODOS = [
  { value: "composition", label: "Composição (foto real + texto, sem IA)" },
  { value: "api", label: "IA (OpenAI)" },
  { value: "manual_chatgpt", label: "Manual via ChatGPT" },
  { value: "upload", label: "Upload próprio" },
] as const;

const TOM_STATUS: Record<string, "tech" | "success" | "outline" | "default"> = {
  suggested: "default",
  selected: "tech",
  discarded: "outline",
  used: "success",
};

/** Ângulos de conteúdo + geração de criativos (spec §8 e §22). */
export function Angulos({
  productId,
  angulos,
  openaiConectada,
  podeOperar,
}: {
  productId: string;
  angulos: AnguloItem[];
  openaiConectada: boolean;
  podeOperar: boolean;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<string[]>([]);
  const [mostrarDescartados, setMostrarDescartados] = useState(false);
  const [manualAberto, setManualAberto] = useState(false);
  const [modo, setModo] = useState<string>("composition");
  const [quantidade, setQuantidade] = useState("4");
  const [gerando, iniciar] = useTransition();

  const visiveis = angulos.filter((a) => mostrarDescartados || a.status !== "discarded");
  const descartados = angulos.filter((a) => a.status === "discarded").length;
  const selecionados = angulos.filter((a) => a.status === "selected").map((a) => a.id);

  const addJob = (id: string | undefined) => {
    if (id) setJobs((j) => (j.includes(id) ? j : [id, ...j].slice(0, 3)));
  };

  function criarCriativos() {
    iniciar(async () => {
      const r = await gerarCriativos(productId, selecionados, modo);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      if ("jobId" in r) addJob(r.jobId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {podeOperar && (
        <div className="flex flex-wrap items-end gap-2">
          <Campo label="Quantidade" className="w-28">
            <NativeSelect value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full">
              {[2, 3, 4, 5, 6, 8].map((q) => (
                <option key={q} value={q}>
                  {q} ângulos
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <AcaoBotao
            size="sm"
            variant="secondary"
            acao={() => gerarAngulos(productId, Number(quantidade))}
            aoConcluir={(r) => addJob(typeof r.jobId === "string" ? r.jobId : undefined)}
            semRefresh
          >
            <Lightbulb /> Gerar ângulos
          </AcaoBotao>
          <Button size="sm" variant="ghost" onClick={() => setManualAberto((v) => !v)} aria-expanded={manualAberto}>
            <Plus /> Adicionar ângulo manual
          </Button>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-1 rounded-xl border border-border/70 px-3 py-2">
          {jobs.map((j) => (
            <JobStatus key={j} jobId={j} />
          ))}
        </div>
      )}

      {manualAberto && podeOperar && <FormAnguloManual productId={productId} aoConcluir={() => setManualAberto(false)} />}

      {angulos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
          Nenhum ângulo ainda. {podeOperar ? "Gere sugestões ou adicione um manualmente." : ""}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visiveis.map((a) => (
            <li
              key={a.id}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-3",
                a.status === "selected" ? "border-tech bg-tech/5" : "border-border/70",
                a.status === "discarded" && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="px-2 py-0">
                  {labelAngulo(a.type)}
                </Badge>
                <Badge variant={TOM_STATUS[a.status] ?? "default"} className="px-2 py-0">
                  {a.status === "selected" ? <CheckCircle2 className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                  {ANGULO_STATUS_LABEL[a.status] ?? a.status}
                </Badge>
                <span className="text-caption text-muted-foreground">{ANGULO_ORIGEM_LABEL[a.source] ?? a.source}</span>
                {a.score != null && <span className="ml-auto text-caption font-medium tabular">{Math.round(a.score)} pts</span>}
              </div>
              <p className="text-body-sm font-semibold leading-snug">“{a.hook}”</p>
              <dl className="space-y-0.5 text-caption">
                {a.audience && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Público:</dt>
                    <dd>{a.audience}</dd>
                  </div>
                )}
                {a.keyword && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Palavra-chave:</dt>
                    <dd>{a.keyword}</dd>
                  </div>
                )}
              </dl>
              {a.rationale && <p className="text-caption text-muted-foreground">{a.rationale}</p>}
              {podeOperar && a.status !== "used" && (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {a.status === "suggested" && (
                    <AcaoBotao size="sm" variant="secondary" acao={() => marcarAngulo(a.id, "selected")}>
                      <CheckCircle2 /> Selecionar
                    </AcaoBotao>
                  )}
                  {a.status === "selected" && (
                    <AcaoBotao size="sm" variant="secondary" acao={() => marcarAngulo(a.id, "suggested")}>
                      <Circle /> Desmarcar
                    </AcaoBotao>
                  )}
                  {a.status === "discarded" ? (
                    <AcaoBotao size="sm" variant="ghost" acao={() => marcarAngulo(a.id, "suggested")}>
                      <Undo2 /> Restaurar
                    </AcaoBotao>
                  ) : (
                    <AcaoBotao size="sm" variant="ghost" acao={() => marcarAngulo(a.id, "discarded")}>
                      <X /> Descartar
                    </AcaoBotao>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {descartados > 0 && (
        <button
          type="button"
          onClick={() => setMostrarDescartados((v) => !v)}
          className="text-caption font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mostrarDescartados ? "Ocultar descartados" : `Mostrar descartados (${descartados})`}
        </button>
      )}

      {podeOperar && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/40 p-4">
          <div>
            <p className="text-body-sm font-semibold">Gerar criativos</p>
            <p className="text-caption text-muted-foreground">
              {selecionados.length
                ? `${selecionados.length} ângulo(s) selecionado(s) — um criativo 2:3 por ângulo.`
                : "Nenhum ângulo selecionado: a geração escolhe automaticamente."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Campo label="Modo de imagem" className="min-w-[16rem] flex-1">
              <NativeSelect value={modo} onChange={(e) => setModo(e.target.value)} className="w-full">
                {MODOS.map((m) => (
                  <option key={m.value} value={m.value} disabled={m.value === "api" && !openaiConectada}>
                    {m.label}
                    {m.value === "api" && !openaiConectada ? " — OpenAI não conectada" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            <Button size="sm" variant="tech" onClick={criarCriativos} disabled={gerando || (modo === "api" && !openaiConectada)}>
              {gerando ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {selecionados.length ? `Gerar ${selecionados.length} criativo(s)` : "Gerar criativos"}
            </Button>
            <AcaoBotao size="sm" variant="secondary" acao={() => gerarVariacoes(productId)}>
              <Copy /> Gerar 3 variações
            </AcaoBotao>
          </div>
          {!openaiConectada && (
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden /> Sem OpenAI conectada: use composição, ChatGPT manual ou upload.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FormAnguloManual({ productId, aoConcluir }: { productId: string; aoConcluir: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>(TIPOS_ANGULO[0].tipo);
  const [hook, setHook] = useState("");
  const [publico, setPublico] = useState("");
  const [keyword, setKeyword] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await adicionarAnguloManual(productId, {
            type: tipo,
            hook: hook.trim(),
            audience: publico.trim() || undefined,
            keyword: keyword.trim() || undefined,
          });
          if ("error" in r) {
            toast.error(r.error);
            return;
          }
          toast.success(r.mensagem);
          aoConcluir();
          router.refresh();
        });
      }}
    >
      <Campo label="Tipo">
        <NativeSelect value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full" disabled={pendente}>
          {TIPOS_ANGULO.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </Campo>
      <Campo label="Gancho" dica="3 a 120 caracteres — vira a headline da arte.">
        <Input value={hook} onChange={(e) => setHook(e.target.value)} minLength={3} maxLength={120} required disabled={pendente} className="h-10" />
      </Campo>
      <Campo label="Público (opcional)">
        <Input value={publico} onChange={(e) => setPublico(e.target.value)} maxLength={160} disabled={pendente} className="h-10" />
      </Campo>
      <Campo label="Palavra-chave (opcional)">
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={60} disabled={pendente} className="h-10" />
      </Campo>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={aoConcluir} disabled={pendente}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="tech" disabled={pendente || hook.trim().length < 3}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar ângulo
        </Button>
      </div>
    </form>
  );
}
