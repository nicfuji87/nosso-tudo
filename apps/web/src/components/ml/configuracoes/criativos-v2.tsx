"use client";

import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Campo, Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { MODO_FIDELIDADE_LABEL, TIPO_VISUAL_LABEL, TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { cn } from "@/lib/utils";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec, type Valores } from "./form";

/**
 * Configurações › Criativos V2 (spec V2 §11.12, §16).
 * `mix` é aninhado no schema; aqui vira chaves planas `mix.<tipo>` e é remontado ao salvar.
 */

type ConfigV2 = ConfigCompleta["criativos_v2"];

const DICA_TIPO: Record<(typeof TIPOS_VISUAIS)[number], string> = {
  lifestyle_no_text: "Produto em uso num ambiente real, sem texto.",
  lifestyle_text: "Cena lifestyle com headline curta aplicada pelo app.",
  editorial: "Layout com título e pontos de destaque.",
  product_layout: "Foto do anúncio com moldura e texto (sem IA).",
};

const CAMPOS_GERAIS: CampoSpec[] = [
  {
    tipo: "select",
    chave: "modo_fidelidade_padrao",
    label: "Modo de fidelidade padrão",
    opcoes: [
      { valor: "exact_composition", label: `${MODO_FIDELIDADE_LABEL.exact_composition} (recomendado)` },
      { valor: "reference_generation", label: MODO_FIDELIDADE_LABEL.reference_generation },
      { valor: "original_layout", label: MODO_FIDELIDADE_LABEL.original_layout },
    ],
    dica: "Dá para trocar em cada lote no wizard.",
  },
];

const CAMPOS_MIX: CampoSpec[] = TIPOS_VISUAIS.map((t) => ({
  tipo: "num" as const,
  chave: `mix.${t}`,
  label: TIPO_VISUAL_LABEL[t],
  min: 0,
  max: 12,
  inteiro: true,
  dica: DICA_TIPO[t],
}));

const CAMPOS_GERACAO: CampoSpec[] = [
  {
    tipo: "bool",
    chave: "exigir_revisao_referencia",
    label: "Exigir revisão humana para geração por referência",
    dica: "Quando a IA redesenha a cena a partir das fotos, a variante só pode ser aprovada depois que alguém conferir o checklist de fidelidade (peças, cor, formato, acessórios).",
  },
  {
    tipo: "bool",
    chave: "auto_selecionar_referencias",
    label: "Selecionar referências automaticamente",
    dica: "Ao importar as fotos do anúncio, o app marca a principal e as complementares. Você pode trocar o papel de cada foto no produto.",
  },
  {
    tipo: "num",
    chave: "limite_custo_lote_usd",
    label: "Limite de custo por lote",
    min: 0,
    max: 100,
    passo: 0.01,
    sufixo: "US$",
    dica: "Estimativa acima disso pede confirmação antes de gerar; nos lotes automáticos o produto é pulado.",
  },
  {
    tipo: "num",
    chave: "max_variantes_ativas_familia",
    label: "Máximo de variantes ativas por família",
    min: 1,
    max: 30,
    inteiro: true,
    dica: "Um lote com mais variantes que isso é recusado.",
  },
  {
    tipo: "num",
    chave: "retencao_rejeitados_dias",
    label: "Retenção de rejeitados",
    min: 1,
    max: 365,
    inteiro: true,
    sufixo: "dias",
    dica: "Por quanto tempo os arquivos de variantes rejeitadas são guardados antes da limpeza.",
  },
];

const CAMPOS_PUBLICACAO: CampoSpec[] = [
  {
    tipo: "num",
    chave: "cooldown_variantes_horas",
    label: "Cooldown entre variantes do mesmo produto",
    min: 0,
    max: 1440,
    inteiro: true,
    sufixo: "h",
    dica: "Intervalo mínimo entre publicar duas variantes do mesmo produto. 0 desliga.",
  },
  {
    tipo: "num",
    chave: "limite_board_dia",
    label: "Limite de Pins por board por dia",
    min: 1,
    max: 50,
    inteiro: true,
    sufixo: "Pins",
    dica: "Evita concentrar publicações num único board.",
  },
  {
    tipo: "num",
    chave: "similaridade_visual_max",
    label: "Similaridade visual máxima",
    min: 0,
    max: 32,
    inteiro: true,
    dica: "Distância entre as “impressões digitais” de duas imagens (0 a 32). Até este valor, a nova arte conta como quase igual a uma publicada recentemente e é bloqueada. 0 = só imagens idênticas; padrão 6; valores maiores bloqueiam mais.",
  },
  {
    tipo: "num",
    chave: "similaridade_headline_max",
    label: "Similaridade de headline",
    min: 0,
    max: 100,
    passo: 1,
    escala: 100,
    sufixo: "%",
    dica: "Headlines com sobreposição de palavras igual ou acima disso contam como repetidas. 100% = só textos idênticos; padrão 85%.",
  },
  {
    tipo: "num",
    chave: "atraso_maximo_min",
    label: "Atraso máximo antes do anti-flood",
    min: 5,
    max: 1440,
    inteiro: true,
    sufixo: "min",
    dica: "Se a fila ficou parada, Pins atrasados mais que isso não saem todos de uma vez: um é publicado e os demais são reagendados.",
  },
];

