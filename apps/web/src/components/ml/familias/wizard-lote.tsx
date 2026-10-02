"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  ImageOff,
  Layers,
  Loader2,
  Minus,
  Plus,
  Rocket,
  ShieldCheck,
  Star,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { criarFamilia, estimarLote, type OpcoesLoteEntrada } from "@/app/ml/(painel)/criativos/actions-v2";
import { Campo, Checkbox, NativeSelect, Textarea } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MIX_PADRAO,
  MODOS_FIDELIDADE,
  TIPO_VISUAL_LABEL,
  TIPOS_VISUAIS,
  presetsDoProduto,
  type Mix,
  type ModoFidelidade,
  type PresetResumo,
  type TipoVisual,
} from "@/lib/ml/familias/plano";
import { cn } from "@/lib/utils";
import {
  ORIGEM_MIDIA_LABEL,
  usd,
  type AnguloOpcao,
  type BoardOpcaoV2,
  type DefaultsLote,
  type MidiaView,
  type PresetOpcao,
} from "./rotulos";

type Metodo = OpcoesLoteEntrada["metodo"];

interface Estimativa {
  chamadasImagem: number;
  chamadasTexto: number;
  chamadasVisao: number;
  jobs: number;
  custoUsd: number;
  variantes: number;
  temOpenAI: boolean;
  limiteUsd: number;
  semReferencia: boolean;
}

const PASSOS = ["Referências", "Estratégia", "Cenas", "Quantidade", "Pinterest", "Confirmação"] as const;
const LIMITE_AVISO = 8;
const MAX_POR_TIPO = 12;

const MODO_INFO: Record<ModoFidelidade, { titulo: string; dica: string; recomendado?: boolean }> = {
  exact_composition: {
    titulo: "Composição exata",
    dica: "Preserva o produto real: usa o recorte da foto do anúncio e cria só o cenário ao redor.",
    recomendado: true,
  },
  reference_generation: {
    titulo: "Geração por referência",
    dica: "A IA recria a cena a partir da foto. Requer OpenAI e sempre passa por checagem de fidelidade.",
  },
  original_layout: {
    titulo: "Foto original + layout",
    dica: "Usa a própria foto do anúncio num layout vertical com fundo e texto. Máxima fidelidade, sem custo.",
  },
};

const METODO_INFO: Record<Metodo, { titulo: string; dica: string }> = {
  auto: { titulo: "Automático", dica: "O app produz as imagens (usa a OpenAI quando conectada)." },
  manual_chatgpt: { titulo: "Manual via ChatGPT", dica: "O app prepara prompt e referências; você gera no ChatGPT e envia o resultado." },
  upload: { titulo: "Upload próprio", dica: "Você envia uma imagem pronta para cada variante." },
};

const TIPO_DICA: Record<TipoVisual, string> = {
  lifestyle_no_text: "Cena realista de uso, sem nenhum texto na imagem.",
  lifestyle_text: "Mesma cena com headline curta aplicada pelo app.",
  editorial: "Composição informativa (dica ou lista), sem cara de anúncio.",
  product_layout: "Foto real do anúncio em layout vertical — não usa cena.",
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Presets cujo ambiente/dica combina com o produto (mesma regra do backend, mais o nome do ambiente). */
function presetsQueCombinam(presets: PresetOpcao[], caminho: string[], titulo: string): Set<string> {
  const resumo: PresetResumo[] = presets.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    category_hint: p.category_hint,
    text_area: (p.text_area === "bottom" || p.text_area === "none" ? p.text_area : "top") as PresetResumo["text_area"],
  }));
  const porDica = presetsDoProduto(resumo, caminho, titulo);
  // presetsDoProduto devolve todos quando nenhum combina — aí tentamos pelo ambiente.
  if (porDica.length && porDica.length < presets.length) return new Set(porDica.map((p) => p.id));
  const texto = normalizar(`${titulo} ${caminho.join(" ")}`);
  const porAmbiente = presets.filter((p) => {
    const amb = normalizar(p.environment).trim();
    return amb.length > 2 && texto.includes(amb);
  });
  return new Set(porAmbiente.map((p) => p.id));
}

function totalMix(m: Mix): number {
  return m.lifestyle_no_text + m.lifestyle_text + m.editorial + m.product_layout;
}

function limitar(v: number): number {
  return Math.max(0, Math.min(MAX_POR_TIPO, Math.round(Number.isFinite(v) ? v : 0)));
}

