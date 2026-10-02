"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, CheckCircle2, ImageOff, Loader2, Plus, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import { adicionarVariante, marcarProblemaFidelidade, revisarFidelidade, trocarReferencia } from "@/app/ml/(painel)/criativos/actions-v2";
import { midiasProduto, type MidiaReferencia } from "@/app/ml/(painel)/criativos/consultas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo, Checkbox, NativeSelect, Textarea } from "@/components/ml/campos";
import { ITENS_FIDELIDADE } from "@/lib/ml/conteudo/ia-v2";
import { MODOS_FIDELIDADE, TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { cn } from "@/lib/utils";
import type { FalhaAprovacao } from "./aprovar-lote";
import { FidelidadeBadge, labelModoFidelidade, labelTipoVisual } from "./detalhes-v2";
import { METODOS_IMAGEM_V2, ordenarReferencias, type CriativoView, type DialogoV2, type PresetOpcao } from "./rotulos";

export type { DialogoV2 };

const PAPEL_LABEL: Record<string, string> = {
  primary_reference: "Principal",
  complementary: "Complementar",
  do_not_use: "Não usar",
  consult_only: "Só consulta",
};

/** Imagens do anúncio do produto, carregadas sob demanda quando o diálogo abre. */
function useMidias(productId: string, ativo: boolean) {
  const [midias, setMidias] = useState<MidiaReferencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    setErro(null);
    void midiasProduto(productId).then((r) => {
      if (!vivo) return;
      if (r.ok) setMidias(r.midias);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [productId, ativo]);
  return { midias, erro };
}

/** Referências da variante na ordem de `source_media_ids` (principal primeiro); senão as do produto. */
export function referenciasDaVariante(c: Pick<CriativoView, "source_media_ids">, midias: MidiaReferencia[]): MidiaReferencia[] {
  return ordenarReferencias(c.source_media_ids, midias);
}

function ImagemVariante({ c, className }: { c: CriativoView; className?: string }) {
  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-secondary/50", className)}>
      {c.asset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.asset.public_url} alt={c.alt_text ?? "Imagem da variante"} loading="lazy" className="absolute inset-0 size-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-caption text-muted-foreground">
          <ImageOff className="size-6" aria-hidden /> Sem imagem ainda
        </div>
      )}
    </div>
  );
}

