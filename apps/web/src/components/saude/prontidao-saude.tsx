import { BedDouble, Gauge, HeartPulse, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Prontidao } from "@/lib/saude/dados";

const NIVEL = {
  alto: { titulo: "Pode puxar hoje", cor: "#3F9B52" },
  moderado: { titulo: "Treino moderado", cor: "#D9A21B" },
  baixo: { titulo: "Dia de pegar leve", cor: "#E5536A" },
} as const;

/** Anel com a nota do dia (0–100). */
function Anel({ valor, cor }: { valor: number | null; cor: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const f = valor == null ? 0 : Math.max(0, Math.min(1, valor / 100));
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={valor == null ? "Sem nota hoje" : `Prontidão ${valor} de 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-secondary" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="54" textAnchor="middle" className="tabular fill-foreground" style={{ fontSize: 26, fontWeight: 600 }}>
        {valor ?? "—"}
      </text>
      <text x="50" y="70" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>de 100</text>
    </svg>
  );
}

/** Mini-série da queda do batimento ~1 min após o treino (maior = recuperação melhor). */
function Recuperacao({ lista }: { lista: { ts: string; modalidade: string | null; queda1: number }[] }) {
  if (!lista.length) return null;
  const max = Math.max(40, ...lista.map((x) => x.queda1));
  const ultimas = lista.slice(-10);
  const media = Math.round(ultimas.reduce((s, x) => s + x.queda1, 0) / ultimas.length);
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
        <TrendingDown className="size-3.5 text-[#E5536A]" /> Recuperação pós-treino
      </p>
      <div className="mt-2 flex h-10 items-end gap-1" role="img"
        aria-label={ultimas.map((x) => `${x.modalidade ?? "treino"}: caiu ${x.queda1} bpm em 1 min`).join("; ")}>
        {ultimas.map((x) => (
          <div key={x.ts} className="w-3 rounded-sm bg-[#E5536A]/70" style={{ height: `${Math.max(8, (x.queda1 / max) * 100)}%` }}
            title={`${x.modalidade ?? "treino"} · −${x.queda1} bpm em ~1 min`} />
        ))}
      </div>
      <p className="tabular mt-1 text-caption text-muted-foreground">
        cai em média <span className="font-semibold text-foreground">{media} bpm</span> no 1º minuto · quanto mais, melhor o condicionamento
      </p>
    </div>
  );
}

export function ProntidaoSaude({ p, recuperacoes }: { p: Prontidao | null; recuperacoes: { ts: string; modalidade: string | null; queda1: number }[] }) {
  if (!p) return null;
  const n = p.nivel ? NIVEL[p.nivel] : null;
  const cor = n?.cor ?? "#8A9097";
  const razao = p.carga.razao;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6">
      <div className="pointer-events-none absolute -left-16 -bottom-16 size-56 rounded-full opacity-[0.07]"
        style={{ background: `radial-gradient(circle, ${cor} 0%, transparent 70%)` }} />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-body font-semibold tracking-tight">
            <Gauge className="size-5" style={{ color: cor }} /> Prontidão de hoje
          </h2>
          <p className="text-caption text-muted-foreground">
            repouso, VFC, sono, carga e radar · prontidao-v1 · {p.calibrando ? "aprendendo o seu normal (repouso e VFC entram com 3 noites)" : "comparado com o seu normal"}
          </p>
        </div>
      </div>

      <div className="relative mt-4 grid gap-5 md:grid-cols-[auto_1fr_1fr] md:items-center">
        <div className="flex items-center gap-4">
          <Anel valor={p.score} cor={cor} />
          <div>
            <p className="text-h4 font-semibold" style={{ color: cor }}>{n?.titulo ?? "Sem noite medida"}</p>
            <ul className="mt-1 space-y-0.5 text-caption text-muted-foreground">
              {p.fatores.length ? p.fatores.map((f) => (
                <li key={f.sinal} className="tabular">
                  <span className={cn("font-semibold", f.efeito <= -10 ? "text-warning" : f.efeito < 0 ? "text-foreground" : "text-success")}>
                    {f.efeito < 0 ? `−${-f.efeito}` : "ok"}
                  </span>{" "}· {f.texto}
                </li>
              )) : <li>Durma com o relógio para a nota sair de manhã.</li>}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div className="rounded-xl border border-border/70 p-3">
            <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <BedDouble className="size-3.5 text-[#6E7FE0]" /> Hora de dormir
            </p>
            <p className="tabular text-h4 font-semibold">{p.sono.deitar ?? "—"}</p>
            <p className="text-caption text-muted-foreground">
              {p.sono.acordar ? `para acordar ${p.sono.acordar} com 7h30 de sono` : `aparece com 3 noites (${p.sono.noites}/3)`}
              {p.sono.regularidadeMin != null && ` · horário de deitar varia ±${p.sono.regularidadeMin} min`}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <HeartPulse className="size-3.5 text-[#F08A3C]" /> Carga 7 dias × habitual
            </p>
            <p className={cn("tabular text-h4 font-semibold", razao != null && razao > 1.3 && "text-warning")}>
              {razao != null ? `${String(razao).replace(".", ",")}×` : p.carga.aguda}
            </p>
            <p className="text-caption text-muted-foreground">
              {razao != null
                ? `${p.carga.aguda} nesta semana · média ${p.carga.cronicaSemana}/semana (28 d) · acima de 1,3× aumenta o risco de lesão`
                : "carga desta semana · a comparação com o seu habitual começa com 3 semanas de dados"}
            </p>
          </div>
        </div>

        <Recuperacao lista={recuperacoes} />
      </div>
    </section>
  );
}
