"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, GitBranch, History, Info, Loader2, RotateCcw, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Campo, NativeSelect, Secao, Textarea } from "@/components/ml/campos";
import { ativarTemplate, salvarTemplate } from "@/app/ml/(painel)/configuracoes/actions";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { useExecutarAcao } from "./form";

/** Templates de prompt versionados (spec V2 §8). Salvar = nova versão; o histórico nunca é sobrescrito. */

export interface TemplateView {
  id: string;
  key: string;
  version: number;
  body: string;
  active: boolean;
  notes: string | null;
  created_at: string;
}

const CHAVES = [
  "lifestyle_no_text",
  "lifestyle_text",
  "editorial",
  "reference_generation",
  "exact_background",
  "manual_chatgpt",
  "pinterest_copy",
  "fidelity_check",
] as const;
type Chave = (typeof CHAVES)[number];

const INFO: Record<Chave, { nome: string; desc: string }> = {
  lifestyle_no_text: { nome: "Lifestyle sem texto", desc: "Cena realista com o produto em uso, sem nenhum texto na imagem." },
  lifestyle_text: { nome: "Lifestyle com texto", desc: "Cena com área limpa reservada para a headline, aplicada depois pelo compositor do app." },
  editorial: { nome: "Editorial", desc: "Imagem de apoio para o layout editorial (título + pontos de destaque)." },
  reference_generation: { nome: "Geração por referência", desc: "A IA recria a cena usando as fotos do anúncio como referência visual." },
  exact_background: { nome: "Fundo para composição exata", desc: "Gera só o cenário; a foto real do produto é recortada e aplicada pelo app." },
  manual_chatgpt: { nome: "Modo manual (ChatGPT)", desc: "Prompt pronto para copiar e colar no ChatGPT junto com as referências." },
  pinterest_copy: { nome: "Pinterest Copy", desc: "Gera título, descrição e alt text do pacote Pinterest de cada criativo." },
  fidelity_check: { nome: "Checagem de fidelidade", desc: "Instruções para o modelo de visão comparar a imagem gerada com as fotos reais." },
};

const PLACEHOLDER_DESC: Record<string, string> = {
  product_title: "Título do produto",
  benefit: "Benefício / objetivo da família",
  fidelity_constraints: "Restrições de fidelidade do produto",
  text_instruction: "Instrução sobre texto (reservar área ou não escrever)",
  scene_name: "Nome do preset de cena",
  scene_environment: "Ambiente do preset",
  scene_style: "Estilo do preset",
  scene_palette: "Paleta do preset",
  scene_lighting: "Iluminação do preset",
  scene_realism: "Nível de realismo do preset",
  scene_restrictions: "Restrições do preset",
  text_area_label: "Área reservada ao texto (ex.: terço superior)",
  placement_label: "Posição do produto (ex.: inferior central)",
  visual_description: "Descrição visual do criativo",
  tone: "Pinterest Copy › Tom de voz",
  title_rules: "Pinterest Copy › Regras de título",
  description_rules: "Pinterest Copy › Regras de descrição",
  alt_rules: "Pinterest Copy › Regra de alt text",
};

const PH_IMAGEM = [
  "product_title",
  "benefit",
  "fidelity_constraints",
  "text_instruction",
  "scene_name",
  "scene_environment",
  "scene_style",
  "scene_palette",
  "scene_lighting",
  "scene_realism",
  "scene_restrictions",
  "text_area_label",
  "placement_label",
];
const PH_POR_CHAVE: Record<Chave, string[]> = {
  lifestyle_no_text: PH_IMAGEM,
  lifestyle_text: PH_IMAGEM,
  editorial: PH_IMAGEM,
  reference_generation: PH_IMAGEM,
  exact_background: PH_IMAGEM,
  manual_chatgpt: PH_IMAGEM,
  pinterest_copy: ["visual_description", "tone", "title_rules", "description_rules", "alt_rules"],
  fidelity_check: [],
};

const MIN = 20;
const MAX = 6000;
const FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

function placeholdersDo(texto: string): string[] {
  return Array.from(new Set(Array.from(texto.matchAll(/\{([a-z_]+)\}/g), (m) => m[1] ?? ""))).filter(Boolean);
}

