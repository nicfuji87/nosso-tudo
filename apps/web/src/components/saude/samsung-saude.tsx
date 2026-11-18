import { Activity, BatteryCharging, Droplets, Footprints, HeartPulse, Moon, Scale, Smartphone, Thermometer, Wind } from "lucide-react";
import type { Samsung } from "@/lib/saude/dados";

const TZ = "America/Sao_Paulo";
const hora = (iso: string | number) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dur = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

const ESTAGIO = {
  acordado: { nome: "Acordado", cor: "#F2C14B" },
  rem: { nome: "REM", cor: "#B08CFF" },
  leve: { nome: "Leve", cor: "#8EA2FF" },
  profundo: { nome: "Profundo", cor: "#3D4FB8" },
} as const;

const NOME_EXERCICIO: Record<string, string> = {
  POOL_SWIMMING: "Natação (piscina)", OPEN_WATER_SWIMMING: "Natação (águas abertas)", WEIGHT_MACHINE: "Musculação (aparelhos)",
  CIRCUIT_TRAINING: "Treino em circuito", MARTIAL_ARTS: "Artes marciais", BOXING: "Boxe", WALKING: "Caminhada", RUNNING: "Corrida",
  BIKING: "Bike", TREADMILL: "Esteira", OTHER: "Outro", UNDEFINED: "Exercício",
};

/** Hipnograma: faixas por estágio ao longo da noite (profundo embaixo, acordado em cima). */
function Hipnograma({ inicio, fim, estagios }: { inicio: string; fim: string; estagios: [number, number, keyof typeof ESTAGIO][] }) {
  const t0 = new Date(inicio).getTime(), t1 = new Date(fim).getTime();
  const total = Math.max(1, t1 - t0);
  const linha: Record<keyof typeof ESTAGIO, number> = { acordado: 0, rem: 1, leve: 2, profundo: 3 };
  if (!estagios.length) return null;
  return (
    <div>
      <svg viewBox="0 0 400 64" width="100%" height="64" preserveAspectRatio="none" role="img" aria-label="Estágios do sono ao longo da noite">
        {estagios.map(([a, b, e], i) => (
          <rect key={i} x={((a - t0) / total) * 400} width={Math.max(0.6, ((b - a) / total) * 400)} y={linha[e] * 16 + 1} height={14} rx={2}
            fill={ESTAGIO[e].cor} />
        ))}
      </svg>
      <div className="tabular flex justify-between text-[0.6875rem] text-muted-foreground">
        <span>{hora(inicio)}</span><span>{hora(fim)}</span>
      </div>
    </div>
  );
}

