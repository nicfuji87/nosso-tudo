import { Radar as IconeRadar, HeartPulse, Activity, Thermometer, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Desvio, NivelRadar, PlacarRadar, RadarNoite } from "@/lib/saude/dados";

const NIVEL: Record<NivelRadar | "sem", { rotulo: string; descricao: string; classe: string; ponto: string }> = {
  estresse: { rotulo: "Corpo sob estresse", descricao: "2 ou mais sinais fora do normal por 2 noites, ou 3 juntos.", classe: "bg-warning/12 text-warning border-warning/30", ponto: "bg-warning" },
  observar: { rotulo: "Observar", descricao: "Algum sinal fora do normal esta noite. Uma noite isolada costuma dizer pouco.", classe: "bg-info/10 text-info border-info/25", ponto: "bg-info" },
  normal: { rotulo: "Dentro do seu normal", descricao: "Repouso, VFC, pele e SpO₂ dentro da sua faixa.", classe: "bg-success/10 text-success border-success/25", ponto: "bg-success" },
  calibrando: { rotulo: "Conhecendo o seu normal", descricao: "O radar começa a comparar com 7 noites medidas e se firma em 28.", classe: "bg-secondary text-muted-foreground border-border", ponto: "bg-muted-foreground" },
  sem: { rotulo: "Sem noite medida hoje", descricao: "Durma com o relógio: com 3 h ou mais de leitura entre 22h e 8h, o radar avalia a noite.", classe: "bg-secondary text-muted-foreground border-border", ponto: "bg-muted-foreground" },
};

const fmt = (v: number, casas = 0) => v.toFixed(casas).replace(".", ",");

function Sinal({ icone: Icone, cor, nome, valor, unidade, normal, delta, fora, casas = 0, pct = false }: {
  icone: typeof HeartPulse; cor: string; nome: string; valor: number | null; unidade: string; normal: number | null;
  delta: Desvio | null; fora: boolean; casas?: number; pct?: boolean;
}) {
  const d = delta ? (pct ? delta.deltaPct : delta.delta) : null;
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", fora ? "border-warning/40 bg-warning/[0.06]" : "border-border/70")}>
      <div className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
        <Icone className="size-3.5" style={{ color: cor }} /> {nome}
        {fora && <span className="ml-auto rounded-full bg-warning/15 px-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-warning">fora</span>}
      </div>
      <p className="tabular mt-1 text-h4 font-semibold">
        {valor != null ? fmt(valor, casas) : "—"}<span className="ml-0.5 text-caption font-normal text-muted-foreground">{unidade}</span>
      </p>
      <p className="tabular text-caption text-muted-foreground">
        {normal != null ? <>normal {fmt(normal, casas)}{d != null && Math.abs(d) >= (pct ? 1 : casas ? 0.05 : 0.5) && <> · {d > 0 ? "+" : "−"}{fmt(Math.abs(d), pct ? 0 : casas)}{pct ? "%" : ""}</>}</> : "calibrando"}
      </p>
    </div>
  );
}

const diaCurto = (d: string) => String(Number(d.slice(8, 10)));

