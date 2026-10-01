"use client";

import { useMemo } from "react";
import { Secao } from "@/components/ml/campos";
import type { ConfigCompleta } from "@/lib/ml/config";
import { BarraSalvar, Campos, useCampos, useSalvarSecao, type CampoSpec } from "./form";

const NOMES_FUSO: Record<string, string> = {
  "America/Sao_Paulo": "Brasília / São Paulo (UTC−3)",
  "America/Manaus": "Manaus (UTC−4)",
  "America/Fortaleza": "Fortaleza / Nordeste (UTC−3)",
  "America/Cuiaba": "Cuiabá (UTC−4)",
  "America/Noronha": "Fernando de Noronha (UTC−2)",
  UTC: "UTC (horário universal)",
};

export function FormGeral({ config, fusos, podeEditar }: { config: ConfigCompleta["geral"]; fusos: string[]; podeEditar: boolean }) {
  const campos = useMemo<CampoSpec[]>(() => {
    const lista = fusos.includes(config.timezone) ? fusos : [config.timezone, ...fusos];
    return [
      {
        tipo: "select",
        chave: "timezone",
        label: "Fuso horário",
        dica: "Usado em todas as datas da tela, nos horários de publicação e nas automações.",
        opcoes: lista.map((f) => ({ valor: f, label: NOMES_FUSO[f] ?? f })),
      },
      {
        tipo: "texto",
        chave: "disclosure",
        label: "Aviso de afiliado",
        max: 120,
        placeholder: "Contém link de afiliado.",
        dica: "Texto curto incluído nos Pins para deixar claro que há link de afiliado (até 120 caracteres).",
      },
      {
        tipo: "bool",
        chave: "exigir_link_afiliado",
        label: "Só publicar com link de afiliado",
        dica: "Recomendado. Sem isso, um Pin poderia sair com o link comum do Mercado Livre — e você não ganha comissão.",
      },
    ];
  }, [fusos, config.timezone]);
  const form = useCampos(campos, config);
  const { pendente, salvar } = useSalvarSecao();

  return (
    <Secao titulo="Geral" descricao="Preferências que valem para toda a área de afiliados.">
      <Campos campos={campos} form={form} disabled={!podeEditar || pendente} prefixo="geral" />
      <BarraSalvar
        sujo={form.sujo}
        valido={form.valido}
        pendente={pendente}
        podeEditar={podeEditar}
        onDescartar={form.descartar}
        onSalvar={async () => {
          if (await salvar("geral", form.valores)) form.marcarSalvo();
        }}
      />
    </Secao>
  );
}
