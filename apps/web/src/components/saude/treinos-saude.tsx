"use client";

import { useState, useTransition } from "react";
import { Dumbbell, Footprints, Bike, Waves, Swords, Activity, Check, X, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Treino } from "@/lib/saude/dados";
import { descartarTreino, excluirEvento, registrarEvento } from "@/app/app/saude/actions";

const TZ = "America/Sao_Paulo";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const quando = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
  const ontem = new Date(Date.now() - 86_400_000).toLocaleDateString("pt-BR", { timeZone: TZ });
  const dd = d.toLocaleDateString("pt-BR", { timeZone: TZ });
  return dd === hoje ? "Hoje" : dd === ontem ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
};

const MODALIDADES = [
  { nome: "Judô", icone: Swords },
  { nome: "Musculação", icone: Dumbbell },
  { nome: "Corrida", icone: Footprints },
  { nome: "Bike", icone: Bike },
  { nome: "Natação", icone: Waves },
  { nome: "Outro", icone: Activity },
];
/** No pulso, a FC do PPG erra mais quando há pegada/força no punho ou água. */
const BAIXA_CONFIANCA = new Set(["Judô", "Musculação", "Natação"]);
const ESFORCO = ["Repouso", "Muito leve", "Leve", "Moderado", "Um pouco forte", "Forte", "Forte+", "Muito forte", "Muito forte+", "Quase máximo", "Máximo"];

const ZONAS = [
  { chave: "leve", rotulo: "< 120", cor: "#F6C27A" },
  { chave: "moderado", rotulo: "120–139", cor: "#F29E4C" },
  { chave: "intenso", rotulo: "140–159", cor: "#E8673A" },
  { chave: "maximo", rotulo: "≥ 160", cor: "#C9302C" },
] as const;

