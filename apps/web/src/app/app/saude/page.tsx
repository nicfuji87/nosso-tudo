import type { Metadata } from "next";
import {
  Activity, BatteryCharging, BatteryMedium, Flame, HeartPulse, Moon, Sparkles, Watch, AlertTriangle, CheckCircle2, Info, Gauge,
  ArrowDownRight, ArrowUpRight, Hand, Zap, BedDouble, Stethoscope, Smartphone,
} from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import {
  ALGORITMOS, NOITES_BASE, NOITES_MIN_COMPARAR, diaLocal, getPainelSaude, horaLocal, type Desvio, type Insight, type PainelSaude, type TrechoRelogio,
} from "@/lib/saude/dados";
import { ConectarRelogio } from "@/components/saude/conectar-relogio";
import { GraficoBpm, GraficoNoites, MiniBateria } from "@/components/saude/graficos-saude";
import { ListaRelogios } from "@/components/saude/lista-relogios";
import { TreinosSaude } from "@/components/saude/treinos-saude";
import { DiarioSaude } from "@/components/saude/diario-saude";
import { RadarSaude } from "@/components/saude/radar-saude";
import { SamsungSaude } from "@/components/saude/samsung-saude";
import { ProntidaoSaude } from "@/components/saude/prontidao-saude";
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
  // no pulso mas sem leitura há > 15 min: o sensor parou (o relógio 0.9.1 religa sozinho)
  const semMedir = d.noPulso === true && !d.carregando && d.ultimaLeituraEm != null
    && Date.now() - new Date(d.ultimaLeituraEm).getTime() > 15 * 60_000;
  const estado =
    semMedir ? { txt: `No pulso · sem medir desde ${horaLocal(d.ultimaLeituraEm!, TZ)}`, cor: "bg-warning" }
    : d.noPulso === true ? { txt: "No pulso · medindo", cor: "bg-success" }
    : d.carregando ? { txt: "No carregador", cor: "bg-warning" }
    : d.noPulso === false ? { txt: "Fora do pulso", cor: "bg-muted-foreground" }
    : { txt: "Medindo", cor: "bg-success" };
  const Bateria = d.carregando ? BatteryCharging : BatteryMedium;
  const celular = p.dispositivos.find((x) => x.diagnostico || /celular/i.test(x.nome));
  const celularOk = !!celular?.ultimoEnvioEm && Date.now() - new Date(celular.ultimoEnvioEm).getTime() < 6 * 3600_000 && !celular.diagnostico?.erro;
  return (
    <div className="flex flex-wrap items-center gap-2 text-caption">
      <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5">
        <span className="relative flex size-2">
          {d.noPulso && !semMedir && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
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
      {celular && (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
          celularOk ? "border-border/70 bg-card" : "border-warning/40 bg-warning/10 text-warning")}
          title={celular.diagnostico?.erro ?? undefined}>
          <Smartphone className="size-3.5" /> Celular {celular.ultimoEnvioEm ? ha(celular.ultimoEnvioEm) : "sem envio"}
          {celular.diagnostico?.erro ? " · com erro" : ""}
        </span>
      )}
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

