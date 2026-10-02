"use client";

import Link from "next/link";
import { GitBranch, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

const CAMPOS: CampoSpec[] = [
  { tipo: "texto", chave: "modelo_texto", label: "Modelo de texto", max: 80, dica: "Análises, ângulos e textos dos Pins." },
  { tipo: "texto", chave: "modelo_imagem", label: "Modelo de imagem", max: 80, dica: "Usado quando a arte é gerada por IA." },
  {
    tipo: "texto",
    chave: "modelo_visao",
    label: "Modelo de visão e fidelidade",
    max: 80,
    dica: "Descreve as imagens para o pacote Pinterest e compara a arte gerada com as fotos reais do produto.",
  },
  {
    tipo: "select",
    chave: "modo",
    label: "Modo",
    opcoes: [
      { valor: "economico", label: "Econômico — respostas mais curtas, menor custo" },
      { valor: "qualidade", label: "Qualidade — análise mais detalhada, custo maior" },
    ],
  },
  {
    tipo: "select",
    chave: "qualidade_imagem",
    label: "Qualidade das imagens geradas",
    opcoes: [
      { valor: "low", label: "Baixa — mais barata, boa para testes" },
      { valor: "medium", label: "Média — recomendada" },
      { valor: "high", label: "Alta — mais cara" },
    ],
  },
  {
    tipo: "select",
    chave: "variacao",
    label: "Criatividade dos textos",
    opcoes: [
      { valor: "conservadora", label: "Conservadora — direta, sem invenção" },
      { valor: "equilibrada", label: "Equilibrada" },
      { valor: "criativa", label: "Criativa — mais variação entre versões" },
    ],
  },
  {
    tipo: "textarea",
    chave: "instrucoes_extras",
    label: "Instruções extras para a IA (prompt base)",
    max: 2000,
    linhas: 6,
    placeholder: "Ex.: Escreva em tom acolhedor, sem exageros. Nunca prometa resultados. Evite a palavra “imperdível”.",
    dica: "Somadas às instruções internas em toda geração de texto (até 2000 caracteres).",
  },
];

const preco = (chave: string, label: string, dica: string): CampoSpec => ({
  tipo: "num",
  chave,
  label,
  min: 0,
  max: 100,
  passo: 0.001,
  sufixo: "US$",
  dica,
});

const CAMPOS_PRECO: CampoSpec[] = [
  preco("preco_imagem_low", "Imagem — qualidade baixa", "Por imagem gerada."),
  preco("preco_imagem_medium", "Imagem — qualidade média", "Por imagem gerada."),
  preco("preco_imagem_high", "Imagem — qualidade alta", "Por imagem gerada."),
  preco("preco_texto", "Texto", "Por chamada de texto (copy, ângulos, análise)."),
  preco("preco_visao", "Visão", "Por análise de imagem (descrição e checagem de fidelidade)."),
];

const TODOS = [...CAMPOS, ...CAMPOS_PRECO];

export function FormIA({ config, versao, podeEditar }: { config: ConfigCompleta["ia"]; versao: number; podeEditar: boolean }) {
  const form = useCampos(TODOS, config);
  const { pendente, salvar } = useSalvarSecao();
  const restantes = 2000 - String(form.estado.instrucoes_extras ?? "").length;
  return (
    <Secao
      titulo="Inteligência artificial"
      descricao={
        <>
          Como a OpenAI é usada. A chave e a lista de modelos ficam em{" "}
          <Link href="/ml/integracoes#openai" className="text-tech underline-offset-4 hover:underline">
            Integrações › OpenAI
          </Link>
          .
        </>
      }
      acoes={
        <Badge variant="tech" title="Versão das configurações de IA">
          <GitBranch className="size-3.5" aria-hidden /> Prompt base v{versao}
        </Badge>
      }
    >
      <p className="mb-4 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
        Cada vez que você salva, as configurações de IA ganham uma nova versão. Todo conteúdo gerado registra a versão usada — assim dá para comparar
        resultados entre versões.
      </p>
      <Campos campos={CAMPOS} form={form} disabled={!podeEditar || pendente} prefixo="ia" />
      <p className="mt-1 text-right text-caption text-muted-foreground tabular">{restantes} caracteres restantes</p>
      <div className="mt-6 border-t border-border/70 pt-5">
        <h3 className="text-body-sm font-semibold">Preços estimados (USD)</h3>
        <p className="mb-3 mt-0.5 flex items-start gap-1.5 text-caption text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Só alimentam a estimativa de custo dos lotes (wizard e limite por lote). Não alteram a cobrança da OpenAI — ajuste conforme a tabela vigente.
        </p>
        <Campos campos={CAMPOS_PRECO} form={form} disabled={!podeEditar || pendente} prefixo="ia-preco" className="lg:grid-cols-3" />
      </div>
      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        rotulo="Salvar nova versão"
        onSalvar={async () => {
          if (await salvar("ia", form.valores)) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}
