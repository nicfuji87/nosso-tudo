"use client";

import { useState, useTransition } from "react";
import {
  Flame, AlertTriangle, Pill, Wine, Coffee, Thermometer, Brain, BedDouble, StickyNote, Stethoscope, ClipboardCheck, Wind, Activity, Watch, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EventoDiario, MalEstar, RegistroSaude } from "@/lib/saude/dados";
import { excluirEvento, registrarEvento } from "@/app/app/saude/actions";
import { MiniBpm } from "./graficos-saude";
import { ESFORCO, MODALIDADES } from "./modalidades";

const TZ = "America/Sao_Paulo";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const diaRel = (iso: string) => {
  const dd = new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
  if (dd === new Date().toLocaleDateString("pt-BR", { timeZone: TZ })) return "Hoje";
  if (dd === new Date(Date.now() - 86_400_000).toLocaleDateString("pt-BR", { timeZone: TZ })) return "Ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: TZ });
};

type TipoEvento = "treino" | "malestar" | "sintoma" | "medicamento" | "alcool" | "cafeina" | "doenca" | "estresse" | "sono" | "nota";

const TIPOS: { tipo: TipoEvento; rotulo: string; icone: typeof Pill; cor: string; dica: string }[] = [
  { tipo: "treino", rotulo: "Treino", icone: Flame, cor: "#F08A3C", dica: "Para o treino que o relógio não pegou: lutou sem relógio, natação, musculação com descansos longos." },
  { tipo: "malestar", rotulo: "Mal-estar", icone: AlertTriangle, cor: "#D6336C", dica: "Tontura, palpitação, fraqueza… guarda o batimento ao redor." },
  { tipo: "sintoma", rotulo: "Sintoma", icone: Thermometer, cor: "#E5536A", dica: "Dor, febre, gripe, garganta…" },
  { tipo: "doenca", rotulo: "Fiquei doente", icone: Stethoscope, cor: "#B5475B", dica: "Ajuda a medir, depois, se os sinais do relógio anteciparam." },
  { tipo: "medicamento", rotulo: "Remédio", icone: Pill, cor: "#8B6CE0", dica: "Nome e dose." },
  { tipo: "alcool", rotulo: "Álcool", icone: Wine, cor: "#C2417A", dica: "Mexe na FC e na VFC da noite." },
  { tipo: "cafeina", rotulo: "Cafeína", icone: Coffee, cor: "#C9962A", dica: "Café tarde mexe no sono." },
  { tipo: "estresse", rotulo: "Estresse", icone: Brain, cor: "#3D6D84", dica: "Dia pesado, preocupação." },
  { tipo: "sono", rotulo: "Sono ruim", icone: BedDouble, cor: "#6E7FE0", dica: "Dormiu pouco ou mal." },
  { tipo: "nota", rotulo: "Nota", icone: StickyNote, cor: "#5A6066", dica: "Qualquer coisa que queira lembrar." },
];
const META = Object.fromEntries(TIPOS.map((t) => [t.tipo, t])) as Record<string, (typeof TIPOS)[number]>;

const SITUACOES = [
  { v: "deitado", r: "Deitado" }, { v: "levantando", r: "Levantando" }, { v: "parado", r: "Parado / sentado" },
  { v: "esforco", r: "No esforço" }, { v: "outro", r: "Outro" },
] as const;
const SINTOMAS_MALESTAR = ["Tontura", "Palpitação", "Visão escura", "Fraqueza", "Falta de ar", "Dor no peito", "Suor frio", "Náusea", "Desmaio"];
const ROTULO_SITUACAO: Record<string, string> = { deitado: "deitado", levantando: "levantando", parado: "parado", esforco: "no esforço", outro: "outra situação" };

