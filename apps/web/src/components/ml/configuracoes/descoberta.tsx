"use client";

import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

const CAMPOS: CampoSpec[] = [
  { tipo: "num", chave: "max_por_categoria", label: "Produtos por categoria (por rodada)", min: 1, max: 50, inteiro: true, dica: "Quantos produtos do ranking entram para análise." },
  { tipo: "num", chave: "score_minimo_recomendar", label: "Score mínimo para recomendar", min: 0, max: 100, sufixo: "pts", dica: "Abaixo disso o produto nem aparece nas descobertas." },
  { tipo: "num", chave: "cooldown_descarte_dias", label: "Não sugerir de novo um descartado por", min: 0, max: 365, inteiro: true, sufixo: "dias" },
  { tipo: "num", chave: "repromover_apos_dias", label: "Permitir divulgar de novo após", min: 0, max: 365, inteiro: true, sufixo: "dias", dica: "Para produtos que já viraram Pin." },
  {
    tipo: "bool",
    chave: "incluir_subcategorias",
    label: "Olhar as subcategorias das categorias marcadas",
    dica: "Necessário quando você marca uma categoria “mãe”: o ranking de mais vendidos só existe nas categorias finais.",
  },
  { tipo: "num", chave: "max_subcategorias", label: "Máximo de subcategorias por categoria", min: 0, max: 30, inteiro: true, dependeDe: "incluir_subcategorias" },
  { tipo: "bool", chave: "usar_tendencias", label: "Usar as buscas em alta do Mercado Livre", dica: "Palavras que estão crescendo nas buscas ajudam no score de tendência." },
  {
    tipo: "bool",
    chave: "tendencias_buscar_produtos",
    label: "Buscar produtos a partir das tendências",
    dependeDe: "usar_tendencias",
    dica: "Além de pontuar, procura produtos novos para as palavras em alta.",
  },
  { tipo: "num", chave: "tendencias_palavras", label: "Palavras em alta por categoria", min: 0, max: 20, inteiro: true, dependeDe: "usar_tendencias" },
  { tipo: "num", chave: "tendencias_produtos_por_palavra", label: "Produtos por palavra em alta", min: 1, max: 10, inteiro: true, dependeDe: "usar_tendencias" },
  {
    tipo: "bool",
    chave: "enriquecer_com_apify",
    label: "Completar dados com o Apify",
    dica: "Busca avaliações e vendas que faltarem. Só funciona com o Apify configurado em Integrações; sem ele, nada muda.",
  },
];

export function FormDescoberta({ config, podeEditar }: { config: ConfigCompleta["descoberta"]; podeEditar: boolean }) {
  const form = useCampos(CAMPOS, config);
  const { pendente, salvar } = useSalvarSecao();
  return (
    <Secao titulo="Descoberta" descricao="Quantos produtos buscar, quando repetir e de onde tirar ideias.">
      <Campos campos={CAMPOS} form={form} disabled={!podeEditar || pendente} prefixo="desc" />
      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (await salvar("descoberta", form.valores)) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}