function EditorTemplate({
  chave,
  versoes,
  tz,
  podeEditar,
}: {
  chave: Chave;
  versoes: TemplateView[];
  tz: string;
  podeEditar: boolean;
}) {
  const ativa = versoes.find((v) => v.active) ?? null;
  const [texto, setTexto] = useState(ativa?.body ?? "");
  const [nota, setNota] = useState("");
  const [origem, setOrigem] = useState<number | null>(ativa?.version ?? null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const salvarAcao = useExecutarAcao();
  const ativarAcao = useExecutarAcao();
  const pendente = salvarAcao.pendente || ativarAcao.pendente;

  const permitidos = PH_POR_CHAVE[chave];
  const usados = useMemo(() => placeholdersDo(texto), [texto]);
  const desconhecidos = usados.filter((p) => !permitidos.includes(p));
  const mudou = texto !== (ativa?.body ?? "");
  const tamanhoOk = texto.trim().length >= MIN && texto.length <= MAX;

  const inserir = (ph: string) => {
    const el = ref.current;
    const token = `{${ph}}`;
    if (!el || !podeEditar) return;
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + token + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + token.length, ini + token.length);
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-body-sm font-semibold">{INFO[chave].nome}</h3>
            <p className="text-caption text-muted-foreground">{INFO[chave].desc}</p>
          </div>
          {ativa ? (
            <Badge variant="tech">
              <GitBranch className="size-3.5" aria-hidden /> Ativa: v{ativa.version}
            </Badge>
          ) : (
            <Badge variant="warning">
              <AlertTriangle className="size-3.5" aria-hidden /> Sem versão ativa
            </Badge>
          )}
        </div>

        {origem != null && ativa && origem !== ativa.version && (
          <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
            <Info className="size-3.5 shrink-0 text-tech" aria-hidden /> Texto da v{origem} carregado no editor. Salvar cria uma nova versão com ele.
          </p>
        )}

        <Campo
          label="Corpo do template"
          dica={
            texto.length > MAX ? (
              <span className="text-destructive">Até {MAX} caracteres.</span>
            ) : texto.trim().length < MIN ? (
              <span className="text-destructive">Mínimo de {MIN} caracteres.</span>
            ) : (
              <span className="tabular">
                {texto.length} / {MAX} caracteres
              </span>
            )
          }
        >
          <Textarea
            ref={ref}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={12}
            spellCheck={false}
            className="font-mono text-caption leading-relaxed"
            readOnly={!podeEditar}
            disabled={pendente}
            aria-label={`Corpo do template ${INFO[chave].nome}`}
          />
        </Campo>

        {desconhecidos.length > 0 && (
          <p className="flex items-start gap-2 text-caption text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {desconhecidos.map((p) => `{${p}}`).join(", ")} não {desconhecidos.length === 1 ? "é preenchido" : "são preenchidos"} para este template e
              {desconhecidos.length === 1 ? " sairá" : " sairão"} vazio{desconhecidos.length === 1 ? "" : "s"} no prompt.
            </span>
          </p>
        )}

        {podeEditar ? (
          <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-end">
            <Campo label="Nota da versão (opcional)" className="flex-1">
              <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ex.: reforça proibição de texto na imagem" disabled={pendente} />
            </Campo>
            <div className="flex gap-2">
              {mudou && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendente}
                  onClick={() => {
                    setTexto(ativa?.body ?? "");
                    setOrigem(ativa?.version ?? null);
                  }}
                >
                  <RotateCcw /> Descartar
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={!mudou || !tamanhoOk || pendente}
                aria-busy={salvarAcao.pendente}
                onClick={async () => {
                  const r = await salvarAcao.executar(() => salvarTemplate(chave, texto, nota.trim() || null));
                  if (r) setNota("");
                }}
              >
                {salvarAcao.pendente ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar nova versão
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">Somente administradores do ML podem alterar templates.</p>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold">
            <FileText className="size-3.5" aria-hidden /> Variáveis disponíveis
          </p>
          {permitidos.length === 0 ? (
            <p className="text-caption text-muted-foreground">Este template não recebe variáveis: as imagens são anexadas pelo app.</p>
          ) : (
            <ul className="space-y-1">
              {permitidos.map((p) => {
                const usado = usados.includes(p);
                return (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => inserir(p)}
                      disabled={!podeEditar || pendente}
                      title={podeEditar ? "Inserir no cursor" : undefined}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-caption transition-colors",
                        podeEditar && "hover:bg-secondary",
                        "disabled:cursor-default",
                      )}
                    >
                      {usado ? (
                        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" aria-label="em uso" />
                      ) : (
                        <span className="mt-0.5 size-3 shrink-0 rounded-full border border-border" aria-label="não usado" />
                      )}
                      <span className="min-w-0">
                        <code className="font-mono text-foreground">{`{${p}}`}</code>
                        <span className="block text-muted-foreground">{PLACEHOLDER_DESC[p] ?? p}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold">
            <History className="size-3.5" aria-hidden /> Histórico de versões
          </p>
          {versoes.length === 0 ? (
            <p className="text-caption text-muted-foreground">Nenhuma versão salva ainda.</p>
          ) : (
            <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {versoes.map((v) => (
                <li key={v.id} className={cn("rounded-lg border px-2.5 py-2", v.active ? "border-tech/40 bg-tech/5" : "border-border/60")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-semibold tabular">v{v.version}</span>
                    {v.active ? (
                      <Badge variant="tech" size="sm">
                        <CheckCircle2 className="size-3" aria-hidden /> Ativa
                      </Badge>
                    ) : null}
                  </div>
                  <time className="block text-caption tabular text-muted-foreground" dateTime={v.created_at}>
                    {formatarNoFuso(v.created_at, tz, FMT)}
                  </time>
                  {v.notes && <p className="mt-0.5 text-caption">{v.notes}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-caption"
                      disabled={pendente}
                      onClick={() => {
                        setTexto(v.body);
                        setOrigem(v.version);
                      }}
                    >
                      <Upload /> {podeEditar ? "Carregar no editor" : "Ver texto"}
                    </Button>
                    {podeEditar && !v.active && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-caption"
                        disabled={pendente}
                        onClick={() => {
                          if (!window.confirm(`Ativar a v${v.version} de “${INFO[chave].nome}”? As próximas gerações passam a usá-la.`)) return;
                          void ativarAcao.executar(() => ativarTemplate(chave, v.version));
                        }}
                      >
                        Ativar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

export function TemplatesPrompt({ templates, tz, podeEditar }: { templates: TemplateView[]; tz: string; podeEditar: boolean }) {
  const [chave, setChave] = useState<Chave>("lifestyle_no_text");
  const porChave = useMemo(() => {
    const m = new Map<Chave, TemplateView[]>(CHAVES.map((k) => [k, []]));
    for (const t of templates) {
      const lista = m.get(t.key as Chave);
      if (lista) lista.push(t);
    }
    for (const l of m.values()) l.sort((a, b) => b.version - a.version);
    return m;
  }, [templates]);
  const versoes = porChave.get(chave) ?? [];
  const ativa = versoes.find((v) => v.active);

  return (
    <Secao
      titulo="Templates de prompt"
      descricao="Textos-base que montam os prompts de imagem, copy e fidelidade. As variáveis entre chaves são preenchidas pelo app."
    >
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-caption">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        <span>
          Salvar cria uma <strong className="font-medium">nova versão</strong> e a ativa — a anterior fica no histórico. Só as próximas gerações usam o
          novo texto, e cada criativo registra a versão usada (ex.: <code className="font-mono">lifestyle_text@v3</code>).
        </span>
      </p>

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Seletor: select no mobile, lista no desktop */}
        <div className="lg:hidden">
          <NativeSelect value={chave} onChange={(e) => setChave(e.target.value as Chave)} className="w-full" aria-label="Template">
            {CHAVES.map((k) => {
              const a = porChave.get(k)?.find((v) => v.active);
              return (
                <option key={k} value={k}>
                  {INFO[k].nome} {a ? `(v${a.version})` : "(sem versão ativa)"}
                </option>
              );
            })}
          </NativeSelect>
        </div>
        <nav className="hidden lg:block" aria-label="Templates">
          <ul className="space-y-1">
            {CHAVES.map((k) => {
              const a = porChave.get(k)?.find((v) => v.active);
              const sel = k === chave;
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setChave(k)}
                    aria-current={sel ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-body-sm transition-colors",
                      sel ? "bg-tech/10 font-medium text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{INFO[k].nome}</span>
                    {a ? (
                      <span className="shrink-0 text-caption tabular text-muted-foreground">v{a.version}</span>
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label="sem versão ativa" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <EditorTemplate key={`${chave}:${ativa?.id ?? "nenhuma"}`} chave={chave} versoes={versoes} tz={tz} podeEditar={podeEditar} />
      </div>
    </Secao>
  );
}
