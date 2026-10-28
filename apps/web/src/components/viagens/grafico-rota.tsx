"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dataCurta, reais } from "@/lib/viagens/formato";

/** Lê um token de cor do tema para usar no SVG do recharts (segue claro/escuro). */
function useCor(token: string, fallback: string) {
  const [cor, setCor] = useState(fallback);
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) setCor(`rgb(${v.split(/\s+/).join(", ")})`);
  }, [token]);
  return cor;
}

export interface PontoRota {
  data: string;
  milhas: number | null;
  dinheiro: number | null;
}

/** Evolução do melhor custo por pessoa (R$) — em milhas e em dinheiro. */
export function GraficoRota({ pontos }: { pontos: PontoRota[] }) {
  const corMilhas = useCor("--tech", "rgb(61, 109, 132)");
  const corDinheiro = useCor("--accent", "rgb(214, 160, 62)");
  const corGrade = useCor("--border", "rgb(222, 219, 211)");
  const corTexto = useCor("--muted-foreground", "rgb(90, 96, 102)");

  return (
    <div className="h-40 w-full" role="img" aria-label="Evolução do melhor preço por pessoa">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={corGrade} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={(d: string) => dataCurta(d).slice(0, 5)}
            tick={{ fontSize: 11, fill: corTexto }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => `R$${Math.round(v / 100_000)}k`}
            tick={{ fontSize: 11, fill: corTexto }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            formatter={(v: number, nome: string) => [reais(v), nome === "milhas" ? "Em milhas" : "Em dinheiro"]}
            labelFormatter={(d: string) => dataCurta(d)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="milhas" stroke={corMilhas} strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="dinheiro" stroke={corDinheiro} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
