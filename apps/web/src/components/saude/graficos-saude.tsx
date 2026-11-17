"use client";

import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Noite, PontoBpm, TrechoRelogio } from "@/lib/saude/dados";

/** Lê um token de cor (`--x: r g b`) para o SVG do recharts (segue tema claro/escuro). */
function useCor(token: string, fallback: string) {
  const [cor, setCor] = useState(fallback);
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) setCor(`rgb(${v.split(/\s+/).join(", ")})`);
  }, [token]);
  return cor;
}

const TZ = "America/Sao_Paulo";
const hora = (v: number | string) => new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dia = (d: string) => {
  const [, m, dd] = d.split("-");
  return `${Number(dd)}/${Number(m)}`;
};

// Cores das métricas (as mesmas do relógio)
export const COR = { coracao: "#E5536A", vfc: "#8B6CE0", treino: "#F08A3C", malestar: "#D6336C", sono: "#6E7FE0" };

const estiloTooltip = { borderRadius: 12, fontSize: 12, border: "1px solid rgb(0 0 0 / 0.08)", boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)" };

/** Batimento das últimas 24 h, com treinos sombreados e mal-estar marcados. */
const COR_RELOGIO: Record<TrechoRelogio["tipo"], string> = { carregando: "#D9A21B", fora_do_pulso: "#8A9097", sem_leitura: "#B9BEC4" };

export function GraficoBpm({
  pontos, treinos = [], marcas = [], relogio = [],
}: {
  pontos: PontoBpm[]; treinos?: { inicio: string; fim: string; rotulo: string }[]; marcas?: { ts: string; rotulo: string }[];
  relogio?: TrechoRelogio[];
}) {
  const grade = useCor("--border", "rgb(222, 219, 211)");
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  // Lacunas (> 3 min sem leitura) ficam em branco em vez de virarem uma reta enganosa.
  const dados: { t: number; bpm: number | null }[] = [];
  for (const p of pontos) {
    const t = new Date(p.minuto).getTime();
    const ant = dados.at(-1);
    if (ant && t - ant.t > 3 * 60_000) dados.push({ t: ant.t + 60_000, bpm: null });
    dados.push({ t, bpm: p.bpm });
  }
  const t0 = dados[0]?.t ?? 0;
  const t1 = dados.at(-1)?.t ?? 0;
  return (
    <div className="h-64 w-full" role="img" aria-label="Batimento por minuto nas últimas 24 horas, com treinos e mal-estar marcados">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="saude-bpm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR.coracao} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COR.coracao} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grade} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={hora}
            tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} minTickGap={56} />
          {relogio.map((r) => {
            const a = Math.max(new Date(r.inicio).getTime(), t0);
            const b = Math.min(new Date(r.fim).getTime(), t1);
            if (b <= a) return null;
            const rotulo = r.tipo === "carregando"
              ? `⚡ ${r.bateriaInicio ?? "?"}%→${r.bateriaFim ?? "?"}%`
              : r.tipo === "fora_do_pulso" ? "fora do pulso" : "";
            return (
              <ReferenceArea key={`${r.tipo}-${r.inicio}`} x1={a} x2={b} fill={COR_RELOGIO[r.tipo]}
                fillOpacity={r.tipo === "carregando" ? 0.14 : 0.1} strokeOpacity={0}
                label={rotulo ? { value: rotulo, position: "insideBottom", fill: COR_RELOGIO[r.tipo], fontSize: 11, fontWeight: 600 } : undefined} />
            );
          })}
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 12, fill: texto }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          {treinos.map((t) => {
            const a = Math.max(new Date(t.inicio).getTime(), t0);
            const b = Math.min(new Date(t.fim).getTime(), t1);
            return b > a ? (
              <ReferenceArea key={t.inicio} x1={a} x2={b} fill={COR.treino} fillOpacity={0.1} stroke={COR.treino} strokeOpacity={0.25}
                label={{ value: t.rotulo, position: "insideTopLeft", fill: COR.treino, fontSize: 11, fontWeight: 600 }} />
            ) : null;
          })}
          {marcas.map((m) => (
            <ReferenceLine key={m.ts} x={new Date(m.ts).getTime()} stroke={COR.malestar} strokeDasharray="4 3"
              label={{ value: m.rotulo, position: "top", fill: COR.malestar, fontSize: 11, fontWeight: 600 }} />
          ))}
          <Tooltip labelFormatter={(v) => hora(Number(v))} formatter={(v) => [`${v} bpm`, "média do minuto"]} contentStyle={estiloTooltip} />
          <Area type="monotone" dataKey="bpm" stroke={COR.coracao} strokeWidth={2} fill="url(#saude-bpm)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** FC de repouso e VFC por noite, cada uma com a linha do seu normal (mediana). */
