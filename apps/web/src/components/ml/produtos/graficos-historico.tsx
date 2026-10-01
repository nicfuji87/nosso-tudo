"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatarNoFuso } from "@/lib/ml/tempo";

export interface PontoSerie {
  t: number; // epoch ms
  v: number;
}

const COR = "rgb(var(--tech))";
const GRADE = "rgb(var(--border))";
const TEXTO = "rgb(var(--muted-foreground))";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_CURTO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function SemDados({ texto }: { texto: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-center text-body-sm text-muted-foreground">
      {texto}
    </div>
  );
}

function Grafico({
  dados,
  tz,
  invertido,
  formatarY,
  nome,
}: {
  dados: PontoSerie[];
  tz: string;
  invertido?: boolean;
  formatarY: (v: number) => string;
  nome: string;
}) {
  const dia = (t: number) => formatarNoFuso(new Date(t), tz, { day: "2-digit", month: "2-digit" });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRADE} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={dia}
          tick={{ fill: TEXTO, fontSize: 11 }}
          stroke={GRADE}
          minTickGap={24}
        />
        <YAxis
          dataKey="v"
          reversed={invertido}
          allowDecimals={!invertido}
          domain={invertido ? [1, "dataMax"] : ["auto", "auto"]}
          tickFormatter={formatarY}
          tick={{ fill: TEXTO, fontSize: 11 }}
          stroke={GRADE}
          width={invertido ? 36 : 64}
        />
        <Tooltip
          labelFormatter={(t) => formatarNoFuso(new Date(Number(t)), tz, { dateStyle: "short", timeStyle: "short" })}
          formatter={(v) => [formatarY(Number(v)), nome]}
          contentStyle={{
            background: "rgb(var(--card))",
            border: "1px solid rgb(var(--border))",
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        <Line type="monotone" dataKey="v" stroke={COR} strokeWidth={2} dot={dados.length < 30 ? { r: 2.5 } : false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GraficoPreco({ dados, tz }: { dados: PontoSerie[]; tz: string }) {
  if (dados.length < 2) return <SemDados texto={dados.length ? "Só uma coleta de preço até agora." : "Sem histórico de preço."} />;
  return <Grafico dados={dados} tz={tz} formatarY={(v) => (v >= 1000 ? BRL_CURTO.format(v) : BRL.format(v))} nome="Preço" />;
}

export function GraficoRanking({ dados, tz }: { dados: PontoSerie[]; tz: string }) {
  if (dados.length < 2)
    return <SemDados texto={dados.length ? "Só uma coleta de ranking até agora." : "Sem histórico de ranking."} />;
  return <Grafico dados={dados} tz={tz} invertido formatarY={(v) => `#${Math.round(v)}`} nome="Posição" />;
}