/** "agora" no formato do <input type="datetime-local"> (hora local do navegador). */
function agoraLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function NovoEvento({ tipo, aoFechar }: { tipo: TipoEvento | null; aoFechar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [inicio, setInicio] = useState(agoraLocal);
  const [nota, setNota] = useState("");
  const [intensidade, setIntensidade] = useState<number | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [sintomas, setSintomas] = useState<string[]>([]);
  const meta = tipo ? META[tipo] : null;
  const ehMalEstar = tipo === "malestar";
  const ehTreino = tipo === "treino";
  const [modalidade, setModalidade] = useState<string | null>(null);
  const [duracao, setDuracao] = useState("60");
  const [esforco, setEsforco] = useState<number | null>(null);
  const urgente = sintomas.some((s) => s === "Dor no peito" || s === "Desmaio" || s === "Falta de ar");

  const salvar = () => iniciar(async () => {
    if (!tipo) return;
    const ini = new Date(inicio);
    const min = Math.max(5, Math.min(600, Number(duracao) || 60));
    const r = await registrarEvento({
      tipo, inicio: ini.toISOString(), nota: nota || undefined,
      ...(ehTreino ? { fim: new Date(ini.getTime() + min * 60_000).toISOString() } : {}),
      detalhes: ehTreino ? { modalidade: modalidade!, ...(esforco != null ? { esforco } : {}) } : {
        ...(intensidade != null ? { intensidade } : {}),
        ...(ehMalEstar && situacao ? { situacao } : {}),
        ...(ehMalEstar && sintomas.length ? { sintomas } : {}),
      },
    });
    if (r.error) toast.error(r.error);
    else { toast.success(`${meta?.rotulo} registrado no diário.`); aoFechar(); }
  });

  return (
    <Dialog open={!!tipo} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta && <meta.icone className="size-5" style={{ color: meta.cor }} />} {meta?.rotulo}
          </DialogTitle>
          <DialogDescription>{meta?.dica}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className={cn("grid gap-3", ehTreino && "grid-cols-[1fr_7rem]")}>
            <div className="space-y-1.5">
              <Label htmlFor="ev-inicio">{ehTreino ? "Começou" : "Quando"}</Label>
              <Input id="ev-inicio" type="datetime-local" value={inicio} max={agoraLocal()} onChange={(e) => setInicio(e.target.value)} />
            </div>
            {ehTreino && (
              <div className="space-y-1.5">
                <Label htmlFor="ev-duracao">Duração (min)</Label>
                <Input id="ev-duracao" type="number" inputMode="numeric" min={5} max={600} step={5} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
              </div>
            )}
          </div>
          {ehTreino && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="text-body-sm font-medium">Modalidade</legend>
                <div className="flex flex-wrap gap-2">
                  {MODALIDADES.map(({ nome, icone: Icone }) => (
                    <button key={nome} type="button" aria-pressed={modalidade === nome} onClick={() => setModalidade(nome)}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-body-sm",
                        modalidade === nome ? "border-[#F08A3C] bg-[#F08A3C] text-white" : "border-border hover:bg-secondary")}>
                      <Icone className="size-4" /> {nome}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="text-body-sm font-medium">
                  Esforço percebido{esforco != null && <span className="font-normal text-muted-foreground"> · {esforco} — {ESFORCO[esforco]}</span>}
                </legend>
                <div className="grid grid-cols-11 gap-1">
                  {ESFORCO.map((rotulo, i) => (
                    <button key={i} type="button" aria-pressed={esforco === i} title={rotulo} onClick={() => setEsforco(i)}
                      className={cn("tabular h-8 rounded-md text-caption font-medium", esforco === i ? "text-white" : "bg-secondary text-muted-foreground hover:text-foreground")}
                      style={esforco === i ? { backgroundColor: `hsl(${30 - i * 3} 85% ${58 - i * 2}%)` } : undefined}>
                      {i}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {ehMalEstar && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="text-body-sm font-medium">O que você estava fazendo?</legend>
                <div className="flex flex-wrap gap-2">
                  {SITUACOES.map((s) => (
                    <button key={s.v} type="button" aria-pressed={situacao === s.v} onClick={() => setSituacao(s.v)}
                      className={cn("h-9 rounded-full border px-3.5 text-body-sm", situacao === s.v ? "border-[#D6336C] bg-[#D6336C] text-white" : "border-border hover:bg-secondary")}>
                      {s.r}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="text-body-sm font-medium">O que sentiu?</legend>
                <div className="flex flex-wrap gap-2">
                  {SINTOMAS_MALESTAR.map((s) => {
                    const on = sintomas.includes(s);
                    return (
                      <button key={s} type="button" aria-pressed={on} onClick={() => setSintomas((v) => (on ? v.filter((x) => x !== s) : [...v, s]))}
                        className={cn("h-8 rounded-full border px-3 text-caption", on ? "border-[#D6336C]/50 bg-[#D6336C]/12 text-foreground" : "border-border text-muted-foreground hover:bg-secondary")}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              {urgente && (
                <p className="rounded-lg bg-destructive/10 p-3 text-caption text-destructive">
                  Dor no peito, desmaio ou falta de ar merecem avaliação médica — o registro aqui complementa, não substitui.
                </p>
              )}
            </>
          )}
          {tipo !== "nota" && tipo !== "medicamento" && !ehTreino && (
            <fieldset className="space-y-1.5">
              <legend className="text-body-sm font-medium">Intensidade</legend>
              <div className="grid grid-cols-5 gap-1.5">
                {["Leve", "", "Média", "", "Forte"].map((r, i) => (
                  <button key={i} type="button" aria-pressed={intensidade === i + 1} aria-label={`Intensidade ${i + 1} de 5`} onClick={() => setIntensidade(i + 1)}
                    className={cn("h-9 rounded-md text-caption", intensidade === i + 1 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                    {i + 1}{r && <span className="ml-1 hidden sm:inline">{r}</span>}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ev-nota">{tipo === "medicamento" ? "Qual e quanto" : "Observação"}</Label>
            <Input id="ev-nota" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)}
              placeholder={tipo === "medicamento" ? "Ex.: dipirona 1 g" : tipo === "alcool" ? "Ex.: 2 taças de vinho" : ehTreino ? "Ex.: rola leve, 5 lutas de 6 min" : "Opcional"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
          <Button variant="accent" disabled={pendente || (ehMalEstar && !situacao) || (ehTreino && !modalidade)} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Teste em pé (relógio): {"d","p","m1","m3","s"} → "Teste em pé: deitado 58 → 3 min 78 (+20 bpm)". */
function tituloOrtostatico(valor: string) {
  try {
    const o = JSON.parse(valor) as { d?: number; p?: number; m3?: number; s?: boolean };
    const delta = o.d != null && o.m3 != null ? o.m3 - o.d : null;
    return `Teste em pé: deitado ${o.d ?? "—"} → 3 min ${o.m3 ?? "—"}` +
      (delta != null ? ` (${delta >= 0 ? "+" : ""}${delta} bpm)` : "") + (o.p != null ? ` · pico ${o.p}` : "") + (o.s ? " · com sintomas" : "");
  } catch {
    return "Teste em pé";
  }
}

type Item =
  | { k: "evento"; ts: string; e: EventoDiario }
  | { k: "registro"; ts: string; r: RegistroSaude };

const ICONE_REGISTRO: Record<string, { icone: typeof Pill; cor: string; titulo: (r: RegistroSaude) => string }> = {
  checkin: { icone: ClipboardCheck, cor: "#3F9B52", titulo: (r) => `Check-in: ${r.valor}` },
  habito: { icone: Coffee, cor: "#C9962A", titulo: (r) => r.valor },
  respiracao: { icone: Wind, cor: "#1FA9B0", titulo: () => "Respiração guiada" },
  ecg: { icone: Activity, cor: "#E5536A", titulo: (r) => `ECG · ${r.valor}` },
  malestar: { icone: AlertTriangle, cor: "#D6336C", titulo: (r) => `Mal-estar (relógio)${r.valor ? ` · ${ROTULO_SITUACAO[r.valor] ?? r.valor}` : ""}` },
  ortostatico: { icone: Activity, cor: "#6E7FE0", titulo: (r) => tituloOrtostatico(r.valor) },
};

export function DiarioSaude({ eventos, registros, malEstares }: { eventos: EventoDiario[]; registros: RegistroSaude[]; malEstares: MalEstar[] }) {
  const [aberto, setAberto] = useState<TipoEvento | null>(null);
  const [pendente, iniciar] = useTransition();
  const serie = new Map(malEstares.map((m) => [m.id, m]));

  const itens: Item[] = [
    ...eventos.filter((e) => e.tipo !== "treino").map((e) => ({ k: "evento" as const, ts: e.inicio, e })),
    ...registros.map((r) => ({ k: "registro" as const, ts: r.ts, r })),
  ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 30);

  const grupos = new Map<string, Item[]>();
  for (const it of itens) {
    const g = diaRel(it.ts);
    (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(it);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button key={t.tipo} type="button" onClick={() => setAberto(t.tipo)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-body-sm transition hover:-translate-y-0.5 hover:shadow-card">
            <t.icone className="size-4" style={{ color: t.cor }} /> {t.rotulo}
          </button>
        ))}
      </div>

      {itens.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">
          Nada no diário ainda. Registrar sintomas, remédios, álcool e dias doente é o que permite, com o tempo, saber se os sinais do relógio ajudam de verdade.
        </p>
      ) : (
        <div className="space-y-4">
          {[...grupos.entries()].map(([g, lista]) => (
            <section key={g}>
              <h3 className="mb-1 text-overline uppercase text-muted-foreground">{g}</h3>
              <ul className="divide-y divide-border/60">
                {lista.map((it) => {
                  if (it.k === "registro") {
                    const m = ICONE_REGISTRO[it.r.tipo] ?? { icone: StickyNote, cor: "#5A6066", titulo: (r: RegistroSaude) => r.valor };
                    const det = serie.get(it.r.id);
                    return (
                      <li key={`r-${it.r.id}`} className="py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: `${m.cor}1F` }}>
                            <m.icone className="size-4" style={{ color: m.cor }} />
                          </span>
                          <p className="min-w-0 flex-1 truncate text-body-sm">{m.titulo(it.r)}</p>
                          <Watch className="size-3.5 text-muted-foreground" aria-label="registrado no relógio" />
                          <span className="tabular text-caption text-muted-foreground">{hora(it.ts)}</span>
                        </div>
                        {det && <div className="mt-2 pl-11"><MiniBpm pontos={det.serie} momento={det.ts} /></div>}
                      </li>
                    );
                  }
                  const e = it.e;
                  const m = META[e.tipo] ?? META.nota!;
                  const det = serie.get(e.id);
                  const extra = [
                    e.detalhes?.situacao ? ROTULO_SITUACAO[String(e.detalhes.situacao)] : null,
                    Array.isArray(e.detalhes?.sintomas) ? (e.detalhes.sintomas as string[]).join(", ") : null,
                    typeof e.detalhes?.intensidade === "number" ? `intensidade ${e.detalhes.intensidade}/5` : null,
                    e.nota,
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={`e-${e.id}`} className="group py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: `${m.cor}1F` }}>
                          <m.icone className="size-4" style={{ color: m.cor }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium">{m.rotulo}</p>
                          {extra && <p className="truncate text-caption text-muted-foreground">{extra}</p>}
                        </div>
                        <button type="button" aria-label="Excluir do diário" disabled={pendente}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 focus:opacity-100"
                          onClick={() => iniciar(async () => { const r = await excluirEvento(e.id); if (r.error) toast.error(r.error); })}>
                          <Trash2 className="size-4" />
                        </button>
                        <span className="tabular text-caption text-muted-foreground">{hora(e.inicio)}</span>
                      </div>
                      {det && <div className="mt-2 pl-11"><MiniBpm pontos={det.serie} momento={det.ts} /></div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <NovoEvento key={aberto ?? "fechado"} tipo={aberto} aoFechar={() => setAberto(null)} />
    </div>
  );
}
