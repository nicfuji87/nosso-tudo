"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, History, Loader2, RefreshCcw, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, Secao } from "@/components/ml/campos";
import { ativarVersaoScoring, repontuarTriagem, restaurarPesosPadrao, salvarPesos } from "@/app/ml/(painel)/configuracoes/actions";
import type { ConfigCompleta } from "@/lib/ml/config";
import { FATORES, FATOR_LABEL, PESOS_PADRAO, validarPesos, type Fator, type Pesos } from "@/lib/ml/scoring/engine";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { useAcao } from "@/components/ml/integracoes/comum";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

export interface VersaoScoring {
  version: number;
  weights: Partial<Record<string, number>>;
  note: string | null;
  created_at: string;
}

/** Presets (cada um soma exatamente 100). */
const PRESETS: { nome: string; desc: string; pesos: Pesos }[] = [
  { nome: "Padrão da especificação", desc: "Equilíbrio entre vendas, tendência e apelo visual.", pesos: PESOS_PADRAO },
  {
    nome: "Foco em tendência",
    desc: "Prioriza o que está crescendo agora.",
    pesos: { bestseller_rank: 20, trend: 30, pinterest_fit: 15, reviews: 8, commission: 7, price_range: 5, discount: 5, image_quality: 5, novelty: 5, performance: 0 },
  },
  {
    nome: "Foco visual (Pinterest)",
    desc: "Produtos bonitos de mostrar, com boa foto.",
    pesos: { bestseller_rank: 15, trend: 10, pinterest_fit: 30, reviews: 8, commission: 7, price_range: 5, discount: 5, image_quality: 15, novelty: 5, performance: 0 },
  },
  {
    nome: "Foco em comissão",
    desc: "Prioriza o que rende mais por venda.",
    pesos: { bestseller_rank: 18, trend: 10, pinterest_fit: 15, reviews: 10, commission: 25, price_range: 7, discount: 5, image_quality: 5, novelty: 5, performance: 0 },
  },
];

const paraTexto = (p: Partial<Record<string, number>>) => Object.fromEntries(FATORES.map((f) => [f, String(p[f] ?? 0)])) as Record<Fator, string>;
const paraNumeros = (t: Record<Fator, string>) => Object.fromEntries(FATORES.map((f) => [f, Number(t[f].replace(",", "."))])) as Pesos;
const iguais = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>) => FATORES.every((f) => Number(a[f] ?? 0) === Number(b[f] ?? 0));

function resumoPesos(w: Partial<Record<string, number>>): string {
  return FATORES.filter((f) => (w[f] ?? 0) > 0)
    .sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0))
    .slice(0, 4)
    .map((f) => `${FATOR_LABEL[f].split(" ")[0]} ${w[f]}`)
    .join(" · ");
}

const CAMPOS_PARAMS: CampoSpec[] = [
  { tipo: "num", chave: "precoIdealMin", label: "Preço ideal — de", min: 0, sufixo: "R$", dica: "Faixa de preço que mais converte no Pinterest." },
  { tipo: "num", chave: "precoIdealMax", label: "Preço ideal — até", min: 1, sufixo: "R$" },
  { tipo: "num", chave: "comissaoAlvo", label: "Comissão que vale nota máxima", min: 0.01, sufixo: "R$", dica: "Comissão estimada por venda que leva o fator a 100." },
  { tipo: "num", chave: "ratingPrior", label: "Nota de referência das avaliações", min: 1, max: 5, passo: 0.1, dica: "Produtos com poucas avaliações puxam para esta nota." },
  { tipo: "num", chave: "ratingPeso", label: "Peso da nota de referência", min: 0, dica: "Equivale a quantas avaliações “imaginárias”." },
  { tipo: "num", chave: "diasNovidade", label: "Dias até um produto voltar a ser “novo”", min: 1, inteiro: true, sufixo: "dias" },
  { tipo: "num", chave: "tamanhoRanking", label: "Tamanho do ranking considerado", min: 2, inteiro: true, dica: "Posição 1 vale 100; a última vale perto de 0." },
  {
    tipo: "bool",
    chave: "usar_ia",
    label: "Usar IA para avaliar apelo visual e qualidade da foto",
    dica: "Requer a OpenAI. Sem ela, esses fatores usam uma estimativa pela categoria.",
  },
];

