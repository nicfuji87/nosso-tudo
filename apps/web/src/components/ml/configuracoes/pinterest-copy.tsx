"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, LayoutGrid, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

/** Configurações › Pinterest Copy (spec V2 §9, §11.12). */

const CAMPOS_COPY: CampoSpec[] = [
  {
    tipo: "texto",
    chave: "tom",
    label: "Tom de voz",
    max: 200,
    largo: true,
    placeholder: "Ex.: próximo, prático e inspirador, sem exageros",
    dica: "Como os textos devem soar. Entra no prompt como {tone}.",
  },
  {
    tipo: "textarea",
    chave: "regras_titulo",
    label: "Regras de título",
    max: 500,
    linhas: 3,
    dica: "Enfatize problema, benefício ou intenção — não repita só o nome do produto. Entra como {title_rules}.",
  },
  {
    tipo: "textarea",
    chave: "regras_descricao",
    label: "Regras de descrição",
    max: 800,
    linhas: 4,
    dica: "Explique a utilidade, sem claims não comprovados, preço fixo ou excesso de palavras-chave. Entra como {description_rules}.",
  },
  {
    tipo: "textarea",
    chave: "regra_alt",
    label: "Regra de alt text",
    max: 300,
    linhas: 2,
    dica: "Descrição objetiva e acessível da imagem — não é campo de SEO. Entra como {alt_rules}.",
  },
  {
    tipo: "bool",
    chave: "enviar_ai_disclosure",
    label: "Enviar AI disclosure ao Pinterest",
    dica: "Quando o criativo foi gerado ou modificado por IA, o Pin é criado com o campo oficial da API ai_disclosures = AI_MODIFIED. O flag interno (ai_modified) é sempre registrado no app, com esta opção ligada ou não.",
  },
];

const CAMPOS_DISCLOSURE: CampoSpec[] = [
  {
    tipo: "texto",
    chave: "disclosure",
    label: "Disclosure padrão",
    max: 120,
    largo: true,
    placeholder: "Contém link de afiliado.",
    dica: "Aviso comercial incluído na descrição de cada pacote quando “Exigir disclosure” está ligado em Publicação (até 120 caracteres).",
  },
];

export function FormDisclosure({ config, podeEditar }: { config: ConfigCompleta["geral"]; podeEditar: boolean }) {
  const form = useCampos(CAMPOS_DISCLOSURE, config);
  const { pendente, salvar } = useSalvarSecao();
  return (
    <Secao titulo="Disclosure comercial" descricao="Mesmo campo de Configurações › Geral — alterar aqui altera lá.">
      <Campos campos={CAMPOS_DISCLOSURE} form={form} disabled={!podeEditar || pendente} prefixo="pc-geral" />
      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (await salvar("geral", { disclosure: form.valores.disclosure })) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}

export function FormPinterestCopy({
  config,
  podeEditar,
  aiDisclosureSuportado,
}: {
  config: ConfigCompleta["pinterest_copy"];
  podeEditar: boolean;
  /** `false` quando a conta do Pinterest já recusou o campo `ai_disclosures`. */
  aiDisclosureSuportado: boolean | null;
}) {
  const form = useCampos(CAMPOS_COPY, config);
  const { pendente, salvar } = useSalvarSecao();
  return (
    <Secao
      titulo="Pinterest Copy"
      descricao="Regras usadas para gerar título, descrição e alt text do pacote de cada criativo. O pacote continua editável antes de publicar."
    >
      <Campos campos={CAMPOS_COPY} form={form} disabled={!podeEditar || pendente} prefixo="pc" />

      {aiDisclosureSuportado === false ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-caption">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            A conta conectada do Pinterest recusou o campo <code className="font-mono">ai_disclosures</code>. O app passou a publicar sem ele e mantém o
            flag interno em cada criativo; o Pinterest aplica os próprios mecanismos de detecção e rotulagem.
          </span>
        </p>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-caption text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          <span>
            Se a API recusar o campo, o Pin é criado mesmo assim (sem o campo) e a limitação fica registrada — o app nunca inventa parâmetros que a API
            não aceita.
          </span>
        </p>
      )}

      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (await salvar("pinterest_copy", form.valores)) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}

export function AtalhoBoards({ boardsAtivos }: { boardsAtivos: number }) {
  return (
    <Secao titulo="Board mapping" descricao="Qual board recebe os Pins de cada categoria. O pacote sugere o board pelo mapeamento.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-body-sm text-muted-foreground">
          {boardsAtivos > 0 ? (
            <LayoutGrid className="mt-0.5 size-4 shrink-0 text-tech" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          )}
          <span className="tabular">
            {boardsAtivos > 0
              ? `${boardsAtivos} board${boardsAtivos === 1 ? "" : "s"} ativo${boardsAtivos === 1 ? "" : "s"}. O mapeamento por categoria fica na aba Publicação.`
              : "Nenhum board ativo. Conecte o Pinterest e sincronize os boards para mapear categorias."}
          </span>
        </p>
        <Button asChild size="sm" variant="secondary">
          <Link href="/ml/configuracoes?secao=publicacao#boards">
            Abrir mapeamento <ArrowRight />
          </Link>
        </Button>
      </div>
    </Secao>
  );
}
