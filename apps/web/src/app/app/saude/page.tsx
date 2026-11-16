import type { Metadata } from "next";
import { Activity, HeartPulse, Moon, Watch, Zap, ClipboardCheck, Wind, Coffee } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { DIAS_BASE, diaLocal, getPainelSaude, type RegistroSaude } from "@/lib/saude/dados";
import { ConectarRelogio } from "@/components/saude/conectar-relogio";
import { GraficoBpm, GraficoVfc } from "@/components/saude/graficos-saude";
import { ListaRelogios } from "@/components/saude/lista-relogios";
import { cn } from "@/lib/utils";
import { rotuloAmbiente } from "@/lib/saude/ambiente";

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

function Tile({
  icone: Icone, cor, rotulo, valor, unidade, dica, destaque,
}: {
  icone: typeof HeartPulse; cor: string; rotulo: string; valor: string; unidade?: string; dica?: string; destaque?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 text-body-sm font-medium">
        <Icone className="size-4" style={{ color: cor }} />
        {rotulo}
      </div>
      <p className="tabular mt-2 text-h2 font-semibold tracking-tight">
        {valor}
        {unidade && <span className="ml-1 text-body font-normal text-muted-foreground">{unidade}</span>}
      </p>
      {destaque}
      {dica && <p className="mt-1 text-caption text-muted-foreground">{dica}</p>}
    </div>
  );
}

const ICONE_REGISTRO: Record<string, { icone: typeof HeartPulse; cor: string; titulo: (r: RegistroSaude) => string }> = {
  checkin: { icone: ClipboardCheck, cor: "#3F9B52", titulo: (r) => `Check-in: ${r.valor}` },
  habito: { icone: Coffee, cor: "#C9962A", titulo: (r) => r.valor },
  respiracao: { icone: Wind, cor: "#1FA9B0", titulo: () => "Respiração" },
  ecg: { icone: Activity, cor: "#E5536A", titulo: () => "ECG" },
};
const REGISTRO_PADRAO = { icone: Coffee, cor: "#C9962A", titulo: (r: RegistroSaude) => r.valor };

async function SeloAmbiente({ workspaceId }: { workspaceId: string }) {
  const r = await rotuloAmbiente(workspaceId);
  if (!r) return null;
  return (
    <p className={cn("rounded-lg px-3 py-2 text-caption font-medium", r.alerta ? "bg-warning/15 text-warning" : "bg-info/15 text-info")}>
      {r.texto}
    </p>
  );
}