export interface WizardLoteProps {
  productId: string;
  produtoTitulo: string;
  caminhoCategoria: string[];
  /** Mensagem quando o produto ainda não pode ter criativos (ex.: não aprovado). */
  bloqueio?: string | null;
  midias: MidiaView[];
  presets: PresetOpcao[];
  boards: BoardOpcaoV2[];
  angulos?: AnguloOpcao[];
  defaults: DefaultsLote;
  openaiConectada: boolean;
  /** Abre ao montar (deep-link `?lote=1`). */
  abrirInicial?: boolean;
  /** Controle externo (opcional). Sem ele, o componente desenha o próprio botão. */
  aberto?: boolean;
  aoMudar?: (v: boolean) => void;
  semGatilho?: boolean;
  rotuloGatilho?: string;
  varianteGatilho?: ButtonProps["variant"];
}

/** Wizard "Gerar lote" (V2 §11.6): referências → estratégia → cenas → quantidade → Pinterest → confirmação. */
export function WizardLote(props: WizardLoteProps) {
  const { abrirInicial, aberto: abertoExterno, aoMudar, semGatilho, rotuloGatilho, varianteGatilho } = props;
  const router = useRouter();
  const [abertoInterno, setAbertoInterno] = useState(false);
  const controlado = abertoExterno !== undefined;
  const aberto = controlado ? abertoExterno : abertoInterno;

  const mudar = useCallback(
    (v: boolean) => {
      if (!controlado) setAbertoInterno(v);
      aoMudar?.(v);
      if (!v && typeof window !== "undefined") {
        // fecha o deep-link para não reabrir no próximo refresh
        const url = new URL(window.location.href);
        if (url.searchParams.has("lote")) {
          url.searchParams.delete("lote");
          router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
        }
      }
    },
    [controlado, aoMudar, router],
  );

  useEffect(() => {
    if (abrirInicial) mudar(true);
    // só ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!semGatilho && !controlado && (
        <Button size="sm" variant={varianteGatilho ?? "tech"} onClick={() => mudar(true)}>
          <Layers /> {rotuloGatilho ?? "Gerar lote"}
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={mudar}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto">
          {aberto && <ConteudoWizard {...props} fechar={() => mudar(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConteudoWizard({
  productId,
  produtoTitulo,
  caminhoCategoria,
  bloqueio,
  midias,
  presets,
  boards,
  angulos = [],
  defaults,
  openaiConectada,
  fechar,
}: WizardLoteProps & { fechar: () => void }) {
  const router = useRouter();
  const prontas = useMemo(() => midias.filter((m) => m.status === "ready" && m.public_url), [midias]);
  const combinam = useMemo(() => presetsQueCombinam(presets, caminhoCategoria, produtoTitulo), [presets, caminhoCategoria, produtoTitulo]);
  const presetsOrdenados = useMemo(
    () => [...presets].sort((a, b) => Number(combinam.has(b.id)) - Number(combinam.has(a.id))),
    [presets, combinam],
  );

  // ---------- estado ----------
  const [passo, setPasso] = useState(0);
  const [visitado, setVisitado] = useState(0);
  const [principal, setPrincipal] = useState<string | null>(
    () => prontas.find((m) => m.media_role === "primary_reference")?.id ?? null,
  );
  const [complementares, setComplementares] = useState<string[]>(() =>
    prontas.filter((m) => m.media_role === "complementary").map((m) => m.id),
  );
  const [mix, setMix] = useState<Mix>(() => {
    const m = { ...MIX_PADRAO, ...defaults.mix };
    return totalMix(m) > 0 ? m : { ...MIX_PADRAO };
  });
  const [modo, setModo] = useState<ModoFidelidade>(() =>
    (MODOS_FIDELIDADE as readonly string[]).includes(defaults.modo) ? (defaults.modo as ModoFidelidade) : "exact_composition",
  );
  const [metodo, setMetodo] = useState<Metodo>("auto");
  const [presetIds, setPresetIds] = useState<string[]>(() => presets.filter((p) => combinam.has(p.id)).map((p) => p.id));
  const [boardId, setBoardId] = useState<string>(() => boards.find((b) => b.is_default)?.id ?? "");
  const [angleId, setAngleId] = useState("");
  const [nome, setNome] = useState("");
  const [hipotese, setHipotese] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [headlinesTxt, setHeadlinesTxt] = useState("");

  const [estimativa, setEstimativa] = useState<Estimativa | null>(null);
  const [erroEstimativa, setErroEstimativa] = useState<string | null>(null);
  const [estimando, setEstimando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false);
  const [resultado, setResultado] = useState<{ jobId: string | null; familyId: string | null; mensagem: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  // mantém a principal fora das complementares
  useEffect(() => {
    if (principal) setComplementares((c) => (c.includes(principal) ? c.filter((x) => x !== principal) : c));
  }, [principal]);

  const total = totalMix(mix);
  const precisaCena = mix.lifestyle_no_text + mix.lifestyle_text + mix.editorial > 0;
  const linhasHeadline = headlinesTxt
    .split("\n")
    .map((h) => h.trim())
    .filter(Boolean);
  const headlineLonga = linhasHeadline.some((h) => h.length > 60);

  const opcoes: OpcoesLoteEntrada = useMemo(
    () => ({
      mix,
      modo,
      metodo,
      presetIds: precisaCena ? presetIds : [],
      referenciaIds: principal ? [principal, ...complementares.filter((c) => c !== principal)].slice(0, 8) : null,
      boardId: boardId || null,
      angleId: angleId || null,
      nome: nome.trim() || null,
      hipotese: hipotese.trim() || null,
      objetivo: objetivo.trim() || null,
      headlines: linhasHeadline.length ? linhasHeadline.slice(0, 6) : null,
    }),
    // linhasHeadline deriva de headlinesTxt
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mix, modo, metodo, precisaCena, presetIds, principal, complementares, boardId, angleId, nome, hipotese, objetivo, headlinesTxt],
  );
  const chaveOpcoes = JSON.stringify(opcoes);

  // ---------- validação por passo ----------
  const erroPasso = (i: number): string | null => {
    switch (i) {
      case 0:
        if (!prontas.length) return "Nenhuma imagem pronta. Importe as imagens do anúncio antes de gerar o lote.";
        return principal ? null : "Escolha a referência principal.";
      case 1:
      case 3:
        if (total < 1) return "Escolha ao menos uma variante.";
        if (total > defaults.maxVariantes) return `Máximo de ${defaults.maxVariantes} variantes por família (Configurações › Criativos V2).`;
        return null;
      case 2:
        if (precisaCena && !presetIds.length) return presets.length ? "Escolha ao menos uma cena." : "Não há presets de cena ativos — cadastre em Configurações › Criativos V2.";
        return null;
      case 4:
        if (linhasHeadline.length > 6) return "No máximo 6 headlines.";
        if (headlineLonga) return "Cada headline pode ter até 60 caracteres.";
        if (nome.length > 80) return "Nome com até 80 caracteres.";
        if (hipotese.length > 300) return "Hipótese com até 300 caracteres.";
        if (objetivo.length > 160) return "Benefício com até 160 caracteres.";
        return null;
      default:
        return null;
    }
  };
  const erroAtual = erroPasso(passo);

  const irPara = (i: number) => {
    if (i < 0 || i >= PASSOS.length || resultado) return;
    // só avança se os passos anteriores estiverem válidos
    for (let k = 0; k < i; k++) {
      const e = erroPasso(k);
      if (e) {
        setPasso(k);
        toast.error(e);
        return;
      }
    }
    setPasso(i);
    setVisitado((v) => Math.max(v, i));
  };
  const avancar = () => {
    if (erroAtual) {
      toast.error(erroAtual);
      return;
    }
    if (passo < PASSOS.length - 1) irPara(passo + 1);
  };
  const voltar = () => {
    if (passo > 0) setPasso(passo - 1);
  };

  // ---------- estimativa ao entrar na confirmação ----------
  useEffect(() => {
    if (passo !== PASSOS.length - 1 || resultado) return;
    let vivo = true;
    setEstimando(true);
    setErroEstimativa(null);
    setErroCriar(null);
    setPrecisaConfirmar(false);
    estimarLote(productId, JSON.parse(chaveOpcoes) as OpcoesLoteEntrada)
      .then((r) => {
        if (!vivo) return;
        if ("error" in r) {
          setEstimativa(null);
          setErroEstimativa(r.error);
        } else {
          setEstimativa(r.estimativa);
        }
      })
      .catch(() => vivo && setErroEstimativa("Não foi possível estimar o lote."))
      .finally(() => vivo && setEstimando(false));
    return () => {
      vivo = false;
    };
  }, [passo, chaveOpcoes, productId, resultado]);

  const iniciarLote = (confirmarCusto: boolean) => {
    setErroCriar(null);
    iniciar(async () => {
      const r = await criarFamilia(productId, opcoes, confirmarCusto);
      if ("error" in r) {
        setErroCriar(r.error);
        setPrecisaConfirmar(/acima do limite/i.test(r.error));
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      setResultado({ jobId: r.jobId ?? null, familyId: r.familyId ?? null, mensagem: r.mensagem });
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!e.altKey || resultado) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      avancar();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      voltar();
    }
  };

  // ---------- sucesso ----------
  if (resultado) {
    return (
      <div className="space-y-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden /> Lote iniciado
          </DialogTitle>
          <DialogDescription>{resultado.mensagem}</DialogDescription>
        </DialogHeader>
        {resultado.jobId && (
          <div className="rounded-xl border border-border/70 bg-secondary/40 px-3 py-2.5">
            <JobStatus jobId={resultado.jobId} />
          </div>
        )}
        <p className="text-body-sm text-muted-foreground">
          As variantes aparecem em “Famílias de criativos” conforme ficam prontas. Você pode fechar esta janela — o lote continua na fila.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {resultado.familyId && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/ml/criativos?familia=${resultado.familyId}`}>Ver no Criativos</Link>
            </Button>
          )}
          <Button size="sm" variant="tech" onClick={fechar}>
            <Check /> Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" onKeyDown={onKeyDown}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Wand2 className="size-5 text-tech" aria-hidden /> Gerar lote de criativos
        </DialogTitle>
        <DialogDescription className="line-clamp-1">{produtoTitulo}</DialogDescription>
      </DialogHeader>

      {/* Stepper */}
      <nav aria-label="Etapas do lote" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex w-max min-w-full gap-1">
          {PASSOS.map((rotulo, i) => {
            const atual = i === passo;
            const feito = i < passo;
            const alcancavel = i <= visitado + 1 && i !== passo;
            return (
              <li key={rotulo} className="flex-1">
                <button
                  type="button"
                  onClick={() => irPara(i)}
                  disabled={!alcancavel && !atual}
                  aria-current={atual ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-caption transition-colors disabled:cursor-default",
                    atual
                      ? "border-tech bg-tech/10 font-semibold text-foreground"
                      : feito
                        ? "border-border/70 text-foreground hover:bg-secondary"
                        : "border-border/50 text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] tabular",
                      atual ? "bg-tech text-tech-foreground" : feito ? "bg-success/20 text-success" : "bg-secondary",
                    )}
                    aria-hidden
                  >
                    {feito ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">{rotulo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {bloqueio && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-body-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {bloqueio}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passo < PASSOS.length - 1) avancar();
        }}
        className="space-y-5"
      >
        {passo === 0 && (
          <PassoReferencias
            prontas={prontas}
            totalMidias={midias.length}
            principal={principal}
            complementares={complementares}
            setPrincipal={setPrincipal}
            setComplementares={setComplementares}
          />
        )}

        {passo === 1 && (
          <div className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-body-sm font-semibold">Tipos de criativo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TIPOS_VISUAIS.map((t) => {
                  const ativo = mix[t] > 0;
                  return (
                    <div
                      key={t}
                      className={cn("flex items-start gap-3 rounded-xl border p-3", ativo ? "border-tech/60 bg-tech/5" : "border-border/70")}
                    >
                      <Checkbox
                        id={`tipo-${t}`}
                        checked={ativo}
                        onChange={(e) => setMix((m) => ({ ...m, [t]: e.target.checked ? Math.max(1, defaults.mix[t] || 1) : 0 }))}
                        className="mt-0.5"
                      />
                      <label htmlFor={`tipo-${t}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-body-sm font-medium">{TIPO_VISUAL_LABEL[t]}</span>
                        <span className="block text-caption text-muted-foreground">{TIPO_DICA[t]}</span>
                      </label>
                      <Contador
                        valor={mix[t]}
                        aoMudar={(v) => setMix((m) => ({ ...m, [t]: v }))}
                        rotulo={`Quantidade de ${TIPO_VISUAL_LABEL[t]}`}
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-body-sm font-semibold">Fidelidade do produto</legend>
              <div className="grid gap-2">
                {MODOS_FIDELIDADE.map((m) => {
                  const info = MODO_INFO[m];
                  return (
                    <OpcaoRadio
                      key={m}
                      nome="modo"
                      valor={m}
                      marcado={modo === m}
                      aoMarcar={() => setModo(m)}
                      titulo={info.titulo}
                      dica={info.dica}
                      selo={info.recomendado ? <Badge variant="success" className="px-2 py-0">Recomendado</Badge> : undefined}
                    />
                  );
                })}
              </div>
              {modo === "reference_generation" && !openaiConectada && metodo === "auto" && (
                <p className="flex items-start gap-2 text-caption text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  OpenAI não está conectada: as variantes por referência ficam no modo manual via ChatGPT.
                </p>
              )}
              {mix.editorial > 0 && modo === "reference_generation" && (
                <p className="text-caption text-muted-foreground">Variantes editoriais usam composição exata (foto real) para manter a fidelidade.</p>
              )}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-body-sm font-semibold">Como produzir as imagens</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(METODO_INFO) as Metodo[]).map((m) => (
                  <OpcaoRadio
                    key={m}
                    nome="metodo"
                    valor={m}
                    marcado={metodo === m}
                    aoMarcar={() => setMetodo(m)}
                    titulo={METODO_INFO[m].titulo}
                    dica={METODO_INFO[m].dica}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-sm text-muted-foreground">
                {precisaCena
                  ? "Cada variante lifestyle/editorial usa uma cena diferente enquanto houver opções."
                  : "Foto + layout não usa cena — pode avançar."}
              </p>
              {presets.length > 0 && precisaCena && (
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPresetIds(presets.map((p) => p.id))}>
                    Todas
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPresetIds([])}>
                    Nenhuma
                  </Button>
                </div>
              )}
            </div>
            {presets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-body-sm text-muted-foreground">
                Nenhum preset de cena ativo.{" "}
                <Link href="/ml/configuracoes?secao=criativos_v2" className="text-tech underline-offset-4 hover:underline">
                  Cadastrar em Configurações
                </Link>
              </p>
            ) : (
              <ul className={cn("grid gap-2 sm:grid-cols-2", !precisaCena && "opacity-60")}>
                {presetsOrdenados.map((p) => {
                  const marcado = presetIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                          marcado ? "border-tech/60 bg-tech/5" : "border-border/70 hover:bg-secondary/50",
                        )}
                      >
                        <Checkbox
                          checked={marcado}
                          disabled={!precisaCena}
                          onChange={(e) =>
                            setPresetIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-body-sm font-medium">
                            {p.name}
                            {combinam.has(p.id) && (
                              <Badge variant="tech" className="px-2 py-0">
                                Combina
                              </Badge>
                            )}
                          </span>
                          <span className="block text-caption text-muted-foreground">
                            {[p.environment, p.palette, p.text_area === "none" ? "sem área de texto" : `texto no ${p.text_area === "bottom" ? "rodapé" : "topo"}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {passo === 3 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-h2 font-semibold tabular">{total}</span>
              <span className="text-body-sm text-muted-foreground">variante{total === 1 ? "" : "s"} nesta família</span>
            </div>
            {total > 0 && (
              <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                {TIPOS_VISUAIS.map((t, i) =>
                  mix[t] > 0 ? (
                    <span
                      key={t}
                      className={cn("h-full", ["bg-tech", "bg-tech/60", "bg-accent", "bg-muted-foreground/50"][i])}
                      style={{ width: `${(mix[t] / total) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
            )}
            <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
              {TIPOS_VISUAIS.map((t, i) => (
                <li key={t} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-body-sm">
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", ["bg-tech", "bg-tech/60", "bg-accent", "bg-muted-foreground/50"][i])}
                      aria-hidden
                    />
                    {TIPO_VISUAL_LABEL[t]}
                  </span>
                  <Contador valor={mix[t]} aoMudar={(v) => setMix((m) => ({ ...m, [t]: v }))} rotulo={`Quantidade de ${TIPO_VISUAL_LABEL[t]}`} />
                </li>
              ))}
            </ul>
            {total > LIMITE_AVISO && total <= defaults.maxVariantes && (
              <p className="flex items-start gap-2 text-body-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Lote grande: mais de {LIMITE_AVISO} variantes aumenta custo e revisão. Gerar não é publicar — as variantes entram na piscina de experimentos.
              </p>
            )}
            {precisaCena && presetIds.length > 0 && (
              <p className="text-caption text-muted-foreground">
                {presetIds.length} cena{presetIds.length === 1 ? "" : "s"} escolhida{presetIds.length === 1 ? "" : "s"} para{" "}
                {mix.lifestyle_no_text + mix.lifestyle_text + mix.editorial} variante(s) com cena
                {presetIds.length < mix.lifestyle_no_text + mix.lifestyle_text + mix.editorial ? " — algumas cenas vão se repetir." : "."}
              </p>
            )}
          </div>
        )}

        {passo === 4 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Board padrão" dica="Cada variante pode trocar de board depois.">
              <NativeSelect value={boardId} onChange={(e) => setBoardId(e.target.value)} className="w-full">
                <option value="">Usar o mapeamento de boards</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.is_default ? " (padrão)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
            {angulos.length > 0 ? (
              <Campo label="Ângulo (opcional)" dica="Orienta a hipótese e as headlines.">
                <NativeSelect value={angleId} onChange={(e) => setAngleId(e.target.value)} className="w-full">
                  <option value="">Sem ângulo específico</option>
                  {angulos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hook.slice(0, 70)}
                    </option>
                  ))}
                </NativeSelect>
              </Campo>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Campo label="Nome da família (opcional)" dica={`${nome.length}/80`}>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Organize o box sem reforma" className="h-10" />
            </Campo>
            <Campo label="Benefício / objetivo (opcional)" dica={`${objetivo.length}/160`}>
              <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} maxLength={160} placeholder="Ex.: organização sem furar a parede" className="h-10" />
            </Campo>
            <Campo label="Hipótese (opcional)" className="sm:col-span-2" dica="Em branco, a IA (ou a regra sem IA) sugere a partir dos ângulos.">
              <Textarea
                value={hipotese}
                onChange={(e) => setHipotese(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ex.: pessoas com banheiro pequeno respondem a “organizar sem reforma”."
              />
            </Campo>
            <Campo
              label="Headlines (opcional)"
              className="sm:col-span-2"
              dica={
                <span className={cn(headlineLonga || linhasHeadline.length > 6 ? "text-destructive" : undefined)}>
                  Uma por linha, até 60 caracteres e no máximo 6. Em branco, são geradas automaticamente. Títulos e descrições do Pinterest
                  são gerados para cada variante.
                </span>
              }
            >
              <Textarea
                value={headlinesTxt}
                onChange={(e) => setHeadlinesTxt(e.target.value)}
                rows={4}
                placeholder={"Ganhe espaço no banheiro sem reforma\nOrganize o box sem furar a parede"}
              />
            </Campo>
            {linhasHeadline.length > 0 && (
              <ul className="space-y-1 text-caption sm:col-span-2">
                {linhasHeadline.map((h, i) => (
                  <li key={i} className={cn("flex justify-between gap-3", h.length > 60 ? "text-destructive" : "text-muted-foreground")}>
                    <span className="truncate">{h}</span>
                    <span className="tabular">{h.length}/60</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-caption text-muted-foreground sm:col-span-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Disclosure comercial, tom de voz e regra de alt text vêm de{" "}
                <Link href="/ml/configuracoes?secao=pinterest_copy" className="text-tech underline-offset-4 hover:underline">
                  Configurações › Pinterest Copy
                </Link>
                .
              </span>
            </p>
          </div>
        )}

        {passo === 5 && (
          <PassoConfirmacao
            estimativa={estimativa}
            estimando={estimando}
            erroEstimativa={erroEstimativa}
            total={total}
            mix={mix}
            modo={modo}
            metodo={metodo}
            cenas={precisaCena ? presetIds.length : 0}
            boardNome={boards.find((b) => b.id === boardId)?.name ?? null}
            referencias={principal ? 1 + complementares.length : 0}
            erroCriar={erroCriar}
          />
        )}

        {erroAtual && passo < PASSOS.length - 1 && passo !== 4 && (
          <p className="text-caption text-muted-foreground" role="status">
            {erroAtual}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden text-caption text-muted-foreground sm:block">
            Etapa {passo + 1} de {PASSOS.length} · Alt+← / Alt+→ para navegar
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" size="sm" variant="ghost" onClick={passo === 0 ? fechar : voltar} disabled={enviando}>
              <ArrowLeft /> {passo === 0 ? "Cancelar" : "Voltar"}
            </Button>
            {passo < PASSOS.length - 1 ? (
              <Button type="submit" size="sm" variant="tech" disabled={!!erroAtual}>
                Avançar <ArrowRight />
              </Button>
            ) : precisaConfirmar ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => iniciarLote(true)} disabled={enviando || !!bloqueio}>
                {enviando ? <Loader2 className="animate-spin" /> : <Coins />} Confirmar custo e gerar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="tech"
                onClick={() => iniciarLote(false)}
                disabled={enviando || estimando || !!bloqueio || !!estimativa?.semReferencia}
              >
                {enviando ? <Loader2 className="animate-spin" /> : <Rocket />} Iniciar
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------
function PassoReferencias({
  prontas,
  totalMidias,
  principal,
  complementares,
  setPrincipal,
  setComplementares,
}: {
  prontas: MidiaView[];
  totalMidias: number;
  principal: string | null;
  complementares: string[];
  setPrincipal: (id: string) => void;
  setComplementares: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  if (!prontas.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-body-sm font-medium">Nenhuma imagem pronta para referência</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          {totalMidias
            ? "As imagens do anúncio ainda estão sendo importadas ou falharam. Feche e acompanhe em “Imagens do anúncio”."
            : "Feche esta janela e use “Importar ou atualizar imagens” na seção Imagens do anúncio."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-muted-foreground">
        A <strong className="font-medium text-foreground">principal</strong> define a identidade do produto; as{" "}
        <strong className="font-medium text-foreground">complementares</strong> ajudam com ângulos e detalhes. Imagens com selos ou marcas
        servem só como referência.
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {prontas.map((m, i) => {
          const ehPrincipal = principal === m.id;
          const ehComp = complementares.includes(m.id);
          return (
            <li
              key={m.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-card",
                ehPrincipal ? "border-tech ring-2 ring-tech/40" : ehComp ? "border-tech/50" : "border-border/70",
              )}
            >
              <div className="relative aspect-square bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Storage/Mercado Livre */}
                <img src={m.public_url ?? m.url ?? ""} alt={`Imagem ${i + 1} do anúncio`} loading="lazy" className="size-full object-contain p-1.5" />
                {ehPrincipal && (
                  <Badge variant="tech" className="absolute left-1.5 top-1.5 bg-tech px-2 py-0 text-tech-foreground">
                    <Star className="size-3" aria-hidden /> Principal
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5 p-2">
                <label className="flex cursor-pointer items-center gap-2 text-caption">
                  <input
                    type="radio"
                    name="ref-principal"
                    checked={ehPrincipal}
                    onChange={() => setPrincipal(m.id)}
                    className="size-3.5 accent-[rgb(var(--tech))]"
                  />
                  Principal
                </label>
                <label className={cn("flex items-center gap-2 text-caption", ehPrincipal ? "opacity-50" : "cursor-pointer")}>
                  <Checkbox
                    checked={ehComp}
                    disabled={ehPrincipal}
                    onChange={(e) => setComplementares((c) => (e.target.checked ? [...c, m.id] : c.filter((x) => x !== m.id)))}
                    className="size-3.5"
                  />
                  Complementar
                </label>
                <p className="truncate text-[0.7rem] text-muted-foreground">
                  {ORIGEM_MIDIA_LABEL[m.source_type] ?? m.source_type}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                  {m.cutout_status === "ready" ? " · recorte" : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {complementares.length > 7 && <p className="text-caption text-warning">Só as 7 primeiras complementares são usadas.</p>}
    </div>
  );
}

function PassoConfirmacao({
  estimativa,
  estimando,
  erroEstimativa,
  total,
  mix,
  modo,
  metodo,
  cenas,
  boardNome,
  referencias,
  erroCriar,
}: {
  estimativa: Estimativa | null;
  estimando: boolean;
  erroEstimativa: string | null;
  total: number;
  mix: Mix;
  modo: ModoFidelidade;
  metodo: Metodo;
  cenas: number;
  boardNome: string | null;
  referencias: number;
  erroCriar: string | null;
}) {
  const acimaLimite = estimativa ? estimativa.custoUsd > estimativa.limiteUsd : false;
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-border/70 p-4 text-body-sm sm:grid-cols-2">
        <Linha rotulo="Variantes">
          <span className="tabular">{total}</span>{" "}
          <span className="text-muted-foreground">
            ({TIPOS_VISUAIS.filter((t) => mix[t] > 0)
              .map((t) => `${mix[t]} ${TIPO_VISUAL_LABEL[t].toLowerCase()}`)
              .join(", ")}
            )
          </span>
        </Linha>
        <Linha rotulo="Fidelidade">{MODO_INFO[modo].titulo}</Linha>
        <Linha rotulo="Imagens">{METODO_INFO[metodo].titulo}</Linha>
        <Linha rotulo="Cenas">{cenas ? `${cenas} preset(s)` : "—"}</Linha>
        <Linha rotulo="Referências">{referencias ? `${referencias} imagem(ns)` : "—"}</Linha>
        <Linha rotulo="Board">{boardNome ?? "Mapeamento automático"}</Linha>
      </dl>

      {estimando ? (
        <p className="flex items-center gap-2 text-body-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Calculando jobs e custo…
        </p>
      ) : erroEstimativa ? (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erroEstimativa}
        </p>
      ) : estimativa ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Variantes" valor={String(estimativa.variantes)} />
            <Numero rotulo="Jobs na fila" valor={String(estimativa.jobs)} />
            <Numero
              rotulo="Chamadas pagas"
              valor={String(estimativa.chamadasImagem + estimativa.chamadasTexto + estimativa.chamadasVisao)}
              dica={`${estimativa.chamadasImagem} imagem · ${estimativa.chamadasTexto} texto · ${estimativa.chamadasVisao} visão`}
            />
            <Numero
              rotulo="Custo estimado"
              valor={estimativa.temOpenAI ? usd(estimativa.custoUsd) : "US$ 0"}
              dica={`Limite por lote: ${usd(estimativa.limiteUsd)}`}
              alerta={acimaLimite}
            />
          </div>
          {!estimativa.temOpenAI && (
            <p className="text-caption text-muted-foreground">OpenAI não conectada: nada é cobrado; textos usam regras e imagens pagas ficam de fora.</p>
          )}
          {acimaLimite && (
            <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-body-sm text-warning">
              <Coins className="mt-0.5 size-4 shrink-0" aria-hidden />
              Custo acima do limite por lote ({usd(estimativa.limiteUsd)}). Reduza o lote ou confirme o custo ao iniciar.
            </p>
          )}
          {estimativa.semReferencia && (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Sem referência principal pronta — volte à etapa 1 e escolha uma imagem.
            </p>
          )}
        </div>
      ) : null}

      {erroCriar && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-body-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erroCriar}
        </p>
      )}
      <p className="text-caption text-muted-foreground">Gerar não é publicar: as variantes vão para revisão e só são agendadas quando você aprovar.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------------
function Contador({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (v: number) => void; rotulo: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={rotulo}>
      <Button type="button" size="icon-sm" variant="ghost" onClick={() => aoMudar(limitar(valor - 1))} disabled={valor <= 0} aria-label="Diminuir">
        <Minus />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_POR_TIPO}
        value={valor}
        onChange={(e) => aoMudar(limitar(Number(e.target.value)))}
        aria-label={rotulo}
        className="h-9 w-12 rounded-lg border border-input bg-card text-center text-body-sm tabular focus-visible:outline-none focus-visible:shadow-focus"
      />
      <Button type="button" size="icon-sm" variant="ghost" onClick={() => aoMudar(limitar(valor + 1))} disabled={valor >= MAX_POR_TIPO} aria-label="Aumentar">
        <Plus />
      </Button>
    </div>
  );
}

function OpcaoRadio({
  nome,
  valor,
  marcado,
  aoMarcar,
  titulo,
  dica,
  selo,
}: {
  nome: string;
  valor: string;
  marcado: boolean;
  aoMarcar: () => void;
  titulo: string;
  dica: string;
  selo?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        marcado ? "border-tech/60 bg-tech/5" : "border-border/70 hover:bg-secondary/50",
      )}
    >
      <input type="radio" name={nome} value={valor} checked={marcado} onChange={aoMarcar} className="mt-1 size-4 accent-[rgb(var(--tech))]" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-body-sm font-medium">
          {titulo} {selo}
        </span>
        <span className="block text-caption text-muted-foreground">{dica}</span>
      </span>
    </label>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Numero({ rotulo, valor, dica, alerta }: { rotulo: string; valor: string; dica?: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2.5 text-center", alerta ? "bg-warning/10" : "bg-secondary/50")}>
      <p className="text-caption text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-0.5 text-h4 font-semibold tabular", alerta && "text-warning")}>{valor}</p>
      {dica && <p className="text-[0.7rem] text-muted-foreground">{dica}</p>}
    </div>
  );
}