export function RadarSaude({ radar, hoje, desvioFc, desvioVfc, desvioTemp, placar }: {
  radar: RadarNoite[]; hoje: string; desvioFc: Desvio | null; desvioVfc: Desvio | null; desvioTemp: Desvio | null; placar: PlacarRadar;
}) {
  const atual = radar[0]?.noite === hoje ? radar[0] : undefined;
  const nivel = NIVEL[atual?.nivel ?? "sem"];
  const ultimas = [...radar].slice(0, 14).reverse();
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #8B6CE0 0%, transparent 70%)" }} />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-body font-semibold tracking-tight">
            <IconeRadar className="size-5 text-[#8B6CE0]" /> Radar de Saúde
          </h2>
          <p className="text-caption text-muted-foreground">sua noite comparada com o seu normal · radar-v2 · não é diagnóstico</p>
        </div>
        <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-caption font-semibold", nivel.classe)}>
          <span className={cn("size-2 rounded-full", nivel.ponto)} /> {nivel.rotulo}
        </span>
      </div>
      <p className="relative mt-2 text-body-sm text-muted-foreground">{nivel.descricao}</p>

      <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Sinal icone={HeartPulse} cor="#E5536A" nome="Repouso" unidade="bpm" valor={atual?.fc ?? null} normal={atual?.fcNormal ?? null} delta={desvioFc} fora={!!atual?.fcFora} />
        <Sinal icone={Activity} cor="#8B6CE0" nome="VFC" unidade="ms" valor={atual?.vfc ?? null} normal={atual?.vfcNormal ?? null} delta={desvioVfc} fora={!!atual?.vfcFora} pct />
        <Sinal icone={Thermometer} cor="#F08A3C" nome="Pele" unidade="°C" valor={atual?.temp ?? null} normal={atual?.tempNormal ?? null} delta={desvioTemp} fora={!!atual?.tempFora} casas={1} />
        <Sinal icone={Droplets} cor="#1FA9B0" nome="SpO₂" unidade="%" valor={atual?.spo2 ?? null} normal={atual?.spo2Normal ?? null}
          delta={atual?.spo2 != null && atual.spo2Normal != null ? { valor: atual.spo2, normal: atual.spo2Normal, delta: atual.spo2 - atual.spo2Normal, deltaPct: 0, noites: atual.base } : null}
          fora={!!atual?.spo2Fora} />
      </div>

      {ultimas.length > 0 && (
        <div className="relative mt-5">
          <p className="mb-2 text-caption font-medium text-muted-foreground">Últimas noites</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="img"
            aria-label={ultimas.map((r) => `noite ${diaCurto(r.noite)}: ${NIVEL[r.nivel].rotulo}`).join("; ")}>
            {ultimas.map((r) => (
              <div key={r.noite} className="flex min-w-[2rem] flex-col items-center gap-1" title={`${r.noite.split("-").reverse().join("/")}: ${NIVEL[r.nivel].rotulo}${r.doente ? " · marcado doente" : ""}`}>
                {([["fcFora", "fc"], ["vfcFora", "vfc"], ["tempFora", "temp"], ["spo2Fora", "spo2"]] as const).map(([k, v]) => (
                  <span key={k} className={cn("size-2.5 rounded-full", r[v] == null ? "bg-secondary" : r[k] ? "bg-warning" : "bg-success/60")} />
                ))}
                <span className={cn("mt-0.5 h-1 w-5 rounded-full", NIVEL[r.nivel].ponto, r.nivel === "normal" && "opacity-40")} />
                <span className="tabular text-[0.625rem] text-muted-foreground">{diaCurto(r.noite)}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">bolinhas: repouso · VFC · pele · SpO₂ (laranja = fora do normal, cinza = sem dado)</p>
        </div>
      )}

      <div className="relative mt-4 rounded-xl bg-secondary/60 p-3 text-caption text-muted-foreground">
        {placar.episodios > 0 || placar.avisos > 0 ? (
          <>
            <span className="font-semibold text-foreground">Placar: </span>
            {placar.episodios > 0 ? `de ${placar.episodios} vez${placar.episodios > 1 ? "es" : ""} que você ficou doente, o radar avisou antes em ${placar.avisadosAntes}. ` : ""}
            {placar.avisos > 0 ? `${placar.avisos} aviso${placar.avisos > 1 ? "s" : ""}${placar.avisosSemNada ? `, ${placar.avisosSemNada} sem doença depois` : ""}.` : "Nenhum aviso até agora."}
          </>
        ) : (
          <>Quando ficar doente, marque <span className="font-semibold text-foreground">Diário › Fiquei doente</span>: é assim que o placar mostra se o radar avisa antes — e quantas vezes avisa à toa.</>
        )}
      </div>
    </section>
  );
}
