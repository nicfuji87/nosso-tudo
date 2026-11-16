"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PontoBpm, PontoVfcDia } from "@/lib/saude/dados";

/** Lê um token de cor (`--x: r g b`) para o SVG do recharts (segue tema claro/escuro). */
function useCor(token: string, fallback: string) {
  const [cor, setCor] = useState(fallback);
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) setCor(`rgb(${v.split(/\s+/).join(", ")})`);
  }, [token]);
  return cor;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dia = (d: string) => {
  const [, m, dd] = d.split("-");
  return `${Number(dd)}/${Number(m)}`;
};

// Cores das métricas (as mesmas do relógio)
const COR_CORACAO = "#E5536A";
const COR_VFC = "#8B6CE0";

export function GraficoBpm({ pontos }: { pontos: PontoBpm[] }) {
  const grade = useCor("--border", "rgb(222, 219, 211)");
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  return (
    <div className="h-56 w-full" role="img" aria-label="Batimento por minuto nas últimas 24 horas">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="saude-bpm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR_CORACAO} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COR_CORACAO} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grade} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="minuto" tickFormatter={hora} tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} minTickGap={48} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => hora(String(v))}
            formatter={(v) => [`${v} bpm`, "batimento"]}
            contentStyle={{ borderRadius: 12, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="bpm" stroke={COR_CORACAO} strokeWidth={2} fill="url(#saude-bpm)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoVfc({ dias }: { dias: PontoVfcDia[] }) {
  const grade = useCor("--border", "rgb(222, 219, 211)");
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  return (
    <div className="h-56 w-full" role="img" aria-label="VFC (RMSSD) diária, mediana das janelas de 5 minutos">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dias} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={grade} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dia" tickFormatter={dia} tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} />
          <YAxis domain={["dataMin - 10", "dataMax + 10"]} tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => dia(String(v))}
            formatter={(v, _n, item) => [`${v} ms · ${(item?.payload as PontoVfcDia | undefined)?.janelas ?? 0} janelas`, "RMSSD"]}
            contentStyle={{ borderRadius: 12, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="rmssd" stroke={COR_VFC} strokeWidth={2.5} dot={{ r: 3, fill: COR_VFC }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
