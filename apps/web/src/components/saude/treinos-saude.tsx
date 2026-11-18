"use client";

import { useState, useTransition } from "react";
import { Check, X, Info, Sparkles, Scissors, Clock, Smartphone, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Treino } from "@/lib/saude/dados";
import { alterarModalidade, confirmarTreino, descartarTreino, excluirEvento } from "@/app/app/saude/actions";
import { BAIXA_CONFIANCA, ESFORCO, MODALIDADES, iconeModalidade, motivoBaixaConfianca } from "./modalidades";

const TZ = "America/Sao_Paulo";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const quando = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: TZ });
  const ontem = new Date(Date.now() - 86_400_000).toLocaleDateString("pt-BR", { timeZone: TZ });
  const dd = d.toLocaleDateString("pt-BR", { timeZone: TZ });
  return dd === hoje ? "Hoje" : dd === ontem ? "Ontem" : d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
};

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

/** "HH:MM" local de um ISO. */
const hhmm = (iso: string) => hora(iso);
/** ISO a partir do dia local de `base` + "HH:MM" (São Paulo, UTC−3, sem horário de verão). */
function isoNoDia(base: string, hm: string) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(base));
  return new Date(`${dia}T${hm}:00-03:00`).toISOString();
}
const meio = (a: string, b: string) => hhmm(new Date((new Date(a).getTime() + new Date(b).getTime()) / 2 / 60_000 * 60_000).toISOString());

function Chips({ valor, onChange, cor = "#F08A3C" }: { valor: string | null; onChange: (v: string) => void; cor?: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {MODALIDADES.map(({ nome, icone: Icone }) => (
        <button key={nome} type="button" onClick={() => onChange(nome)} aria-pressed={valor === nome}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-body-sm transition-colors",
            valor === nome ? "text-white" : "border-border bg-card hover:bg-secondary")}
          style={valor === nome ? { backgroundColor: cor, borderColor: cor } : undefined}>
          <Icone className="size-4" /> {nome}
        </button>
      ))}
    </div>
  );
}

function CampoHora({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-caption text-muted-foreground">
      {rotulo}
      <input id={id} type="time" value={valor} onChange={(e) => onChange(e.target.value)}
        className="tabular h-9 rounded-md border border-border bg-card px-2 text-body-sm text-foreground" />
    </label>
  );
}

