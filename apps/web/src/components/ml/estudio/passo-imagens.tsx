"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { excluirPrompt, gerarImagens, lerImagens, salvarPrompt } from "@/app/ml/(painel)/estudio/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import type { ProdutoEscolhido, PromptSalvo } from "./tipos";

const TOTAL = 3;

/** Passo 2 (foto + prompt) e passo 3 (3 imagens geradas → escolher uma). */
export function PassoImagens({
  produto,
  prompts,
  podeEditar,
  openaiConectada,
  aoEscolherImagem,
  escolhendoImagem,
}: {
  produto: ProdutoEscolhido;
  prompts: PromptSalvo[];
  podeEditar: boolean;
  openaiConectada: boolean;
  aoEscolherImagem: (creativeId: string, asset: { id: string; url: string }) => void;
  escolhendoImagem: string | null;
}) {
  const router = useRouter();
  const [foto, setFoto] = useState(produto.fotos[0] ?? null);
  const [promptId, setPromptId] = useState<string | null>(prompts[0]?.id ?? null);
  const [texto, setTexto] = useState(prompts[0]?.texto ?? "");
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvando, iniciarSalvar] = useTransition();
  const [gerando, iniciarGerar] = useTransition();
  const [creativeId, setCreativeId] = useState<string | null>(null);
  const [imagens, setImagens] = useState<{ id: string; url: string }[]>([]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [inicio, setInicio] = useState<number>(0);

  const atual = prompts.find((p) => p.id === promptId) ?? null;
  const alterado = atual ? atual.texto !== texto : texto.trim().length > 0;

  // Acompanha as 3 imagens (cada uma leva ~30–90 s; rodam em paralelo).
  useEffect(() => {
    if (!creativeId || imagens.length >= TOTAL) return;
    let vivo = true;
    const t = setInterval(async () => {
      const r = await lerImagens(creativeId);
      if (vivo && !("error" in r)) setImagens(r.imagens);
    }, 4000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [creativeId, imagens.length]);

  const gerar = () =>
    iniciarGerar(async () => {
      if (!foto) return;
      setImagens([]);
      setEscolhida(null);
      const r = await gerarImagens({ productId: produto.productId, imagemReferencia: foto, promptTexto: texto, promptId: alterado ? null : promptId });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setCreativeId(r.creativeId);
      setInicio(Date.now());
    });

  const salvar = (comoNovo: boolean) =>
    iniciarSalvar(async () => {
      const nome = comoNovo ? nomeNovo.trim() : atual?.nome ?? "";
      if (comoNovo && nome.length < 2) {
        toast.error("Dê um nome para o prompt.");
        return;
      }
      const r = await salvarPrompt({ id: comoNovo ? null : atual?.id ?? null, nome, texto });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      setPromptId(r.promptId);
      setNomeNovo("");
      router.refresh();
    });

  const demorando = creativeId && imagens.length < TOTAL && Date.now() - inicio > 4 * 60_000;

  return (
    <div className="space-y-6">
      {/* Foto de referência */}
      <section className="space-y-2">
        <h3 className="text-body font-semibold">1. Foto do produto</h3>
        <p className="text-caption text-muted-foreground">A IA usa esta foto como referência para manter o produto igual.</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {produto.fotos.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setFoto(u)}
              aria-pressed={foto === u}
              className={cn("relative overflow-hidden rounded-lg border-2 bg-white", foto === u ? "border-primary" : "border-border opacity-70 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN do ML */}
              <img src={u} alt="" className="aspect-square w-full object-contain" />
              {foto === u && (
                <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Prompt */}
      <section className="space-y-3">
        <h3 className="text-body font-semibold">2. Prompt</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Campo label="Prompt salvo" className="flex-1">
            <NativeSelect
              className="w-full"
              value={promptId ?? ""}
              onChange={(e) => {
                const p = prompts.find((x) => x.id === e.target.value) ?? null;
                setPromptId(p?.id ?? null);
                setTexto(p?.texto ?? "");
              }}
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.usos ? ` · usado ${p.usos}x` : ""}
                </option>
              ))}
              <option value="">Em branco</option>
            </NativeSelect>
          </Campo>
          {atual && podeEditar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => {
                if (!window.confirm(`Excluir o prompt “${atual.nome}”?`)) return;
                iniciarSalvar(async () => {
                  const r = await excluirPrompt(atual.id);
                  if ("error" in r) toast.error(r.error);
                  else {
                    toast.success(r.mensagem);
                    setPromptId(null);
                    router.refresh();
                  }
                });
              }}
            >
              <Trash2 /> Excluir
            </Button>
          )}
        </div>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} maxLength={4000} disabled={!podeEditar} aria-label="Texto do prompt" />
        <p className="text-caption text-muted-foreground">
          Use <code className="rounded bg-secondary px-1">{"{produto}"}</code> para inserir o nome do produto. Peça sempre para manter o produto igual à foto e não colocar texto na imagem.
        </p>
        {podeEditar && alterado && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
            <span className="text-caption text-muted-foreground sm:flex-1">Você alterou o prompt. Quer guardar para usar de novo?</span>
            {atual && (
              <Button type="button" size="sm" variant="secondary" disabled={salvando} onClick={() => salvar(false)}>
                <Save /> Atualizar “{atual.nome}”
              </Button>
            )}
            <div className="flex gap-2">
              <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome do novo prompt" className="h-9 sm:w-48" maxLength={80} />
              <Button type="button" size="sm" variant="secondary" disabled={salvando || nomeNovo.trim().length < 2} onClick={() => salvar(true)}>
                Salvar como novo
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" size="lg" onClick={gerar} disabled={!podeEditar || !openaiConectada || gerando || !foto || texto.trim().length < 10 || (!!creativeId && imagens.length < TOTAL)}>
          {gerando ? <Loader2 className="animate-spin" /> : <Wand2 />} {creativeId ? "Gerar outras 3 imagens" : "Gerar 3 imagens"}
        </Button>
        {!openaiConectada && <span className="text-caption text-warning">Conecte a OpenAI em Avançado › Integrações.</span>}
      </div>

      {/* Imagens geradas */}
      {creativeId && (
        <section className="space-y-3">
          <h3 className="text-body font-semibold">3. Escolha a imagem</h3>
          {imagens.length < TOTAL && (
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Gerando… {imagens.length} de {TOTAL} prontas (cerca de 1 minuto).
            </p>
          )}
          {demorando && <p className="text-caption text-warning">Está demorando mais que o normal. Se alguma imagem falhou, veja em Avançado › Logs & Erros.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: TOTAL }).map((_, i) => {
              const img = imagens[i];
              return img ? (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setEscolhida(img.id)}
                  aria-pressed={escolhida === img.id}
                  className={cn("relative overflow-hidden rounded-xl border-2 bg-card", escolhida === img.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Storage do app */}
                  <img src={img.url} alt={`Opção ${i + 1}`} className="aspect-[2/3] w-full object-cover" />
                  {escolhida === img.id && (
                    <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" />
                    </span>
                  )}
                </button>
              ) : (
                <div key={`v${i}`} className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            size="lg"
            disabled={!escolhida || !!escolhendoImagem}
            onClick={() => {
              const img = imagens.find((x) => x.id === escolhida);
              if (img && creativeId) aoEscolherImagem(creativeId, img);
            }}
          >
            {escolhendoImagem ? <Loader2 className="animate-spin" /> : <Check />} Usar esta imagem e escrever os textos
          </Button>
        </section>
      )}
    </div>
  );
}
