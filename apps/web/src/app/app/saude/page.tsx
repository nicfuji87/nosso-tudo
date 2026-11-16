import type { Metadata } from "next";
import {
  Activity, BatteryCharging, BatteryMedium, Flame, HeartPulse, Moon, Sparkles, Watch, AlertTriangle, CheckCircle2, Info, Gauge,
  ArrowDownRight, ArrowUpRight, Hand,
} from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import {
  ALGORITMOS, NOITES_BASE, NOITES_MIN_COMPARAR, getPainelSaude, horaLocal, type Desvio, type Insight, type PainelSaude,
} from "@/lib/saude/dados";
import { ConectarRelogio } from "@/components/saude/conectar-relogio";
import { GraficoBpm, GraficoNoites } from "@/components/saude/graficos-saude";
import { ListaRelogios } from "@/components/saude/lista-relogios";
import { TreinosSaude } from "@/components/saude/treinos-saude";
import { DiarioSaude } from "@/components/saude/diario-saude";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Saúde · Nosso Tudo" };
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

function ha(iso: string | null | undefined) {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} d`;
}

function Cartao({ titulo, subtitulo, children, className, acao }: {
  titulo: string; subtitulo?: string; children: React.ReactNode; className?: string; acao?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold tracking-tight">{titulo}</h2>
          {subtitulo && <p className="text-caption text-muted-foreground">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Estado do relógio: no pulso / carregando / bateria / sincronização. */
function EstadoRelogio({ p }: { p: PainelSaude }) {
  const d = p.dispositivos[0];
  if (!d) return null;
  const ultimoEnvio = p.dispositivos.map((x) => x.ultimoEnvioEm).filter(Boolean).sort().at(-1) ?? null;
  const recente = ultimoEnvio && Date.now() - new Date(ultimoEnvio).getTime() < 90 * 60_000;
  const estado =
    d.noPulso === true ? { txt: "No pulso · medindo", cor: "bg-success" }
    : d.carregando ? { txt: "No carregador", cor: "bg-warning" }
    : d.noPulso === false ? { txt: "Fora do pulso", cor: "bg-muted-foreground" }
    : { txt: "Medindo", cor: "bg-success" };
  const Bateria = d.carregando ? BatteryCharging : BatteryMedium;
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption">
      <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5">
        <span className="relative flex size-2">
          {d.noPulso && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn("relative inline-flex size-2 rounded-full", estado.cor)} />
        </span>
        <Watch className="size-3.5" /> {estado.txt}
      </span>
      {d.bateria != null && (
        <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5">
          <Bateria className="size-3.5" /> {d.bateria}%
        </span>
      )}
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5", !recente && "text-muted-foreground")}>
        {ultimoEnvio ? `Sincronizado ${ha(ultimoEnvio)}` : "Aguardando o primeiro envio"}
      </span>
    </div>
  );
}

const TOM: Record<Insight["tom"], { icone: typeof Info; cor: string; fundo: string }> = {
  acao: { icone: Hand, cor: "text-[#E2701F]", fundo: "bg-[#F08A3C]/10" },
  atencao: { icone: AlertTriangle, cor: "text-warning", fundo: "bg-warning/10" },
  bom: { icone: CheckCircle2, cor: "text-success", fundo: "bg-success/10" },
  neutro: { icone: Info, cor: "text-info", fundo: "bg-info/10" },
};

function Insights({ lista }: { lista: Insight[] }) {
  if (!lista.length) return <p className="text-body-sm text-muted-foreground">Nada fora do comum. Continue usando o relógio, inclusive para dormir.</p>;
  return (
    <ul className="space-y-3">
      {lista.map((i) => {
        const t = TOM[i.tom];
        return (
          <li key={i.id} className="flex gap-3">
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", t.fundo)}>
              <t.icone className={cn("size-4", t.cor)} />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold">{i.titulo}</p>
              <p className="text-body-sm text-muted-foreground">{i.texto}</p>
              {i.influencias && i.influencias.length > 0 && (
                <p className="mt-1 text-caption text-muted-foreground">
                  No diário nas 34 h antes: <span className="text-foreground">{i.influencias.join(", ")}</span>. Nenhuma delas descarta outras causas.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Delta({ d, unidade, inverso = false, pct = false }: { d: Desvio | null; unidade: string; inverso?: boolean; pct?: boolean }) {
  if (!d) return null;
  const v = pct ? d.deltaPct : d.delta;
  if (Math.abs(v) < (pct ? 3 : 1)) return <span className="text-caption text-muted-foreground">no seu normal</span>;
  const sobe = v > 0;
  const ruim = inverso ? !sobe : sobe;
  const Seta = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 text-caption font-medium", ruim ? "text-warning" : "text-success")}>
      <Seta className="size-3.5" /> {Math.abs(v).toFixed(0)}{pct ? "%" : ` ${unidade}`} vs. normal
    </span>
  );
}

function Kpi({ icone: Icone, cor, rotulo, valor, unidade, rodape }: {
  icone: typeof HeartPulse; cor: string; rotulo: string; valor: string; unidade?: string; rodape?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-5">
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full opacity-[0.07]" style={{ backgroundColor: cor }} />
      <div className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
        <Icone className="size-4" style={{ color: cor }} /> {rotulo}
      </div>
      <p className="tabular mt-2 text-h2 font-semibold tracking-tight">
        {valor}
        {unidade && <span className="ml-1 text-body font-normal text-muted-foreground">{unidade}</span>}
      </p>
      <div className="mt-1 min-h-[1.25rem] text-caption text-muted-foreground">{rodape}</div>
    </div>
  );
}

function Medidor({ rotulo, valor, total, sufixo }: { rotulo: string; valor: number; total: number; sufixo: string }) {
  const pct = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div>
      <div className="text-body-sm">
        <span>{rotulo}</span>
        <span className="tabular block text-caption text-muted-foreground">{sufixo}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function SaudePage() {
  const { workspace } = await getWorkspaceContext();
  const p = await getPainelSaude(workspace.id, TZ);

  if (p.dispositivos.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-h2 font-semibold tracking-tight">Saúde</h1>
          <p className="max-w-2xl text-body-sm text-muted-foreground">
            Batimento, VFC, treinos, noites e diário do seu Galaxy Watch, num só lugar. Não é diagnóstico: serve para perceber padrões.
          </p>
        </div>
        <ConectarRelogio />
      </div>
    );
  }

  const treinosHoje = p.treinos.filter((t) => Date.now() - new Date(t.fim).getTime() < 24 * 3600_000);
  const mal24 = p.malEstares.filter((m) => Date.now() - new Date(m.ts).getTime() < 24 * 3600_000);
  const normalFc = p.desvioFc?.normal ?? null;
  const normalVfc = p.desvioVfc?.normal ?? null;
  const varCarga = p.carga7dAnterior > 0 ? Math.round((p.carga7d / p.carga7dAnterior - 1) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{ background: "radial-gradient(60% 120% at 100% 0%, rgba(229,83,106,0.10), transparent 60%), radial-gradient(50% 100% at 0% 100%, rgba(139,108,224,0.10), transparent 60%)" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-overline uppercase text-muted-foreground">Saúde · Galaxy Watch</p>
            <h1 className="text-h2 font-semibold tracking-tight">
              {p.ultimoBpm ? (
                <>
                  {Date.now() - new Date(p.ultimoBpm.minuto).getTime() < 15 * 60_000 ? "Seu coração agora" : "Último batimento"}{" "}
                  <span className="tabular" style={{ color: "#E5536A" }}>{p.ultimoBpm.bpm}</span> bpm
                </>
              ) : "Saúde"}
            </h1>
            <p className="text-body-sm text-muted-foreground">
              {p.ultimoBpm ? `última leitura ${ha(p.ultimoBpm.minuto)}` : "sem leituras nas últimas 24 h"}
              {p.faixaHoje && ` · hoje ${p.faixaHoje.min}–${p.faixaHoje.max} bpm`}
            </p>
          </div>
          <EstadoRelogio p={p} />
        </div>
      </header>

      {/* Insights + indicadores */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Cartao titulo="O que os seus dados dizem" subtitulo={`observações sem diagnóstico · ${ALGORITMOS.insights}`}
          acao={<Sparkles className="size-5 text-[#8B6CE0]" />}>
          <Insights lista={p.insights} />
        </Cartao>
        <div className="grid grid-cols-2 gap-3">
          <Kpi icone={HeartPulse} cor="#E5536A" rotulo="FC de repouso" unidade="bpm"
            valor={p.ultimaNoite?.fcRepouso != null ? p.ultimaNoite.fcRepouso.toFixed(0) : "—"}
            rodape={p.desvioFc ? <Delta d={p.desvioFc} unidade="bpm" /> : p.ultimaNoite ? "última noite" : "durma com o relógio"} />
          <Kpi icone={Moon} cor="#8B6CE0" rotulo="VFC noturna" unidade="ms"
            valor={p.ultimaNoite?.vfc != null ? String(p.ultimaNoite.vfc) : "—"}
            rodape={p.desvioVfc ? <Delta d={p.desvioVfc} unidade="ms" inverso pct /> : p.ultimaNoite ? `${p.ultimaNoite.janelas} janelas` : "RMSSD da madrugada"} />
          <Kpi icone={Flame} cor="#F08A3C" rotulo="Carga 7 dias" valor={String(p.carga7d)}
            rodape={varCarga != null ? `${varCarga >= 0 ? "+" : ""}${varCarga}% vs. semana anterior` : `${p.treinos.filter((t) => Date.now() - new Date(t.inicio).getTime() < 7 * 86_400_000).length} treinos`} />
          <Kpi icone={Gauge} cor="#3F9B52" rotulo="Linha de base" valor={`${Math.min(p.noitesBase, NOITES_BASE)}/${NOITES_BASE}`}
            rodape={p.noitesBase < NOITES_MIN_COMPARAR ? `compara a partir de ${NOITES_MIN_COMPARAR} noites` : p.noitesBase < NOITES_BASE ? "em calibração" : "pronta"} />
        </div>
      </div>

      {/* Batimento 24 h */}
      <Cartao titulo="Batimento · últimas 24 h" subtitulo="média por minuto · treinos sombreados · mal-estar marcado">
        {p.bpm24h.length >= 2 ? (
          <GraficoBpm
            pontos={p.bpm24h}
            treinos={treinosHoje.map((t) => ({ inicio: t.inicio, fim: t.fim, rotulo: t.modalidade ?? "treino?" }))}
            marcas={mal24.map((m) => ({ ts: m.ts, rotulo: "mal-estar" }))}
          />
        ) : (
          <p className="py-16 text-center text-body-sm text-muted-foreground">Sem leituras nas últimas 24 horas.</p>
        )}
      </Cartao>

      {/* Treinos */}
      <Cartao titulo="Treinos" subtitulo={`detectados pelo batimento (${ALGORITMOS.treino}: ≥ 100 bpm por 10 min ou mais) · você confirma a modalidade`}
        acao={<Flame className="size-5 text-[#F08A3C]" />}>
        <TreinosSaude treinos={p.treinos} />
      </Cartao>

      {/* Noites + qualidade */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Cartao titulo="Noites" subtitulo={`22h–8h · FC de repouso = menor média de 30 min · VFC = mediana das janelas · ${ALGORITMOS.noites}`}>
          {p.noites.some((n) => n.fcRepouso != null || n.vfc != null) ? (
            <GraficoNoites noites={p.noites} normalFc={normalFc} normalVfc={normalVfc} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Moon className="size-8 text-[#6E7FE0]" />
              <p className="max-w-sm text-body-sm text-muted-foreground">
                Nenhuma noite medida ainda. Durma com o relógio: com 3 h ou mais de leitura entre 22h e 8h, a noite entra aqui e na sua linha de base.
              </p>
            </div>
          )}
        </Cartao>
        <Cartao titulo="Qualidade dos dados" subtitulo="quanto dá para confiar no que aparece aqui">
          <div className="space-y-4">
            <Medidor rotulo="Batimento medido (24 h)" valor={p.qualidade.minutos24h} total={1440}
              sufixo={`${Math.floor(p.qualidade.minutos24h / 60)} h ${p.qualidade.minutos24h % 60} min · ${Math.round(p.qualidade.cobertura24h * 100)}%`} />
            <Medidor rotulo="Janelas de VFC válidas (24 h)" valor={p.qualidade.janelasVfc24h} total={96} sufixo={`${p.qualidade.janelasVfc24h}`} />
            <Medidor rotulo="Noites na linha de base" valor={p.noitesBase} total={NOITES_BASE} sufixo={`${p.noitesBase}/${NOITES_BASE}`} />
            <p className="text-caption text-muted-foreground">
              {p.qualidade.atrasoMin != null ? `Último envio do relógio ${p.qualidade.atrasoMin < 1 ? "agora" : `há ${p.qualidade.atrasoMin} min`}. ` : ""}
              O relógio envia a cada 30 min; mal-estar e ECG vão na hora.
            </p>
          </div>
        </Cartao>
      </div>

      {/* Diário */}
      <Cartao titulo="Diário" subtitulo="o que o relógio não sabe sozinho · mal-estar guarda o batimento de 10 min antes a 10 min depois">
        <DiarioSaude eventos={p.eventos} registros={p.registros} malEstares={p.malEstares} />
      </Cartao>

      {/* ECG + relógios */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="ECG do relógio" subtitulo="medição de 30 s pelo app Saúde NT · para estudo, não para diagnóstico" acao={<Activity className="size-5 text-[#E5536A]" />}>
          {p.ecgs.length ? (
            <ul className="divide-y divide-border/70">
              {p.ecgs.slice(0, 5).map((e) => (
                <li key={e.id} className="tabular flex justify-between py-2 text-body-sm">
                  <span>{new Date(e.ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: TZ })}, {horaLocal(e.ts, TZ)}</span>
                  <span className="text-muted-foreground">{Math.round(e.duracaoS)} s · {Math.round(e.hz)} Hz</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-muted-foreground">Nenhum ECG ainda. No relógio: ECG, dedo no botão superior por 30 s.</p>
          )}
          <p className="mt-3 text-caption text-muted-foreground">Para mostrar ao médico, use o ECG do Samsung Health Monitor (registrado na Anvisa).</p>
        </Cartao>
        <div className="space-y-4">
          <Cartao titulo="Relógios" subtitulo={p.dispositivos[0]?.versao ? `app ${p.dispositivos[0].versao}` : undefined}>
            <ListaRelogios dispositivos={p.dispositivos} />
          </Cartao>
          <ConectarRelogio compacto />
        </div>
      </div>

      <p className="text-caption text-muted-foreground">
        Dados de bem-estar medidos no pulso. Não substituem avaliação médica. Em dor no peito, desmaio ou falta de ar, procure atendimento.
      </p>
    </div>
  );
}