export function GraficoNoites({ noites, normalFc, normalVfc, normalTemp }: { noites: Noite[]; normalFc: number | null; normalVfc: number | null; normalTemp: number | null }) {
  const grade = useCor("--border", "rgb(222, 219, 211)");
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  const dados = noites.filter((n) => n.fcRepouso != null || n.vfc != null || n.temp != null);
  const eixo = { tick: { fontSize: 12, fill: texto }, tickLine: false, axisLine: false } as const;
  const series = [
    { chave: "fcRepouso", nome: "FC de repouso", unidade: "bpm", cor: COR.coracao, normal: normalFc },
    { chave: "vfc", nome: "VFC noturna", unidade: "ms", cor: COR.vfc, normal: normalVfc },
    { chave: "temp", nome: "Pele à noite", unidade: "°C", cor: COR.treino, normal: normalTemp },
  ] as const;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {series.map((s) => (
        <div key={s.chave}>
          <p className="mb-1 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: s.cor }} /> {s.nome}
            {s.normal != null && <span className="tabular ml-auto">seu normal ≈ {s.chave === "temp" ? s.normal.toFixed(1).replace(".", ",") : Math.round(s.normal)} {s.unidade}</span>}
          </p>
          <div className="h-40 w-full" role="img" aria-label={`${s.nome} por noite`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={grade} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="noite" tickFormatter={dia} {...eixo} minTickGap={24} />
                <YAxis domain={s.chave === "temp" ? ["dataMin - 0.5", "dataMax + 0.5"] : ["dataMin - 4", "dataMax + 4"]} {...eixo} width={40}
                  allowDecimals={s.chave === "temp"} tickFormatter={(v: number) => (s.chave === "temp" ? v.toFixed(1) : String(v))} />
                {s.normal != null && <ReferenceLine y={s.normal} stroke={s.cor} strokeOpacity={0.35} strokeDasharray="5 4" />}
                <Tooltip labelFormatter={(v) => `noite de ${dia(String(v))}`} formatter={(v) => [`${v} ${s.unidade}`, s.nome]} contentStyle={estiloTooltip} />
                <Line type="monotone" dataKey={s.chave} stroke={s.cor} strokeWidth={2.5} dot={{ r: 3, fill: s.cor }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mini gráfico do batimento em volta de um mal-estar (−10 a +10 min). */
export function MiniBpm({ pontos, momento }: { pontos: PontoBpm[]; momento: string }) {
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  const dados = pontos.map((p) => ({ t: new Date(p.minuto).getTime(), bpm: p.bpm }));
  if (dados.length < 2) return <p className="py-3 text-caption text-muted-foreground">Sem batimento medido nesses 20 minutos (relógio fora do pulso?).</p>;
  return (
    <div className="h-28 w-full" role="img" aria-label="Batimento de 10 minutos antes a 10 minutos depois do mal-estar">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 14, right: 6, bottom: 0, left: -24 }}>
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={hora}
            tick={{ fontSize: 11, fill: texto }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 11, fill: texto }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ReferenceLine x={new Date(momento).getTime()} stroke={COR.malestar} strokeDasharray="4 3" label={{ value: "registro", position: "top", fill: COR.malestar, fontSize: 10 }} />
          <Tooltip labelFormatter={(v) => hora(Number(v))} formatter={(v) => [`${v} bpm`, "batimento"]} contentStyle={estiloTooltip} />
          <Line type="monotone" dataKey="bpm" stroke={COR.coracao} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bateria nas últimas 24 h, com as cargas sombreadas. */
export function MiniBateria({ pontos, cargas }: { pontos: { ts: string; bateria: number }[]; cargas: TrechoRelogio[] }) {
  const texto = useCor("--muted-foreground", "rgb(90, 96, 102)");
  const dados = pontos.map((p) => ({ t: new Date(p.ts).getTime(), b: p.bateria }));
  if (dados.length < 2) return null;
  const t0 = dados[0]!.t, t1 = dados.at(-1)!.t;
  return (
    <div className="h-24 w-full" role="img" aria-label="Bateria do relógio nas últimas 24 horas">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id="saude-bat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3F9B52" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3F9B52" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={hora}
            tick={{ fontSize: 10, fill: texto }} tickLine={false} axisLine={false} minTickGap={48} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: texto }} tickLine={false} axisLine={false} width={36} />
          {cargas.map((c) => {
            const a = Math.max(new Date(c.inicio).getTime(), t0), b = Math.min(new Date(c.fim).getTime(), t1);
            return b > a ? <ReferenceArea key={c.inicio} x1={a} x2={b} fill="#D9A21B" fillOpacity={0.15} strokeOpacity={0} /> : null;
          })}
          <Tooltip labelFormatter={(v) => hora(Number(v))} formatter={(v) => [`${v}%`, "bateria"]} contentStyle={estiloTooltip} />
          <Area type="stepAfter" dataKey="b" stroke="#3F9B52" strokeWidth={2} fill="url(#saude-bat)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