const TODOS = [...CAMPOS_GERAIS, ...CAMPOS_MIX, ...CAMPOS_GERACAO, ...CAMPOS_PUBLICACAO];

function achatar(config: ConfigV2): Valores {
  const { mix, ...resto } = config;
  const out: Valores = { ...resto };
  for (const t of TIPOS_VISUAIS) out[`mix.${t}`] = mix[t];
  return out;
}

function remontar(valores: Valores): Valores {
  const out: Valores = {};
  const mix: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valores)) {
    if (k.startsWith("mix.")) mix[k.slice(4)] = v;
    else out[k] = v;
  }
  out.mix = mix;
  return out;
}

const MODO_EXPLICACAO: Record<string, { titulo: string; texto: string; tom: "ok" | "aviso" | "neutro" }> = {
  exact_composition: {
    titulo: "Composição exata",
    texto: "A foto real do produto é recortada e aplicada sobre um cenário gerado. O produto não é redesenhado — máxima fidelidade, ideal para comércio.",
    tom: "ok",
  },
  reference_generation: {
    titulo: "Geração por referência",
    texto: "A IA cria a cena inteira usando as fotos do anúncio como referência. Mais natural, mas pode alterar detalhes do produto — exige conferência.",
    tom: "aviso",
  },
  original_layout: {
    titulo: "Foto original + layout",
    texto: "Usa a foto do anúncio com moldura, headline e cores da marca. Sem IA e sem custo.",
    tom: "neutro",
  },
};

export function FormCriativosV2({ config, podeEditar }: { config: ConfigV2; podeEditar: boolean }) {
  const form = useCampos(TODOS, achatar(config));
  const { pendente, salvar } = useSalvarSecao();
  const desabilitado = !podeEditar || pendente;

  const soma = TIPOS_VISUAIS.reduce((s, t) => {
    const n = Number(String(form.estado[`mix.${t}`] ?? "0").replace(",", "."));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const maximo = Number(form.estado.max_variantes_ativas_familia ?? 0);
  const modo = MODO_EXPLICACAO[String(form.estado.modo_fidelidade_padrao)];

  const somaErro = soma < 1 ? "Distribua ao menos uma variante." : maximo > 0 && soma > maximo ? `A soma passa do máximo por família (${maximo}) — os lotes seriam recusados.` : null;

  return (
    <Secao
      titulo="Criativos V2"
      descricao="Como cada produto vira uma família de variantes: quantidade, tipos, fidelidade ao produto real e regras anti-repetição."
    >
      <div className="space-y-6">
        {/* Família */}
        <div>
          <h3 className="mb-3 text-body-sm font-semibold">Família de criativos</h3>
          <Campos campos={CAMPOS_GERAIS} form={form} disabled={desabilitado} prefixo="v2" />
          {modo && (
            <p
              className={cn(
                "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-caption",
                modo.tom === "ok" && "bg-success/10 text-foreground",
                modo.tom === "aviso" && "bg-warning/10 text-foreground",
                modo.tom === "neutro" && "bg-secondary/60 text-muted-foreground",
              )}
            >
              {modo.tom === "aviso" ? (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-3.5 shrink-0 text-tech" aria-hidden />
              )}
              <span>
                <strong className="font-medium">{modo.titulo}:</strong> {modo.texto}
              </span>
            </p>
          )}
        </div>

        {/* Distribuição */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body-sm font-semibold">Distribuição por tipo</h3>
            <Badge variant={somaErro ? "destructive" : "success"} className="tabular">
              {somaErro ? <AlertTriangle className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
              Total: {soma} variante{soma === 1 ? "" : "s"}
            </Badge>
          </div>
          <Campos campos={CAMPOS_MIX} form={form} disabled={desabilitado} prefixo="v2" className="lg:grid-cols-4" />
          {somaErro && (
            <p className="mt-2 flex items-start gap-2 text-caption text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {somaErro}
            </p>
          )}
        </div>

        {/* Geração */}
        <div>
          <h3 className="mb-3 text-body-sm font-semibold">Geração</h3>
          <Campo label="Formato" dica="Vertical, o formato recomendado pelo Pinterest. Fixo." className="mb-3 block sm:max-w-[calc(50%-0.375rem)]">
            <span className="flex h-10 items-center gap-2 rounded-xl border border-input bg-secondary/50 px-3 text-body-sm text-muted-foreground">
              <Lock className="size-3.5" aria-hidden /> 2:3 (vertical)
            </span>
          </Campo>
          <Campos campos={CAMPOS_GERACAO} form={form} disabled={desabilitado} prefixo="v2" />
        </div>

        {/* Publicação e anti-repetição */}
        <div>
          <h3 className="mb-1 text-body-sm font-semibold">Publicação e anti-repetição</h3>
          <p className="mb-3 text-caption text-muted-foreground">
            Gerar não é publicar: uma família pode ter seis variantes e só uma ir ao ar. Estas regras evitam Pins repetidos e rajadas.
          </p>
          <Campos campos={CAMPOS_PUBLICACAO} form={form} disabled={desabilitado} prefixo="v2" />
        </div>
      </div>

      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido && !somaErro}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (somaErro) return;
          if (await salvar("criativos_v2", remontar(form.valores))) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}