function BarraZonas({ t }: { t: Treino }) {
  if (!t.zonas) return null;
  const total = Math.max(1, t.zonas.leve + t.zonas.moderado + t.zonas.intenso + t.zonas.maximo);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary" role="img"
        aria-label={ZONAS.map((z) => `${t.zonas![z.chave]} min em ${z.rotulo} bpm`).join(", ")}>
        {ZONAS.map((z) => (
          <div key={z.chave} style={{ width: `${(t.zonas![z.chave] / total) * 100}%`, backgroundColor: z.cor }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
        {ZONAS.map((z) => t.zonas![z.chave] > 0 && (
          <span key={z.chave} className="tabular inline-flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ backgroundColor: z.cor }} /> {t.zonas![z.chave]} min {z.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function Sugestao({ t }: { t: Treino }) {
  const [modalidade, setModalidade] = useState<string | null>(null);
  const [esforco, setEsforco] = useState<number | null>(null);
  const [pendente, iniciar] = useTransition();

  const confirmar = () => iniciar(async () => {
    const r = await registrarEvento({
      tipo: "treino", inicio: t.inicio, fim: t.fim, origem: "detectado",
      detalhes: { modalidade: modalidade!, ...(esforco != null ? { esforco } : {}) },
    });
    if (r.error) toast.error(r.error); else toast.success(`${modalidade} registrado.`);
  });
  const descartar = () => iniciar(async () => {
    const r = await descartarTreino({ inicio: t.inicio, fim: t.fim });
    if (r.error) toast.error(r.error); else toast("Ok, não era treino — não vou sugerir de novo.");
  });

  return (
    <li className="rounded-xl border border-[#F08A3C]/30 bg-[#F08A3C]/[0.06] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm font-semibold">
          Possível treino · {quando(t.inicio)}, {hora(t.inicio)}–{hora(t.fim)}
        </p>
        <p className="tabular text-caption text-muted-foreground">{t.minutos} min · média {t.fcMedia} · pico {t.fcMax} bpm</p>
      </div>
      <div className="mt-3"><BarraZonas t={t} /></div>

      <p className="mt-4 text-caption font-medium text-muted-foreground">O que foi?</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {MODALIDADES.map(({ nome, icone: Icone }) => (
          <button key={nome} type="button" onClick={() => setModalidade(nome)} aria-pressed={modalidade === nome}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-body-sm transition-colors",
              modalidade === nome ? "border-[#F08A3C] bg-[#F08A3C] text-white" : "border-border bg-card hover:bg-secondary",
            )}>
            <Icone className="size-4" /> {nome}
          </button>
        ))}
      </div>

      <p className="mt-4 text-caption font-medium text-muted-foreground">
        Esforço percebido{esforco != null && <span className="text-foreground"> · {esforco} — {ESFORCO[esforco]}</span>}
      </p>
      <div className="mt-1.5 grid grid-cols-11 gap-1" role="radiogroup" aria-label="Esforço percebido de 0 a 10">
        {ESFORCO.map((rotulo, i) => (
          <button key={i} type="button" role="radio" aria-checked={esforco === i} title={rotulo} onClick={() => setEsforco(i)}
            className={cn(
              "tabular h-8 rounded-md text-caption font-medium transition-colors",
              esforco === i ? "text-white" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
            style={esforco === i ? { backgroundColor: `hsl(${30 - i * 3} 85% ${58 - i * 2}%)` } : undefined}>
            {i}
          </button>
        ))}
      </div>

      {modalidade && BAIXA_CONFIANCA.has(modalidade) && (
        <p className="mt-3 flex gap-1.5 text-caption text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Em {modalidade.toLowerCase()} a FC do pulso pode errar (pegada, força no punho{modalidade === "Natação" ? ", água" : ""}). O treino conta, mas a FC fica marcada como baixa confiança.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="accent" disabled={!modalidade || pendente} onClick={confirmar}>
          <Check className="size-4" /> Confirmar
        </Button>
        <Button size="sm" variant="ghost" disabled={pendente} onClick={descartar}>
          <X className="size-4" /> Não foi treino
        </Button>
      </div>
    </li>
  );
}

function Confirmado({ t }: { t: Treino }) {
  const [pendente, iniciar] = useTransition();
  const Icone = MODALIDADES.find((m) => m.nome === t.modalidade)?.icone ?? Activity;
  return (
    <li className="group flex gap-3 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F08A3C]/12 text-[#E2701F]">
        <Icone className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-body-sm font-semibold">
            {t.modalidade ?? "Treino"} <span className="font-normal text-muted-foreground">· {quando(t.inicio)}, {hora(t.inicio)}–{hora(t.fim)}</span>
          </p>
          <p className="tabular text-caption text-muted-foreground">
            {t.minutos} min{t.fcMedia ? ` · média ${t.fcMedia} · pico ${t.fcMax}` : ""}
            {t.esforco != null && ` · esforço ${t.esforco}/10`}
            {t.carga != null && ` · carga ${t.carga}`}
          </p>
        </div>
        <BarraZonas t={t} />
        {t.modalidade && BAIXA_CONFIANCA.has(t.modalidade) && t.zonas && (
          <p className="text-caption text-muted-foreground">FC de baixa confiança nesta modalidade.</p>
        )}
      </div>
      {t.eventoId && (
        <button type="button" aria-label="Desfazer confirmação" disabled={pendente}
          className="self-start rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 focus:opacity-100"
          onClick={() => iniciar(async () => { const r = await excluirEvento(t.eventoId!); if (r.error) toast.error(r.error); })}>
          <X className="size-4" />
        </button>
      )}
    </li>
  );
}

export function TreinosSaude({ treinos }: { treinos: Treino[] }) {
  const sugeridos = treinos.filter((t) => t.status === "sugerido");
  const confirmados = treinos.filter((t) => t.status === "confirmado");
  if (!treinos.length) {
    return <p className="py-6 text-center text-body-sm text-muted-foreground">Nenhum treino nos últimos 14 dias. Quando o batimento ficar alto por 10 min ou mais, ele aparece aqui para você confirmar.</p>;
  }
  return (
    <div className="space-y-4">
      {sugeridos.length > 0 && <ul className="space-y-3">{sugeridos.map((t) => <Sugestao key={t.chave} t={t} />)}</ul>}
      {confirmados.length > 0 && <ul className="divide-y divide-border/70">{confirmados.map((t) => <Confirmado key={t.chave} t={t} />)}</ul>}
    </div>
  );
}
