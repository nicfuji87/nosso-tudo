"use client";

import { AlertTriangle } from "lucide-react";
import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

const CAMPOS: CampoSpec[] = [
  {
    tipo: "select",
    chave: "modo_imagem_padrao",
    label: "Como criar as artes",
    largo: true,
    opcoes: [
      { valor: "composition", label: "Composição (foto real + texto, sem custo)" },
      { valor: "api", label: "IA (OpenAI) — gera a imagem automaticamente" },
      { valor: "manual_chatgpt", label: "Manual via ChatGPT — o app prepara o pedido, você gera e envia" },
    ],
    dica: "Dá para trocar em cada criativo depois.",
  },
  { tipo: "num", chave: "criativos_por_produto", label: "Criativos por produto", min: 1, max: 5, inteiro: true },
  { tipo: "num", chave: "variacoes", label: "Variações de texto por criativo", min: 1, max: 5, inteiro: true },
  { tipo: "texto", chave: "cta_padrao", label: "Chamada padrão (botão da arte)", max: 40, placeholder: "Veja no Mercado Livre" },
  { tipo: "cor", chave: "cor_fundo", label: "Cor de fundo" },
  { tipo: "cor", chave: "cor_destaque", label: "Cor de destaque" },
  {
    tipo: "bool",
    chave: "mostrar_preco_na_arte",
    label: "Mostrar o preço na arte",
    dica: "Cuidado: o preço no Mercado Livre muda com frequência e o Pin continua no ar por meses.",
  },
];

const cor = (v: unknown, padrao: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : padrao);

export function FormCriativos({ config, podeEditar }: { config: ConfigCompleta["criativos"]; podeEditar: boolean }) {
  const form = useCampos(CAMPOS, config);
  const { pendente, salvar } = useSalvarSecao();
  const fundo = cor(form.estado.cor_fundo, config.cor_fundo);
  const destaque = cor(form.estado.cor_destaque, config.cor_destaque);
  const cta = String(form.estado.cta_padrao || "Veja no Mercado Livre");

  return (
    <Secao titulo="Criativos" descricao="Padrões das artes dos Pins (formato 2:3).">
      <div className="grid gap-6 lg:grid-cols-[1fr_12rem]">
        <div>
          <Campos campos={CAMPOS} form={form} disabled={!podeEditar || pendente} prefixo="cri" />
          {form.estado.mostrar_preco_na_arte === true && (
            <p className="mt-2 flex items-start gap-2 text-caption text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Preço na arte pode ficar desatualizado — o app bloqueia publicações se o
              preço mudar além do limite definido em Publicação.
            </p>
          )}
        </div>
        <figure className="space-y-2">
          <div
            className="flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-xl border border-border/70 p-3 shadow-card"
            style={{ backgroundColor: fundo }}
            aria-hidden
          >
            <div className="aspect-square w-full rounded-lg bg-black/10" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-4/5 rounded bg-black/40" />
              <div className="h-2.5 w-3/5 rounded bg-black/25" />
              <div className="mt-2 truncate rounded-full px-2 py-1 text-center text-[10px] font-semibold text-white" style={{ backgroundColor: destaque }}>
                {cta}
              </div>
            </div>
          </div>
          <figcaption className="text-center text-caption text-muted-foreground">Prévia aproximada das cores</figcaption>
        </figure>
      </div>
      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (await salvar("criativos", form.valores)) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}