function NotasIA({ c }: { c: CriativoView }) {
  const ia = c.fidelity_ia;
  const humano = c.fidelity_humano;
  const falhasIa = ia ? ITENS_FIDELIDADE.filter((i) => ia.itens[i.chave] === false) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FidelidadeBadge status={c.fidelity_status} score={c.fidelity_score} />
        <span className="text-caption text-muted-foreground">{labelModoFidelidade(c.fidelity_mode)}</span>
      </div>
      {ia ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
          <p className="flex items-center justify-between gap-2 text-body-sm font-medium">
            Análise da IA
            {ia.score != null && <span className="text-caption text-muted-foreground tabular">score {Math.round(ia.score)}/100</span>}
          </p>
          {ia.resumo && <p className="text-body-sm">{ia.resumo}</p>}
          {(ia.problemas.length > 0 || falhasIa.length > 0) && (
            <ul className="space-y-1 text-caption text-warning">
              {falhasIa.map((i) => (
                <li key={i.chave} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {i.label}
                </li>
              ))}
              {ia.problemas.map((p) => (
                <li key={p} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">
          {c.fidelity_status === "not_required"
            ? "O produto real foi preservado na composição — revisão de fidelidade não é obrigatória."
            : "Sem análise de IA para esta variante."}
        </p>
      )}
      {humano && (
        <p className="rounded-xl border border-border/70 px-3 py-2 text-caption text-muted-foreground">
          <span className="font-medium text-foreground">Revisão humana:</span>{" "}
          {Object.values(humano.checklist).every(Boolean) && Object.keys(humano.checklist).length ? "checklist completo" : "problema registrado"}
          {humano.nota ? ` — “${humano.nota}”` : ""}
        </p>
      )}
    </div>
  );
}

/** "Ver referência lado a lado": fotos do anúncio × imagem da variante + notas de fidelidade. */
export function LadoALadoDialog({
  c,
  aberto,
  aoMudar,
  aoRevisar,
}: {
  c: CriativoView;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoRevisar?: () => void;
}) {
  const { midias, erro } = useMidias(c.product_id, aberto);
  const refs = useMemo(() => (midias ? referenciasDaVariante(c, midias) : []), [midias, c]);
  const [indice, setIndice] = useState(0);
  const ref = refs[indice] ?? refs[0] ?? null;
  const fallback = !midias || refs.length ? null : c.reference_image_url ?? c.produto?.thumbnail ?? null;

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Referência × variante</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {labelTipoVisual(c.visual_type)}
            {c.cena ? ` · ${c.cena}` : ""} · {c.produto?.title ?? "Produto"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-overline uppercase text-muted-foreground">Foto do anúncio{refs.length > 1 ? ` (${indice + 1}/${refs.length})` : ""}</p>
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-card">
              {!midias && !erro ? (
                <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-muted-foreground" aria-label="Carregando" />
              ) : ref || fallback ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ref?.public_url ?? fallback!} alt="Foto de referência do produto" className="absolute inset-0 size-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-caption text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden /> {erro ?? "Nenhuma imagem do anúncio importada."}
                </div>
              )}
            </div>
            {refs.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {refs.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setIndice(i)}
                      aria-label={`Referência ${i + 1}`}
                      aria-pressed={i === indice}
                      className={cn("relative block size-14 overflow-hidden rounded-lg border bg-card", i === indice ? "border-tech ring-2 ring-tech/40" : "border-border/70")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.public_url} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-overline uppercase text-muted-foreground">Variante</p>
            <ImagemVariante c={c} />
          </div>
        </div>
        <NotasIA c={c} />
        {aoRevisar && (
          <DialogFooter>
            <Button type="button" variant="tech" onClick={aoRevisar}>
              <BadgeCheck /> Revisar fidelidade
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Checklist §5.2: todos marcados ⇒ fidelidade confirmada; senão registra problema. */
export function RevisarFidelidadeDialog({ c, aberto, aoMudar }: { c: CriativoView; aberto: boolean; aoMudar: (v: boolean) => void }) {
  const router = useRouter();
  const { midias } = useMidias(c.product_id, aberto);
  const principal = midias ? referenciasDaVariante(c, midias)[0] ?? null : null;
  const [respostas, setRespostas] = useState<Record<string, boolean>>(() => Object.fromEntries(ITENS_FIDELIDADE.map((i) => [i.chave, c.fidelity_humano?.checklist[i.chave] ?? false])));
  const [nota, setNota] = useState(c.fidelity_humano?.nota ?? "");
  const [pendente, iniciar] = useTransition();
  const todos = ITENS_FIDELIDADE.every((i) => respostas[i.chave]);

  function enviar() {
    iniciar(async () => {
      const r = await revisarFidelidade(c.id, respostas, nota.trim() || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.status === "human_ok") toast.success(r.mensagem);
      else toast.warning(r.mensagem);
      aoMudar(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar fidelidade do produto</DialogTitle>
          <DialogDescription>Compare com a foto do anúncio. Marque só o que está correto na imagem da variante.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-card">
              {principal || c.produto?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={principal?.public_url ?? c.produto!.thumbnail!} alt="Foto do anúncio" className="absolute inset-0 size-full object-contain" />
              ) : (
                <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <ImagemVariante c={c} />
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <fieldset className="space-y-2" disabled={pendente}>
              <legend className="mb-1 flex w-full items-center justify-between gap-2 text-body-sm font-medium">
                Checklist
                <button
                  type="button"
                  className="text-caption font-normal text-tech hover:underline"
                  onClick={() => setRespostas(Object.fromEntries(ITENS_FIDELIDADE.map((i) => [i.chave, !todos])))}
                >
                  {todos ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </legend>
              {ITENS_FIDELIDADE.map((i) => {
                const ia = c.fidelity_ia?.itens[i.chave];
                return (
                  <label key={i.chave} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 px-3 py-2 text-body-sm hover:bg-secondary/40">
                    <Checkbox
                      className="mt-0.5"
                      checked={respostas[i.chave] ?? false}
                      onChange={(e) => setRespostas((r) => ({ ...r, [i.chave]: e.target.checked }))}
                    />
                    <span className="flex-1">{i.label}</span>
                    {ia === false && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-caption text-warning" title="A análise de IA apontou problema neste item">
                        <ShieldAlert className="size-3.5" aria-hidden /> IA
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
            <Campo label="Observação" dica={todos ? "Opcional." : "Descreva o problema — ajuda a refazer a cena."}>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: o kit tem 2 prateleiras, a imagem mostra 3." />
            </Campo>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="submit" variant={todos ? "tech" : "destructive"} disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : todos ? <CheckCircle2 /> : <ShieldAlert />}
                {todos ? "Confirmar fidelidade" : "Registrar problema"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Marcar problema de fidelidade": reprova a fidelidade com uma nota. */
export function ProblemaFidelidadeDialog({ c, aberto, aoMudar }: { c: CriativoView; aberto: boolean; aoMudar: (v: boolean) => void }) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [pendente, iniciar] = useTransition();
  const valido = nota.trim().length >= 2;

  function enviar() {
    if (!valido) return;
    iniciar(async () => {
      const r = await marcarProblemaFidelidade(c.id, nota.trim());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      aoMudar(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar problema de fidelidade</DialogTitle>
          <DialogDescription>A variante fica bloqueada para aprovação até ser refeita (regerar cena ou nova imagem).</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="O que está diferente do produto real? (mín. 2 caracteres)"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!valido || pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
              Registrar problema
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Trocar referência": escolhe as fotos do anúncio usadas na variante (a 1ª marcada é a principal). */
export function TrocarReferenciaDialog({ c, aberto, aoMudar }: { c: CriativoView; aberto: boolean; aoMudar: (v: boolean) => void }) {
  const router = useRouter();
  const { midias, erro } = useMidias(c.product_id, aberto);
  const [ordem, setOrdem] = useState<string[] | null>(null);
  const [pendente, iniciar] = useTransition();

  // Seleção inicial = referências atuais da variante (ou do produto).
  useEffect(() => {
    if (midias && ordem === null) setOrdem(referenciasDaVariante(c, midias).map((m) => m.id).slice(0, 8));
  }, [midias, ordem, c]);

  const selecao = ordem ?? [];
  const usaveis = (midias ?? []).filter((m) => m.media_role !== "do_not_use");

  function alternar(id: string) {
    setOrdem((o) => {
      const atual = o ?? [];
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (atual.length >= 8) {
        toast.error("Até 8 referências por variante.");
        return atual;
      }
      return [...atual, id];
    });
  }

  function tornarPrincipal(id: string) {
    setOrdem((o) => [id, ...(o ?? []).filter((x) => x !== id)]);
  }

  function enviar() {
    if (!selecao.length) return;
    iniciar(async () => {
      const r = await trocarReferencia(c.id, selecao);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      aoMudar(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trocar referência</DialogTitle>
          <DialogDescription>Escolha as fotos do anúncio que guiam esta variante. A primeira é a principal. A variante será refeita.</DialogDescription>
        </DialogHeader>
        {!midias && !erro ? (
          <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando imagens do anúncio…
          </p>
        ) : erro ? (
          <p className="text-body-sm text-destructive">{erro}</p>
        ) : !usaveis.length ? (
          <p className="rounded-xl bg-secondary px-3 py-3 text-body-sm text-muted-foreground">
            Nenhuma imagem do anúncio importada.{" "}
            <a href={`/ml/produtos/${c.product_id}#imagens`} className="font-medium text-tech hover:underline">
              Importar no produto
            </a>
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {usaveis.map((m) => {
              const pos = selecao.indexOf(m.id);
              const marcada = pos >= 0;
              return (
                <li key={m.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => alternar(m.id)}
                    aria-pressed={marcada}
                    className={cn(
                      "relative block aspect-square w-full overflow-hidden rounded-xl border bg-card transition-shadow",
                      marcada ? "border-tech ring-2 ring-tech/40" : "border-border/70 hover:border-tech/50",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.public_url} alt={`Imagem do anúncio (${PAPEL_LABEL[m.media_role] ?? m.media_role})`} loading="lazy" className="absolute inset-0 size-full object-contain" />
                    {marcada && (
                      <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-tech text-caption font-semibold text-tech-foreground tabular">
                        {pos + 1}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-overline text-muted-foreground">{PAPEL_LABEL[m.media_role] ?? m.media_role}</span>
                    {marcada && pos > 0 && (
                      <button type="button" onClick={() => tornarPrincipal(m.id)} className="inline-flex items-center gap-0.5 text-overline text-tech hover:underline">
                        <Star className="size-3" aria-hidden /> principal
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="button" variant="tech" disabled={!selecao.length || pendente} onClick={enviar}>
            {pendente && <Loader2 className="animate-spin" />}
            Usar {selecao.length} referência(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Abre o diálogo V2 pedido para um criativo (um por vez). */
export function DialogosV2({
  c,
  dialogo,
  aoFechar,
  aoTrocar,
  podeOperar = true,
}: {
  c: CriativoView;
  dialogo: DialogoV2;
  aoFechar: () => void;
  aoTrocar: (d: DialogoV2) => void;
  podeOperar?: boolean;
}) {
  const fechar = (v: boolean) => !v && aoFechar();
  const revisavel = podeOperar && Boolean(c.asset) && !["published", "archived"].includes(c.status);
  if (dialogo === "lado") return <LadoALadoDialog c={c} aberto aoMudar={fechar} aoRevisar={revisavel ? () => aoTrocar("fidelidade") : undefined} />;
  if (dialogo === "fidelidade") return <RevisarFidelidadeDialog c={c} aberto aoMudar={fechar} />;
  if (dialogo === "problema") return <ProblemaFidelidadeDialog c={c} aberto aoMudar={fechar} />;
  return <TrocarReferenciaDialog c={c} aberto aoMudar={fechar} />;
}

/** "Adicionar variante" a uma família (tipo visual, cena, fidelidade, método, headline). */
export function AdicionarVarianteDialog({
  familia,
  presets,
  openai,
  aberto,
  aoMudar,
}: {
  familia: { id: string; name: string };
  presets: PresetOpcao[];
  openai: boolean;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("lifestyle_no_text");
  const [cena, setCena] = useState<string>(presets[0]?.id ?? "");
  const [modo, setModo] = useState<string>("exact_composition");
  const [metodo, setMetodo] = useState<string>("auto");
  const [headline, setHeadline] = useState("");
  const [pendente, iniciar] = useTransition();

  const layout = tipo === "product_layout";
  const temTexto = tipo !== "lifestyle_no_text";
  const modoEfetivo = layout ? "original_layout" : modo;

  function enviar() {
    iniciar(async () => {
      const r = await adicionarVariante(familia.id, {
        visual_type: tipo,
        scene_preset_id: layout ? null : cena || null,
        fidelity_mode: modoEfetivo,
        metodo,
        headline: temTexto && headline.trim() ? headline.trim() : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      aoMudar(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar variante</DialogTitle>
          <DialogDescription className="line-clamp-1">Família “{familia.name}”</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <fieldset className="space-y-4" disabled={pendente}>
            <Campo label="Tipo visual">
              <NativeSelect className="w-full" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_VISUAIS.map((t) => (
                  <option key={t} value={t}>
                    {labelTipoVisual(t)}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            {!layout && (
              <Campo label="Cena" dica={presets.length ? undefined : "Nenhum preset de cena ativo — configure em Configurações › Criativos V2."}>
                <NativeSelect className="w-full" value={cena} onChange={(e) => setCena(e.target.value)}>
                  <option value="">Sem preset (cenário automático)</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Campo>
            )}
            <Campo
              label="Modo de fidelidade"
              dica={
                layout
                  ? "Foto + layout usa sempre a foto original do anúncio."
                  : modo === "reference_generation"
                    ? "Gera a cena por IA a partir da foto — exige revisão de fidelidade antes de aprovar."
                    : modo === "exact_composition"
                      ? "Preserva o produto real e cria só o cenário ao redor (recomendado)."
                      : undefined
              }
            >
              <NativeSelect className="w-full" value={modoEfetivo} disabled={layout} onChange={(e) => setModo(e.target.value)}>
                {MODOS_FIDELIDADE.map((m) => (
                  <option key={m} value={m}>
                    {labelModoFidelidade(m)}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            <Campo
              label="Método"
              dica={
                metodo === "auto" && modoEfetivo === "reference_generation" && !openai
                  ? "OpenAI não conectada: a variante vai para a fila manual do ChatGPT."
                  : metodo === "manual_chatgpt"
                    ? "Prompt e referências ficam prontos em Pendências › Imagens manuais."
                    : undefined
              }
            >
              <NativeSelect className="w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS_IMAGEM_V2.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            {temTexto && (
              <Campo label="Headline" dica="Até 60 caracteres. Vazio = usa a headline do plano da família.">
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={60} placeholder="Ex.: Organize o box sem furar a parede" />
              </Campo>
            )}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant="tech" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Resultado de uma aprovação em lote com falhas por item (V2: fidelidade/pacote). */
export function FalhasAprovacaoDialog({
  feitos,
  falhas,
  titulos,
  aberto,
  aoMudar,
  aoAbrir,
}: {
  feitos: number;
  falhas: FalhaAprovacao[];
  titulos: Map<string, string>;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoAbrir?: (id: string) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {feitos} aprovado(s) · {falhas.length} não aprovado(s)
          </DialogTitle>
          <DialogDescription>Resolva o motivo de cada item e aprove de novo.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {falhas.map((f) => (
            <li key={f.id} className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2">
              <p className="line-clamp-1 text-body-sm font-medium">{titulos.get(f.id) ?? "Criativo"}</p>
              <p className="text-caption text-warning">{f.mensagem}</p>
              {aoAbrir && (
                <button
                  type="button"
                  className="mt-1 text-caption font-medium text-tech hover:underline"
                  onClick={() => {
                    aoMudar(false);
                    aoAbrir(f.id);
                  }}
                >
                  Abrir criativo
                </button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => aoMudar(false)}>
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