export default async function SaudePage() {
  const { workspace } = await getWorkspaceContext();
  const p = await getPainelSaude(workspace.id, TZ);
  const ultimoEnvio = p.dispositivos.map((d) => d.ultimoEnvioEm).filter(Boolean).sort().at(-1) ?? null;

  if (p.dispositivos.length === 0) {
    return (
      <div className="space-y-6">
        <SeloAmbiente workspaceId={workspace.id} />
        <div className="space-y-1">
          <h1 className="text-h2 font-semibold tracking-tight">Saúde</h1>
          <p className="max-w-2xl text-body-sm text-muted-foreground">
            Batimento, VFC, ECG e registros do seu Galaxy Watch, num só lugar — visíveis para a família.
            Não é diagnóstico: serve para perceber padrões.
          </p>
        </div>
        <ConectarRelogio />
      </div>
    );
  }

  const hoje = diaLocal(new Date().toISOString(), TZ);

  return (
    <div className="space-y-6">
      <SeloAmbiente workspaceId={workspace.id} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-h2 font-semibold tracking-tight">Saúde</h1>
          <p className="text-body-sm text-muted-foreground">Dados do seu Galaxy Watch</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-caption">
          <span className={cn("size-2 rounded-full", ultimoEnvio && Date.now() - new Date(ultimoEnvio).getTime() < 3 * 3600_000 ? "bg-success" : "bg-muted-foreground")} />
          <Watch className="size-4" />
          {ultimoEnvio ? `Sincronizado ${ha(ultimoEnvio)}` : "Aguardando o primeiro envio"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          icone={Zap} cor="#3F9B52" rotulo="Prontidão"
          valor={`${Math.min(p.diasBase, DIAS_BASE)}/${DIAS_BASE}`}
          dica="dias de linha de base de VFC — a nota aparece ao completar"
          destaque={
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (p.diasBase / DIAS_BASE) * 100)}%` }} />
            </div>
          }
        />
        <Tile
          icone={Activity} cor="#8B6CE0" rotulo="VFC (HRV)"
          valor={p.vfcHoje != null ? String(p.vfcHoje) : "—"} unidade="ms"
          dica={
            p.vfcHoje != null
              ? `RMSSD de hoje · ${p.janelasHoje} janelas` + (p.variacaoVs7d != null ? ` · ${p.variacaoVs7d >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(p.variacaoVs7d))}% vs. 7 dias` : "")
              : "sem janelas de 5 min com sinal bom hoje"
          }
        />
        <Tile
          icone={HeartPulse} cor="#E5536A" rotulo="Frequência cardíaca"
          valor={p.ultimoBpm ? String(p.ultimoBpm.bpm) : "—"} unidade="bpm"
          dica={
            p.ultimoBpm
              ? `última ${ha(p.ultimoBpm.minuto)}` + (p.faixaHoje ? ` · hoje ${p.faixaHoje.min}–${p.faixaHoje.max}` : "")
              : "sem leituras nas últimas 24 h"
          }
        />
        <Tile icone={Moon} cor="#6E7FE0" rotulo="Sono" valor="—" dica="vem do Samsung Health pelo celular (próxima etapa)" />
        <Tile
          icone={Activity} cor="#E5536A" rotulo="ECG"
          valor={p.ecgs.length ? String(p.ecgs.length) : "0"}
          unidade={p.ecgs.length === 1 ? "medição" : "medições"}
          dica={p.ecgs[0] ? `última ${ha(p.ecgs[0].ts)} · ${Math.round(p.ecgs[0].hz)} Hz` : "faça no relógio: dedo no botão superior, 30 s"}
        />
        <Tile icone={ClipboardCheck} cor="#3F9B52" rotulo="Registros hoje" valor={String(p.registrosHoje)} dica="check-ins, hábitos e respirações" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
          <h2 className="text-body font-semibold">Tendência da VFC (RMSSD)</h2>
          <p className="mb-3 text-caption text-muted-foreground">mediana diária das janelas de 5 min · últimos 14 dias</p>
          {p.vfcDias.length >= 2 ? (
            <GraficoVfc dias={p.vfcDias} />
          ) : (
            <p className="py-16 text-center text-body-sm text-muted-foreground">A tendência aparece a partir do 2º dia com medição.</p>
          )}
        </section>
        <section className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
          <h2 className="text-body font-semibold">Batimento · últimas 24 h</h2>
          <p className="mb-3 text-caption text-muted-foreground">média por minuto enquanto o relógio estava medindo</p>
          {p.bpm24h.length >= 2 ? (
            <GraficoBpm pontos={p.bpm24h} />
          ) : (
            <p className="py-16 text-center text-body-sm text-muted-foreground">Sem leituras nas últimas 24 horas.</p>
          )}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
          <h2 className="mb-2 text-body font-semibold">Registros recentes</h2>
          {p.registros.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-muted-foreground">Nenhum check-in, hábito ou respiração ainda.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {p.registros.slice(0, 12).map((r) => {
                const meta = ICONE_REGISTRO[r.tipo] ?? REGISTRO_PADRAO;
                const Icone = meta.icone;
                const d = diaLocal(r.ts, TZ);
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: `${meta.cor}1F` }}>
                      <Icone className="size-4" style={{ color: meta.cor }} />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-body-sm">{meta.titulo(r)}</p>
                    <p className="tabular text-caption text-muted-foreground">
                      {d === hoje ? "hoje" : d.split("-").reverse().slice(0, 2).join("/")},{" "}
                      {new Date(r.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-card">
            <h2 className="mb-1 text-body font-semibold">Relógios</h2>
            <ListaRelogios dispositivos={p.dispositivos} />
          </div>
          <ConectarRelogio compacto />
        </section>
      </div>

      <p className="text-caption text-muted-foreground">
        Dados de bem-estar medidos pelo relógio. Não substituem avaliação médica.
      </p>
    </div>
  );
}
