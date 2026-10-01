"use client";

import { useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompacto, fmtData, fmtNum, type PontoSerie } from "./formato";

/** Lê um token de cor (`--tech: 61 109 132`) para usar no SVG do recharts (segue tema claro/escuro). */
function useCor(token: string, fallback: string) {
  const [cor, setCor] = useState(fallback);
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) setCor(`rgb(${v.split(/\s+/).join(", ")})`);
  }, [token]);
  return cor;
}

export function GraficoSerie({ serie }: { serie: PontoSerie[] }) {
  const corImp = useCor("--tech", "rgb(61, 109, 132)");
  const corOut = useCor("--success", "rgb(47, 142, 111)");
  const corGrade = useCor("--border", "rgb(222, 219, 211)");
  const corTexto = useCor("--muted-foreground", "rgb(90, 96, 102)");

  return (
    <div className="h-72 w-full" role="img" aria-label="Impressões e outbound clicks por dia">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="ml-imp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={corImp} stopOpacity={0.28} />
              <stop offset="100%" stopColor={corImp} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={corGrade} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => fmtData(d, true)}
            tick={{ fontSize: 12, fill: corTexto }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            yAxisId="imp"
            tickFormatter={(v: number) => fmtCompacto(v)}
            tick={{ fontSize: 12, fill: corTexto }}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="out"
            orientation="right"
            tickFormatter={(v: number) => fmtCompacto(v)}
            tick={{ fontSize: 12, fill: corTexto }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            labelFormatter={(d) => fmtData(String(d))}
            formatter={(v, nome) => [fmtNum(Number(v)), nome]}
            contentStyle={{ borderRadius: 12, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Area
            yAxisId="imp"
            type="monotone"
            dataKey="impressions"
            name="Impressões"
            stroke={corImp}
            strokeWidth={2}
            fill="url(#ml-imp)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="out"
            type="monotone"
            dataKey="outbound_clicks"
            name="Outbound clicks"
            stroke={corOut}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