function Sugestao({ t }: { t: Treino }) {
  const [modalidade, setModalidade] = useState<string | null>(t.palpite);
  const [esforco, setEsforco] = useState<number | null>(null);
  const [inicio, setInicio] = useState(hhmm(t.inicio));
  const [fim, setFim] = useState(hhmm(t.fim));
  const [ajustar, setAjustar] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [troca, setTroca] = useState(meio(t.inicio, t.fim));
  const [modalidade2, setModalidade2] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const pronto = !!modalidade && (!dividir || (!!modalidade2 && troca > inicio && troca < fim)) && fim > inicio;
  const confirmar = () => iniciar(async () => {
    const i = isoNoDia(t.inicio, inicio), f = isoNoDia(t.inicio, fim);
    const partes = dividir
      ? [{ inicio: i, fim: isoNoDia(t.inicio, troca), modalidade: modalidade! }, { inicio: isoNoDia(t.inicio, troca), fim: f, modalidade: modalidade2! }]
      : [{ inicio: i, fim: f, modalidade: modalidade! }];
    const r = await confirmarTreino({ partes, esforco });
    if (r.error) toast.error(r.error);
    else toast.success(dividir ? `${modalidade} + ${modalidade2} registrados.` : `${modalidade} registrado.`);
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

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAjustar((v) => !v)} aria-pressed={ajustar}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption", ajustar ? "border-foreground/30 bg-secondary" : "border-border hover:bg-secondary")}>
          <Clock className="size-3.5" /> Ajustar horário
        </button>
        <button type="button" onClick={() => { setDividir((v) => !v); setAjustar(true); }} aria-pressed={dividir}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption", dividir ? "border-[#8B6CE0]/50 bg-[#8B6CE0]/10 text-[#7A5BD0]" : "border-border hover:bg-secondary")}>
          <Scissors className="size-3.5" /> Foram duas atividades
        </button>
      </div>

      {ajustar && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <CampoHora id={`ini-${t.chave}`} rotulo="Começou" valor={inicio} onChange={setInicio} />
          {dividir && <CampoHora id={`troca-${t.chave}`} rotulo="Trocou às" valor={troca} onChange={setTroca} />}
          <CampoHora id={`fim-${t.chave}`} rotulo="Terminou" valor={fim} onChange={setFim} />
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
        {dividir ? `1ª atividade (${inicio}–${troca})` : "O que foi?"}
        {t.palpite && modalidade === t.palpite && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#8B6CE0]/10 px-2 py-0.5 text-[#7A5BD0]">
            <Sparkles className="size-3" /> pelo seu padrão
          </span>
        )}
      </p>
      <Chips valor={modalidade} onChange={setModalidade} />
      {dividir && (
        <>
          <p className="mt-3 text-caption font-medium text-muted-foreground">2ª atividade ({troca}–{fim})</p>
          <Chips valor={modalidade2} onChange={setModalidade2} cor="#8B6CE0" />
        </>
      )}

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

      {[modalidade, dividir ? modalidade2 : null].filter((m): m is string => !!m && BAIXA_CONFIANCA.has(m)).map((m) => (
        <p key={m} className="mt-3 flex gap-1.5 text-caption text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Em {m.toLowerCase()} a FC do pulso pode errar ({motivoBaixaConfianca(m)}). O treino conta, mas a FC fica marcada como baixa confiança.
        </p>
      ))}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="accent" disabled={!pronto || pendente} onClick={confirmar}>
          <Check className="size-4" /> {dividir ? "Confirmar as duas" : "Confirmar"}
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
  const [trocar, setTrocar] = useState(false);
  const Icone = iconeModalidade(t.modalidade);
  return (
    <li className="group flex gap-3 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F08A3C]/12 text-[#E2701F]">
        <Icone className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-body-sm font-semibold">
            <button type="button" className="underline-offset-4 hover:underline" title="Trocar a modalidade" onClick={() => setTrocar((v) => !v)}>
              {t.modalidade ?? "Treino"}
            </button>{" "}
            <span className="font-normal text-muted-foreground">· {quando(t.inicio)}, {hora(t.inicio)}–{hora(t.fim)}</span>
            {t.origem === "samsung" && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[0.625rem] font-medium text-muted-foreground">
                <Smartphone className="size-3" /> Samsung Health
              </span>
            )}
          </p>
          <p className="tabular text-caption text-muted-foreground">
            {t.minutos} min{t.fcMedia ? ` · média ${t.fcMedia} · pico ${t.fcMax}` : " · sem batimento medido"}
            {t.esforco != null && ` · esforço ${t.esforco}/10`}
            {t.carga != null && ` · carga ${t.carga}`}
            {t.calorias != null && ` · ${t.calorias} kcal`}
          </p>
        </div>
        {trocar && t.eventoId && (
          <Chips valor={t.modalidade} onChange={(m) => iniciar(async () => {
            const r = await alterarModalidade(t.eventoId!, m);
            if (r.error) toast.error(r.error); else { toast.success(`Agora é ${m}.`); setTrocar(false); }
          })} />
        )}
        <BarraZonas t={t} />
        {t.recuperacao && (
          <p className="tabular flex items-center gap-1.5 text-caption text-muted-foreground">
            <TrendingDown className="size-3.5 text-[#E5536A]" />
            Recuperação: de {t.recuperacao.fcFim} bpm caiu {t.recuperacao.queda1} em ~1 min{t.recuperacao.queda2 != null && ` e ${t.recuperacao.queda2} em ~2 min`}
          </p>
        )}
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