function EditorPesos({ pesosAtivos, podeEditar }: { pesosAtivos: Partial<Record<string, number>>; podeEditar: boolean }) {
  const [texto, setTexto] = useState(() => paraTexto(pesosAtivos));
  const [nota, setNota] = useState("");
  const { pendente, executar } = useAcao();
  const nums = paraNumeros(texto);
  const v = validarPesos(nums);
  const soma = Math.round(FATORES.reduce((a, f) => a + (Number.isFinite(nums[f]) ? nums[f] : 0), 0) * 100) / 100;
  const mudou = !iguais(nums, pesosAtivos);

  return (
    <Secao
      titulo="Pesos da fórmula"
      descricao="Quanto cada fator conta no score de 0 a 100. A soma precisa dar exatamente 100%."
      acoes={
        podeEditar && (
          <AcaoBotao
            size="sm"
            variant="ghost"
            acao={restaurarPesosPadrao}
            confirmar="Criar uma nova versão com os pesos padrão da especificação e ativá-la?"
            aoConcluir={() => setTexto(paraTexto(PESOS_PADRAO))}
          >
            <RotateCcw /> Restaurar padrão
          </AcaoBotao>
        )
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-tech" aria-hidden />
        <p>
          Estes pesos são uma <strong>hipótese inicial</strong>: ajuste conforme os resultados reais. Cada alteração vira uma <strong>nova versão</strong> e as
          anteriores ficam guardadas — todo score registra qual versão o calculou.
        </p>
      </div>

      {podeEditar && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Modelos prontos">
          {PRESETS.map((p) => {
            const ativo = iguais(nums, p.pesos);
            return (
              <Button
                key={p.nome}
                type="button"
                size="sm"
                variant={ativo ? "tech" : "secondary"}
                title={p.desc}
                onClick={() => setTexto(paraTexto(p.pesos))}
                aria-pressed={ativo}
              >
                {p.nome}
              </Button>
            );
          })}
        </div>
      )}

      <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {FATORES.map((f) => {
          const n = nums[f];
          const invalido = !Number.isFinite(n) || n < 0 || n > 100;
          return (
            <li key={f} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`peso-${f}`} className="text-body-sm">
                  {FATOR_LABEL[f]}
                </label>
                <div className="relative w-20">
                  <Input
                    id={`peso-${f}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={texto[f]}
                    onChange={(e) => setTexto((t) => ({ ...t, [f]: e.target.value }))}
                    className={cn("tabular h-9 pr-7 text-right", invalido && "border-destructive")}
                    disabled={!podeEditar || pendente}
                    aria-invalid={invalido}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Number.isFinite(n) ? n : 0}
                onChange={(e) => setTexto((t) => ({ ...t, [f]: e.target.value }))}
                disabled={!podeEditar || pendente}
                className="w-full accent-[rgb(var(--tech))] disabled:opacity-50"
                aria-label={`${FATOR_LABEL[f]} (controle deslizante)`}
              />
            </li>
          );
        })}
      </ul>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
          soma === 100 ? "bg-success/10" : "bg-warning/10",
        )}
        aria-live="polite"
      >
        <p className="text-body-sm">
          Soma: <span className="tabular font-semibold">{soma}%</span>{" "}
          {soma === 100 ? (
            <span className="text-success">— certo</span>
          ) : (
            <span className="text-warning">— {soma > 100 ? `tire ${Math.round((soma - 100) * 100) / 100}` : `faltam ${Math.round((100 - soma) * 100) / 100}`} pontos</span>
          )}
        </p>
        {nums.performance > 0 && (
          <span className="text-caption text-muted-foreground">Performance histórica só ajuda quando já há Pins publicados com métricas.</span>
        )}
      </div>

      {podeEditar ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-end">
          <Campo label="Nota desta versão (opcional)" className="flex-1">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ex.: mais peso para tendência no fim do ano" disabled={pendente} />
          </Campo>
          <Button
            type="button"
            disabled={!v.ok || !mudou || pendente}
            title={!v.ok ? v.erro : !mudou ? "Igual à versão ativa" : undefined}
            onClick={async () => {
              const ok = await executar(() => salvarPesos(nums, nota.trim() || undefined));
              if (ok) setNota("");
            }}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar nova versão
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-caption text-muted-foreground">Somente administradores do ML podem alterar os pesos.</p>
      )}
    </Secao>
  );
}

export function ConfigScoring({
  config,
  versoes,
  podeEditar,
  podeOperar,
  tz,
}: {
  config: ConfigCompleta["scoring"];
  versoes: VersaoScoring[];
  podeEditar: boolean;
  podeOperar: boolean;
  tz: string;
}) {
  const ativa = versoes.find((v) => v.version === config.versao_ativa);
  const pesosAtivos = ativa?.weights ?? PESOS_PADRAO;
  const iniciaisParams = useMemo(() => ({ ...config.params, usar_ia: config.usar_ia }), [config]);
  const form = useCampos(CAMPOS_PARAMS, iniciaisParams);
  const { pendente, salvar } = useSalvarSecao();
  const precoMin = Number(form.valores.precoIdealMin);
  const precoMax = Number(form.valores.precoIdealMax);
  const faixaInvalida = Number.isFinite(precoMin) && Number.isFinite(precoMax) && precoMin >= precoMax;

  return (
    <div className="space-y-6">
      <EditorPesos key={config.versao_ativa} pesosAtivos={pesosAtivos} podeEditar={podeEditar} />

      <Secao
        titulo="Histórico de versões"
        descricao="Você pode voltar para uma versão anterior a qualquer momento."
        acoes={
          podeOperar && (
            <AcaoBotao
              size="sm"
              variant="secondary"
              acao={repontuarTriagem}
              confirmar="Recalcular o score de todos os produtos em triagem com a fórmula ativa?"
            >
              <RefreshCcw /> Repontuar produtos em triagem
            </AcaoBotao>
          )
        }
      >
        {versoes.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">Nenhuma versão salva ainda — o app usa os pesos padrão da especificação.</p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
            {versoes.map((v) => {
              const atual = v.version === config.versao_ativa;
              return (
                <li key={v.version} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", atual && "bg-tech/5")}>
                  <div className="flex items-center gap-2 sm:w-28">
                    <History className="size-4 text-muted-foreground" aria-hidden />
                    <span className="tabular text-body-sm font-semibold">v{v.version}</span>
                    {atual && (
                      <Badge variant="tech" size="sm">
                        <CheckCircle2 className="size-3" aria-hidden /> Ativa
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm">{v.note || <span className="text-muted-foreground">Sem nota</span>}</p>
                    <p className="tabular truncate text-caption text-muted-foreground" title={FATORES.map((f) => `${FATOR_LABEL[f]}: ${v.weights[f] ?? 0}%`).join("\n")}>
                      {resumoPesos(v.weights)} · {formatarNoFuso(v.created_at, tz)}
                    </p>
                  </div>
                  {podeEditar && !atual && (
                    <AcaoBotao size="sm" variant="ghost" acao={() => ativarVersaoScoring(v.version)} confirmar={`Ativar a versão ${v.version} da fórmula?`}>
                      Ativar
                    </AcaoBotao>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-caption text-muted-foreground">Trocar a versão vale para os próximos scores. Use “Repontuar” para recalcular os produtos que ainda estão em triagem.</p>
      </Secao>

      <Secao titulo="Parâmetros dos fatores" descricao="Ajustes finos de como cada fator vira nota.">
        <Campos campos={CAMPOS_PARAMS} form={form} disabled={!podeEditar || pendente} prefixo="score" />
        {faixaInvalida && <p className="mt-2 text-caption text-destructive">O preço “de” precisa ser menor que o “até”.</p>}
        <BarraSalvar
          sujo={form.sujo}
          valido={form.valido && !faixaInvalida}
          pendente={pendente}
          podeEditar={podeEditar}
          onDescartar={form.descartar}
          onSalvar={async () => {
            const { usar_ia, ...params } = form.valores;
            if (await salvar("scoring", { params, usar_ia })) form.marcarSalvo();
          }}
        />
      </Secao>
    </div>
  );
}
