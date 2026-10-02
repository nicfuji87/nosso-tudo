"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { cn } from "@/lib/utils";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

type Janela = { dias: number[]; inicio: string; fim: string };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const CAMPOS: CampoSpec[] = [
  { tipo: "num", chave: "limite_diario", label: "Limite de Pins por dia", min: 0, max: 100, inteiro: true, dica: "0 = não publica nada (pausa as publicações)." },
  { tipo: "num", chave: "intervalo_minimo_min", label: "Intervalo mínimo entre Pins", min: 0, max: 1440, inteiro: true, sufixo: "min" },
  {
    tipo: "bool",
    chave: "exigir_aprovacao",
    label: "Exigir minha aprovação antes de publicar",
    dica: "Recomendado no começo. Desligado, Pins com score acima do mínimo abaixo saem sozinhos.",
  },
  { tipo: "num", chave: "autopublicar_score_min", label: "Score mínimo para publicar sozinho", min: 0, max: 100, sufixo: "pts", dica: "Só vale quando a aprovação não é exigida." },
  {
    tipo: "num",
    chave: "antecedencia_revalidacao_min",
    label: "Conferir preço e estoque antes de publicar",
    min: 5,
    max: 1440,
    inteiro: true,
    sufixo: "min",
    dica: "Quanto tempo antes do horário o app confere se o produto continua disponível.",
  },
  {
    tipo: "num",
    chave: "variacao_preco_bloqueio_pct",
    label: "Bloquear se o preço mudar mais de",
    min: 0,
    max: 100,
    sufixo: "%",
    dica: "Evita divulgar um preço muito diferente do que a arte mostra.",
  },
  { tipo: "num", chave: "janela_duplicacao_dias", label: "Não repetir o mesmo Pin por", min: 0, max: 365, inteiro: true, sufixo: "dias" },
  { tipo: "num", chave: "max_pins_produto_semana", label: "Máximo de Pins do mesmo produto por semana", min: 1, max: 50, inteiro: true },
  {
    tipo: "bool",
    chave: "exigir_disclosure",
    label: "Incluir o aviso de afiliado em todo Pin",
    dica: "Transparência com quem vê o Pin (texto definido em Geral).",
  },
];

function EditorJanelas({ janelas, onChange, disabled }: { janelas: Janela[]; onChange: (j: Janela[]) => void; disabled?: boolean }) {
  const atualizar = (i: number, p: Partial<Janela>) => onChange(janelas.map((j, k) => (k === i ? { ...j, ...p } : j)));
  return (
    <div className="space-y-3">
      {janelas.map((j, i) => {
        const erroInicio = !HHMM.test(j.inicio);
        const erroFim = !HHMM.test(j.fim);
        return (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border/70 p-3 lg:flex-row lg:items-center">
            <fieldset className="flex flex-wrap gap-1.5" disabled={disabled}>
              <legend className="sr-only">Dias da janela {i + 1}</legend>
              {DIAS.map((d, dia) => {
                const marcado = j.dias.includes(dia);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() => atualizar(i, { dias: marcado ? j.dias.filter((x) => x !== dia) : [...j.dias, dia].sort((a, b) => a - b) })}
                    className={cn(
                      "h-9 min-w-11 rounded-full border px-2.5 text-caption font-medium transition-colors disabled:opacity-50",
                      marcado ? "border-tech bg-tech text-tech-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
              <span className="self-center text-caption text-muted-foreground">{j.dias.length === 0 ? "· todos os dias" : ""}</span>
            </fieldset>
            <div className="flex items-center gap-2 lg:ml-auto">
              <label className="sr-only" htmlFor={`janela-${i}-inicio`}>
                Início
              </label>
              <Input
                id={`janela-${i}-inicio`}
                type="time"
                value={j.inicio}
                onChange={(e) => atualizar(i, { inicio: e.target.value })}
                className={cn("tabular h-9 w-28", erroInicio && "border-destructive")}
                disabled={disabled}
                aria-invalid={erroInicio}
              />
              <span className="text-caption text-muted-foreground">até</span>
              <label className="sr-only" htmlFor={`janela-${i}-fim`}>
                Fim
              </label>
              <Input
                id={`janela-${i}-fim`}
                type="time"
                value={j.fim}
                onChange={(e) => atualizar(i, { fim: e.target.value })}
                className={cn("tabular h-9 w-28", erroFim && "border-destructive")}
                disabled={disabled}
                aria-invalid={erroFim}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onChange(janelas.filter((_, k) => k !== i))}
                disabled={disabled || janelas.length <= 1}
                aria-label={`Remover janela ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onChange([...janelas, { dias: [], inicio: "09:00", fim: "22:00" }])}
        disabled={disabled || janelas.length >= 14}
      >
        <Plus /> Adicionar janela
      </Button>
    </div>
  );
}

export function FormPublicacao({ config, tz, podeEditar }: { config: ConfigCompleta["publicacao"]; tz: string; podeEditar: boolean }) {
  const form = useCampos(CAMPOS, config);
  const [janelas, setJanelas] = useState<Janela[]>(config.janelas);
  const [baseJanelas, setBaseJanelas] = useState(JSON.stringify(config.janelas));
  const { pendente, salvar } = useSalvarSecao();

  const janelasValidas = janelas.length > 0 && janelas.every((j) => HHMM.test(j.inicio) && HHMM.test(j.fim));
  const janelasSujas = JSON.stringify(janelas) !== baseJanelas;

  return (
    <Secao titulo="Regras de publicação" descricao="Quando e quanto publicar, e as travas de segurança antes de cada Pin.">
      <Campos campos={CAMPOS} form={form} disabled={!podeEditar || pendente} prefixo="pub" />

      <div className="mt-5 space-y-2">
        <p className="text-body-sm font-medium">Janelas de horário permitidas</p>
        <p className="text-caption text-muted-foreground">
          Os Pins só saem dentro destes horários (fuso {tz}). Nenhum dia marcado = vale para todos os dias.
        </p>
        <EditorJanelas janelas={janelas} onChange={setJanelas} disabled={!podeEditar || pendente} />
        {!janelasValidas && <p className="text-caption text-destructive">Preencha início e fim (HH:MM) em todas as janelas.</p>}
      </div>

      <BarraSalvar
        sujo={form.sujo || janelasSujas}
        valido={form.valido && janelasValidas}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={() => {
          form.descartar();
          setJanelas(JSON.parse(baseJanelas) as Janela[]);
        }}
        onSalvar={async () => {
          if (await salvar("publicacao", { ...form.valores, janelas })) {
            form.marcarSalvo();
            setBaseJanelas(JSON.stringify(janelas));
          }
        }}
      />
    </Secao>
  );
}