export function SamsungSaude({ s }: { s: Samsung }) {
  if (!s.conectado) {
    return (
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 text-muted-foreground" />
        <p className="text-body-sm text-muted-foreground">
          Instale o app <b>Saúde NT</b> no celular, gere o código e conecte em <b>Conectar relógio</b> (nome: Celular). Ele traz o sono com
          estágios, SpO₂, temperatura e os treinos que o Samsung Health detecta.
        </p>
      </div>
    );
  }
  const sono = s.sono;
  const em = sono?.estagiosMin;
  const dormido = em ? em.leve + em.profundo + em.rem : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><BatteryCharging className="size-3.5 text-[#3F9B52]" /> Energy Score</p>
          <p className="tabular text-h3 font-semibold">{s.energia ? Math.round(s.energia.score) : "—"}</p>
          <p className="text-caption text-muted-foreground">{s.energia ? `de 100 · ${s.energia.dia.split("-").reverse().slice(0, 2).join("/")}` : "sem dado"}</p>
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Moon className="size-3.5 text-[#6E7FE0]" /> Sono</p>
          <p className="tabular text-h3 font-semibold">{dormido != null ? dur(dormido) : "—"}</p>
          <p className="text-caption text-muted-foreground">{sono?.nota != null ? `nota ${sono.nota}` : "dormindo de fato"}</p>
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Droplets className="size-3.5 text-[#1FA9B0]" /> SpO₂ noturno</p>
          <p className="tabular text-h3 font-semibold">{s.spo2?.media != null ? `${Math.round(s.spo2.media)}%` : "—"}</p>
          <p className="text-caption text-muted-foreground">{s.spo2?.min != null ? `mínimo ${Math.round(s.spo2.min)}%` : "sem leitura"}</p>
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Thermometer className="size-3.5 text-[#F08A3C]" /> Pele (Samsung)</p>
          <p className="tabular text-h3 font-semibold">{s.pele != null ? `${s.pele.toFixed(1).replace(".", ",")}°` : "—"}</p>
          <p className="text-caption text-muted-foreground">média da noite</p>
        </div>
      </div>

      {sono && em && (
        <div className="space-y-2">
          <Hipnograma inicio={sono.inicio} fim={sono.fim} estagios={sono.estagios} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {(Object.keys(ESTAGIO) as (keyof typeof ESTAGIO)[]).map((k) => (
              <span key={k} className="tabular inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: ESTAGIO[k].cor }} /> {ESTAGIO[k].nome} {dur(em[k])}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Footprints className="size-3.5 text-[#3F9B52]" /> Passos hoje</p>
          <p className="tabular text-h3 font-semibold">{s.passos?.hoje != null ? s.passos.hoje.toLocaleString("pt-BR") : "—"}</p>
          <p className="text-caption text-muted-foreground">{s.passos?.media7 != null ? `média 7 dias ${s.passos.media7.toLocaleString("pt-BR")}` : "libere Passos no app"}</p>
          {s.passos && s.passos.dias.length > 1 && (
            <div className="mt-2 flex h-6 items-end gap-0.5" role="img" aria-label="Passos dos últimos 14 dias">
              {s.passos.dias.map((d) => (
                <div key={d.dia} className="flex-1 rounded-sm bg-[#3F9B52]/60" title={`${d.dia.split("-").reverse().slice(0, 2).join("/")}: ${d.total.toLocaleString("pt-BR")}`}
                  style={{ height: `${Math.max(6, (d.total / Math.max(...s.passos!.dias.map((x) => x.total), 1)) * 100)}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Scale className="size-3.5 text-[#5B8DB8]" /> Composição corporal</p>
          <p className="tabular text-h3 font-semibold">{s.corpo?.gorduraPct != null ? `${s.corpo.gorduraPct.toFixed(1).replace(".", ",")}%` : "—"}</p>
          <p className="text-caption text-muted-foreground">
            {s.corpo
              ? [s.corpo.peso != null && `${s.corpo.peso.toFixed(1).replace(".", ",")} kg`, s.corpo.musculoKg != null && `músculo ${s.corpo.musculoKg.toFixed(1).replace(".", ",")} kg`,
                  new Date(s.corpo.ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: TZ })].filter(Boolean).join(" · ")
              : "gordura · meça no relógio: Samsung Health › Composição corporal"}
          </p>
          {s.corpo?.anterior?.gorduraPct != null && s.corpo.gorduraPct != null && (
            <p className="tabular text-caption text-muted-foreground">
              {s.corpo.gorduraPct - s.corpo.anterior.gorduraPct >= 0 ? "+" : "−"}{Math.abs(s.corpo.gorduraPct - s.corpo.anterior.gorduraPct).toFixed(1).replace(".", ",")} pts vs. medição anterior
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Wind className="size-3.5 text-[#6E7FE0]" /> Apneia do sono</p>
          <p className="text-body font-semibold">
            {s.apneia ? (s.apneia.sinal === "DETECTED" ? "Sinais detectados" : s.apneia.sinal === "NOT_DETECTED" ? "Sem sinais" : "Inconclusivo") : "—"}
          </p>
          <p className="text-caption text-muted-foreground">
            {s.apneia ? `Samsung Health Monitor · ${new Date(s.apneia.ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ })}${s.apneia.sinal === "DETECTED" ? " · leve ao médico" : ""}`
              : "ative no Samsung Health Monitor (2 noites ≥ 4 h)"}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 p-3">
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><HeartPulse className="size-3.5 text-[#E5536A]" /> Ritmo irregular</p>
          <p className="tabular text-body font-semibold">{s.ritmoIrregular.total ? `${s.ritmoIrregular.total} aviso${s.ritmoIrregular.total > 1 ? "s" : ""}` : "Nenhum aviso"}</p>
          <p className="text-caption text-muted-foreground">
            {s.ritmoIrregular.ultimo ? `último ${new Date(s.ritmoIrregular.ultimo).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: TZ })} · leve ao médico` : "no último ano · Health Monitor"}
          </p>
          {s.vo2max && (
            <p className="mt-1 flex items-center gap-1 text-caption text-muted-foreground"><Activity className="size-3" /> VO₂máx {s.vo2max.valor.toFixed(1).replace(".", ",")}</p>
          )}
        </div>
      </div>

      {s.exercicios.length > 0 && (
        <div>
          <p className="mb-1 text-caption font-medium text-muted-foreground">Treinos registrados pelo Samsung Health</p>
          <ul className="divide-y divide-border/60">
            {s.exercicios.slice(0, 5).map((x) => (
              <li key={x.inicio} className="tabular flex flex-wrap justify-between gap-x-3 py-1.5 text-body-sm">
                <span>
                  {NOME_EXERCICIO[x.tipo] ?? x.tipo.toLowerCase().replace(/_/g, " ")}
                  {x.auto && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[0.625rem] text-muted-foreground">auto</span>}
                </span>
                <span className="text-muted-foreground">
                  {new Date(x.inicio).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: TZ })}, {hora(x.inicio)}–{hora(x.fim)}
                  {x.fcMedia != null && ` · FC ${Math.round(x.fcMedia)}`}
                  {x.calorias != null && ` · ${Math.round(x.calorias)} kcal`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
