"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Gauge, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Secao } from "@/components/ml/campos";
import { aplicarNivelAutomacao } from "@/app/ml/(painel)/configuracoes/actions";
import type { ConfigCompleta } from "@/lib/ml/config";
import { cn } from "@/lib/utils";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

export interface NivelAutomacao {
  nivel: number;
  nome: string;
  desc: string;
}

/** O que `aplicarNivelAutomacao` muda — espelha a action para o texto de confirmação. */
function efeitos(n: number): string[] {
  const s = (b: boolean) => (b ? "ligado" : "desligado");
  const linhas = [
    `• Descoberta e análise automáticas: ${s(n >= 1)}`,
    `• Gerar ângulos automaticamente: ${s(n >= 1)}`,
    `• Escolher ângulos sozinho: ${n >= 2 ? "2 por produto" : "não (você escolhe)"}`,
    `• Gerar criativos automaticamente: ${s(n >= 2)}`,
    `• Aprovar produtos com score alto: ${s(n >= 3)}`,
    `• Aprovar criativos automaticamente: ${s(n >= 3)}`,
    `• Agendar Pins sozinho: ${s(n >= 3)}`,
    `• Exigir sua aprovação antes de publicar: ${n >= 3 ? "não" : "sim"}`,
  ];
  if (n === 4) linhas.push("• Cria uma nova versão da fórmula de score com 10% de peso para a performance histórica");
  return linhas;
}

const CAMPOS: CampoSpec[] = [
  {
    tipo: "bool",
    chave: "auto_aprovar_produtos",
    label: "Aprovar produtos automaticamente",
    dica: "Produtos com score e confiança acima dos mínimos abaixo são aprovados sem você precisar olhar.",
  },
  { tipo: "num", chave: "auto_aprovar_score_min", label: "Score mínimo para aprovar sozinho", min: 0, max: 100, sufixo: "pts", dependeDe: "auto_aprovar_produtos" },
  {
    tipo: "num",
    chave: "auto_aprovar_confianca_min",
    label: "Confiança mínima do score",
    min: 0,
    max: 100,
    escala: 100,
    sufixo: "%",
    dependeDe: "auto_aprovar_produtos",
    dica: "Quanto dos dados do produto era real (não estimado).",
  },
  {
    tipo: "bool",
    chave: "auto_gerar_angulos",
    label: "Sugerir ângulos de divulgação automaticamente",
    dica: "Ideias de abordagem (para quem é, qual problema resolve) para cada produto aprovado. Usa a OpenAI.",
  },
  {
    tipo: "num",
    chave: "auto_selecionar_angulos",
    label: "Ângulos escolhidos automaticamente por produto",
    min: 0,
    max: 5,
    inteiro: true,
    dica: "0 = você escolhe os ângulos.",
  },
  {
    tipo: "bool",
    chave: "auto_gerar_criativos",
    label: "Criar artes e textos automaticamente",
    dica: "Assim que um produto aprovado tiver link de afiliado e ângulo escolhido.",
  },
  {
    tipo: "bool",
    chave: "auto_aprovar_criativos",
    label: "Aprovar artes automaticamente",
    dica: "Artes com nota de qualidade acima do mínimo vão direto para a fila de publicação.",
  },
  {
    tipo: "num",
    chave: "auto_aprovar_criativos_qualidade_min",
    label: "Qualidade mínima da arte",
    min: 0,
    max: 100,
    sufixo: "pts",
    dependeDe: "auto_aprovar_criativos",
  },
  {
    tipo: "bool",
    chave: "auto_agendar",
    label: "Agendar Pins sozinho",
    dica: "Encaixa os Pins aprovados nas janelas de publicação, respeitando o limite diário.",
  },
];

export function FormAutomacao({
  config,
  nivelAtual,
  niveis,
  podeEditar,
}: {
  config: ConfigCompleta["automacao"];
  nivelAtual: number;
  niveis: NivelAutomacao[];
  podeEditar: boolean;
}) {
  const form = useCampos(CAMPOS, config);
  const { pendente, salvar } = useSalvarSecao();

  return (
    <div className="space-y-6">
      <Secao
        titulo="Nível de automação"
        descricao="Comece com supervisão e aumente a automação conforme confiar nos resultados. Aplicar um nível ajusta os interruptores abaixo de uma vez."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {niveis.map((n) => {
            const atual = n.nivel === nivelAtual;
            return (
              <li
                key={n.nivel}
                className={cn(
                  "flex flex-col rounded-xl border p-4",
                  atual ? "border-tech bg-tech/5 shadow-card" : "border-border/70",
                )}
                aria-current={atual ? "true" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-overline font-semibold uppercase tracking-wide text-muted-foreground">Nível {n.nivel}</span>
                  {atual && (
                    <Badge variant="tech" size="sm">
                      <CheckCircle2 className="size-3" aria-hidden /> Atual
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-body-sm font-semibold">{n.nome}</p>
                <p className="mt-1 flex-1 text-caption text-muted-foreground">{n.desc}</p>
                {podeEditar && !atual && (
                  <AcaoBotao
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    acao={() => aplicarNivelAutomacao(n.nivel)}
                    confirmar={`Aplicar o nível ${n.nivel} — ${n.nome}?\n\nIsto vai ajustar:\n${efeitos(n.nivel).join("\n")}\n\nVocê pode ajustar cada item depois.`}
                  >
                    Aplicar este nível
                  </AcaoBotao>
                )}
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao titulo="Ajuste fino" descricao="Liga ou desliga cada etapa individualmente.">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <p className="flex flex-1 items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Toda automação de maior impacto é opcional; decisões automáticas ficam registradas na auditoria.
          </p>
          <Link
            href="/ml/automacoes"
            className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption font-medium text-tech hover:bg-secondary"
          >
            <Clock className="size-4 shrink-0" aria-hidden /> Horários das automações
          </Link>
        </div>
        <Campos campos={CAMPOS} form={form} disabled={!podeEditar || pendente} prefixo="auto" />
        <p className="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
          <Gauge className="size-4" aria-hidden /> Mudar um interruptor não muda o nível acima — o nível é só um atalho.
        </p>
        <BarraSalvar
          sujo={form.sujo}
          valido={form.valido}
          pendente={pendente}
          podeEditar={podeEditar}
          onDescartar={form.descartar}
          onSalvar={async () => {
            if (await salvar("automacao", form.valores)) form.marcarSalvo();
          }}
        />
      </Secao>
    </div>
  );
}