const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`);
const minutosEntre = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

const ROTULO_TRECHO: Record<TrechoRelogio["tipo"], { nome: string; cor: string }> = {
  carregando: { nome: "Carregando", cor: "#D9A21B" },
  fora_do_pulso: { nome: "Fora do pulso", cor: "#8A9097" },
  sem_leitura: { nome: "Sem leitura", cor: "#B9BEC4" },
};

/** Legenda das lacunas do gráfico: por que não houve batimento em cada trecho. */
function LegendaRelogio({ trechos }: { trechos: TrechoRelogio[] }) {
  if (!trechos.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {trechos.map((t) => {
        const r = ROTULO_TRECHO[t.tipo];
        return (
          <li key={`${t.tipo}-${t.inicio}`} className="tabular inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-caption">
            {t.tipo === "carregando" ? <Zap className="size-3.5" style={{ color: r.cor }} /> : <span className="size-2 rounded-full" style={{ backgroundColor: r.cor }} />}
            {r.nome} {horaLocal(t.inicio, TZ)}–{t.emAndamento ? "agora" : horaLocal(t.fim, TZ)}
            {t.tipo === "carregando" && t.bateriaInicio != null && (
              <span className="text-muted-foreground">· {t.bateriaInicio}% → {t.bateriaFim ?? "?"}%</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Bateria do relógio: agora, gasto por hora no pulso, autonomia, última carga e quanto carregar por dia. */
function CartaoBateria({ p }: { p: PainelSaude }) {
  const b = p.bateria;
  const carga = b.ultimaCarga;
  const ganho = carga && carga.bateriaInicio != null && carga.bateriaFim != null ? carga.bateriaFim - carga.bateriaInicio : null;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="tabular text-h2 font-semibold tracking-tight">{b.atual != null ? `${b.atual}%` : "—"}</p>
          <p className="text-caption text-muted-foreground">
            {b.carregando ? "carregando agora" : p.dispositivos[0]?.noPulso ? "no pulso, medindo" : "fora do pulso"}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-body font-semibold">{b.autonomiaHoras != null ? `~${b.autonomiaHoras} h` : "—"}</p>
          <p className="text-caption text-muted-foreground">{b.consumoHora != null ? `por carga · ${String(b.consumoHora).replace(".", ",")}%/h no pulso` : "autonomia: medindo"}</p>
        </div>
      </div>
      <MiniBateria pontos={b.pontos} cargas={p.linhaDoTempo.filter((t) => t.tipo === "carregando")} />
      <ul className="space-y-1.5 text-body-sm">
        {carga && (
          <li className="flex justify-between gap-3">
            <span className="text-muted-foreground">Última carga</span>
            <span className="tabular text-right">
              {horaLocal(carga.inicio, TZ)}–{carga.emAndamento ? "agora" : horaLocal(carga.fim, TZ)}
              {carga.bateriaInicio != null && ` · ${carga.bateriaInicio}% → ${carga.bateriaFim ?? "?"}%`}
              {ganho != null && ganho > 0 && !carga.emAndamento && ` em ${duracao(minutosEntre(carga.inicio, carga.fim))}`}
            </span>
          </li>
        )}
        {b.minutosCargaPorDia != null && (
          <li className="flex justify-between gap-3">
            <span className="text-muted-foreground">Para cobrir um dia</span>
            <span className="tabular">~{duracao(b.minutosCargaPorDia)} de carga</span>
          </li>
        )}
      </ul>
      <p className="text-caption text-muted-foreground">
        {b.consumoHora == null ? "O gasto por hora aparece depois de algumas horas de uso com a versão 0.6 do app. " : ""}
        A medição de saúde gasta pouco; tela sempre ligada e LTE são o que mais consome no Watch.
      </p>
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
  const normalTemp = p.desvioTemp?.normal ?? null;
  const ultimaComSono = [...p.noites].reverse().find((n) => n.sonoInicio && n.sonoFim);
  const sonoUltima = ultimaComSono ? { inicio: ultimaComSono.sonoInicio!, fim: ultimaComSono.sonoFim!, fonte: ultimaComSono.fonteSono } : null;
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
          <div className="flex flex-col items-end gap-2">
            <EstadoRelogio p={p} />
            <a href="/relatorio/saude"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-caption font-medium text-background transition hover:opacity-90">
              <Stethoscope className="size-3.5" /> Relatório para o médico
            </a>
          </div>
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

      {/* Prontidão do dia */}
      <ProntidaoSaude p={p.prontidao} recuperacoes={p.recuperacoes} />

      {/* Radar de Saúde */}
      <RadarSaude radar={p.radar} hoje={diaLocal(new Date().toISOString(), TZ)} desvioFc={p.desvioFc} desvioVfc={p.desvioVfc}
        desvioTemp={p.desvioTemp} placar={p.placar} />

      {/* Samsung Health (celular) */}
      <Cartao titulo="Samsung Health" subtitulo="pelo app Saúde NT do celular · sono, SpO₂, temperatura, Energy Score, passos, composição corporal e Health Monitor"
        acao={<Smartphone className="size-5 text-muted-foreground" />}>
        <SamsungSaude s={p.samsung} />
      </Cartao>

      {/* Batimento 24 h */}
      <Cartao titulo="Batimento · últimas 24 h" subtitulo="média por minuto · treinos em laranja · carregando em âmbar · fora do pulso em cinza">
        {p.bpm24h.length >= 2 ? (
          <GraficoBpm
            pontos={p.bpm24h}
            treinos={treinosHoje.map((t) => ({ inicio: t.inicio, fim: t.fim, rotulo: t.modalidade ?? "treino?" }))}
            marcas={mal24.map((m) => ({ ts: m.ts, rotulo: "mal-estar" }))}
            relogio={p.linhaDoTempo}
          />
        ) : (
          <p className="py-16 text-center text-body-sm text-muted-foreground">Sem leituras nas últimas 24 horas.</p>
        )}
        <LegendaRelogio trechos={p.linhaDoTempo} />
      </Cartao>

      {/* Treinos */}
      <Cartao titulo="Treinos" subtitulo={`gravados no Samsung Health entram sozinhos (${ALGORITMOS.samsung}) · os demais são detectados pelo batimento (${ALGORITMOS.treino}) para confirmar · treinou sem o relógio? Diário › Treino`}
        acao={<Flame className="size-5 text-[#F08A3C]" />}>
        <TreinosSaude treinos={p.treinos} />
      </Cartao>

      {/* Noites + qualidade */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Cartao titulo="Noites" subtitulo={`sono do Samsung Health (ou estimado pelo batimento) · repouso = menor média de 30 min · VFC e pele = mediana dentro do sono · ${ALGORITMOS.noites}`}
          acao={sonoUltima ? (
            <span className="tabular inline-flex items-center gap-1.5 rounded-full bg-[#6E7FE0]/10 px-3 py-1 text-caption font-medium text-[#5566C8]">
              <BedDouble className="size-3.5" /> {horaLocal(sonoUltima.inicio, TZ)}–{horaLocal(sonoUltima.fim, TZ)} · {duracao(minutosEntre(sonoUltima.inicio, sonoUltima.fim))}
              <span className="font-normal opacity-80">· {sonoUltima.fonte === "samsung" ? "Samsung Health" : "estimado"}</span>
            </span>
          ) : undefined}>
          {p.noites.some((n) => n.fcRepouso != null || n.vfc != null || n.temp != null) ? (
            <GraficoNoites noites={p.noites} normalFc={normalFc} normalVfc={normalVfc} normalTemp={normalTemp} />
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
            <Medidor rotulo="Temperatura da pele (última noite)" valor={p.noites.at(-1)?.janelasTemp ?? 0} total={120}
              sufixo={`${p.noites.at(-1)?.janelasTemp ?? 0} janelas de 5 min`} />
            <Medidor rotulo="Noites na linha de base" valor={p.noitesBase} total={NOITES_BASE} sufixo={`${p.noitesBase}/${NOITES_BASE}`} />
            {(p.qualidade.semMedir.carregando + p.qualidade.semMedir.foraDoPulso + p.qualidade.semMedir.semExplicacao) > 0 && (
              <div className="text-caption text-muted-foreground">
                <p className="font-medium text-foreground">Sem medir nas últimas 24 h</p>
                {p.qualidade.semMedir.carregando > 0 && <p>⚡ carregando: {duracao(p.qualidade.semMedir.carregando)}</p>}
                {p.qualidade.semMedir.foraDoPulso > 0 && <p>fora do pulso: {duracao(p.qualidade.semMedir.foraDoPulso)}</p>}
                {p.qualidade.semMedir.semExplicacao > 0 && <p>sem leitura (relógio frouxo ou motivo não registrado): {duracao(p.qualidade.semMedir.semExplicacao)}</p>}
              </div>
            )}
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
          <Cartao titulo="Relógio e bateria" subtitulo={p.dispositivos[0]?.versao ? `app ${p.dispositivos[0].versao} · bateria-v1` : undefined}
            acao={<BatteryMedium className="size-5 text-[#3F9B52]" />}>
            <CartaoBateria p={p} />
            <div className="mt-5 border-t border-border/70 pt-3">
              <ListaRelogios dispositivos={p.dispositivos} />
            </div>
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
