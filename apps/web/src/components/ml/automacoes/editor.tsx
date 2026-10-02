"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { previaAgenda, salvarAgendamento } from "@/app/ml/(painel)/automacoes/actions";
import { Campo, Checkbox, NativeSelect, Textarea } from "@/components/ml/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cronParaSimples, descreverCron, simplesParaCron, TIMEZONES_SUGERIDOS, type AgendaSimples } from "@/lib/ml/cron";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { dicaConfig, OVERLAP_DICA, OVERLAP_LABEL, rotuloConfig } from "./rotulos";

export interface AgendamentoEditavel {
  id: string;
  name: string;
  description: string | null;
  job_type: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  overlap_policy: "skip" | "queue" | "cancel_previous";
  config: Record<string, unknown>;
}

type TipoCampo = "number" | "boolean" | "string" | "json";
type Modo = "simples" | "avancado";
type Previa = { carregando: boolean; valido: boolean; erro?: string; proximas: string[] };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const INTERVALOS = [5, 10, 15, 20, 30] as const;
const HORAS = [1, 2, 3, 4, 6, 8, 12] as const;
const PADRAO: AgendaSimples = { tipo: "diario", hora: 6, minuto: 0, dias: [] };

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

function tipoDoValor(v: unknown): TipoCampo {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  return "json";
}

function camposIniciais(config: Record<string, unknown>) {
  const tipos: Record<string, TipoCampo> = {};
  const valores: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(config)) {
    const t = tipoDoValor(v);
    tipos[k] = t;
    valores[k] = t === "boolean" ? Boolean(v) : t === "json" ? JSON.stringify(v, null, 2) : String(v ?? "");
  }
  return { tipos, valores };
}

/** Converte o formulário de volta para o JSON de config; devolve erro legível se algo não fecha. */
function montarConfig(
  tipos: Record<string, TipoCampo>,
  valores: Record<string, string | boolean>,
): { ok: true; config: Record<string, unknown> } | { ok: false; erro: string } {
  const config: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(tipos)) {
    const v = valores[k];
    if (t === "boolean") config[k] = Boolean(v);
    else if (t === "number") {
      const n = Number(String(v ?? "").replace(",", "."));
      if (String(v ?? "").trim() === "" || !Number.isFinite(n)) return { ok: false, erro: `${rotuloConfig(k)}: informe um número.` };
      config[k] = n;
    } else if (t === "string") config[k] = String(v ?? "");
    else {
      try {
        config[k] = JSON.parse(String(v ?? "null"));
      } catch {
        return { ok: false, erro: `${rotuloConfig(k)}: JSON inválido.` };
      }
    }
  }
  return { ok: true, config };
}

function lerHora(valor: string): { hora: number; minuto: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor);
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return null;
  return { hora, minuto };
}

export function EditorAgendamento({ agendamento }: { agendamento: AgendamentoEditavel }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciarSalvar] = useTransition();

  const [modo, setModo] = useState<Modo>("simples");
  const [simples, setSimples] = useState<AgendaSimples>(PADRAO);
  const [avancado, setAvancado] = useState(agendamento.cron_expression);
  const [tz, setTz] = useState(agendamento.timezone);
  const [enabled, setEnabled] = useState(agendamento.enabled);
  const [overlap, setOverlap] = useState(agendamento.overlap_policy);
  const [tipos, setTipos] = useState<Record<string, TipoCampo>>({});
  const [valores, setValores] = useState<Record<string, string | boolean>>({});
  const [avisoModo, setAvisoModo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa>({ carregando: false, valido: true, proximas: [] });
  const seq = useRef(0);

  const reiniciar = () => {
    const s = cronParaSimples(agendamento.cron_expression);
    setModo(s ? "simples" : "avancado");
    setSimples(s ?? PADRAO);
    setAvancado(agendamento.cron_expression);
    setTz(agendamento.timezone);
    setEnabled(agendamento.enabled);
    setOverlap(agendamento.overlap_policy);
    const c = camposIniciais(agendamento.config ?? {});
    setTipos(c.tipos);
    setValores(c.valores);
    setAvisoModo(null);
  };

  const cronAtual = modo === "simples" ? simplesParaCron(simples) : avancado.trim();

  // Prévia das próximas 5 execuções (debounce ~400 ms).
  useEffect(() => {
    if (!aberto) return;
    const meu = ++seq.current;
    setPrevia((p) => ({ ...p, carregando: true }));
    const t = setTimeout(async () => {
      const r = await previaAgenda(cronAtual, tz);
      if (meu !== seq.current) return;
      if (!r.ok) setPrevia({ carregando: false, valido: false, erro: r.error, proximas: [] });
      else setPrevia({ carregando: false, valido: r.valido, erro: r.erro, proximas: r.proximas });
    }, 400);
    return () => clearTimeout(t);
  }, [aberto, cronAtual, tz]);

  const opcoesTz = useMemo(() => {
    const lista: string[] = [...TIMEZONES_SUGERIDOS];
    if (!lista.includes(agendamento.timezone)) lista.unshift(agendamento.timezone);
    return lista;
  }, [agendamento.timezone]);

  const mudarTipo = (tipo: AgendaSimples["tipo"]) => {
    const atual = simples;
    const hora = "hora" in atual ? atual.hora : 6;
    const minuto = "minuto" in atual ? atual.minuto : 0;
    if (tipo === "intervalo") setSimples({ tipo, minutos: 15 });
    else if (tipo === "horas") setSimples({ tipo, aCada: 1, minuto });
    else if (tipo === "diario") setSimples({ tipo, hora, minuto, dias: [] });
    else setSimples({ tipo, dia: 1, hora, minuto });
  };

  const trocarModo = (novo: Modo) => {
    setAvisoModo(null);
    if (novo === modo) return;
    if (novo === "avancado") {
      setAvancado(simplesParaCron(simples));
      setModo("avancado");
      return;
    }
    const s = cronParaSimples(avancado);
    if (!s) {
      setAvisoModo("Esta expressão não cabe no modo simples — continue no modo avançado ou simplifique-a.");
      return;
    }
    setSimples(s);
    setModo("simples");
  };

  const salvar = () => {
    const cfg = montarConfig(tipos, valores);
    if (!cfg.ok) {
      toast.error(cfg.erro);
      return;
    }
    if (!previa.valido) {
      toast.error(previa.erro ?? "Expressão cron inválida.");
      return;
    }
    iniciarSalvar(async () => {
      const r = await salvarAgendamento(agendamento.id, {
        cron_expression: cronAtual,
        timezone: tz,
        enabled,
        overlap_policy: overlap,
        config: cfg.config,
        ui: modo === "simples" ? { ...simples } : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem ?? "Automação salva.");
      setAberto(false);
      router.refresh();
    });
  };

  const chavesConfig = Object.keys(tipos);

  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => {
        if (v) reiniciar();
        setAberto(v);
      }}
    >
      <Button size="sm" variant="secondary" onClick={() => { reiniciar(); setAberto(true); }}>
        <Pencil /> Editar
      </Button>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 pb-4 pt-6">
          <SheetTitle className="pr-8">{agendamento.name}</SheetTitle>
          <SheetDescription>
            {agendamento.description ?? labelJob(agendamento.job_type)} · job <span className="font-mono">{agendamento.job_type}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Ativação */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
            <div>
              <p className="text-body-sm font-medium">Automação ativa</p>
              <p className="text-caption text-muted-foreground">Desativada, não roda no horário (o “Executar agora” continua funcionando).</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Automação ativa" />
          </div>

          {/* Agenda */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-body-sm font-semibold">Quando roda</h3>
              <div className="inline-flex rounded-full bg-secondary p-0.5 text-caption" role="tablist" aria-label="Modo do editor">
                {(["simples", "avancado"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={modo === m}
                    onClick={() => trocarModo(m)}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium transition-colors",
                      modo === m ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "simples" ? "Simples" : "Avançado (cron)"}
                  </button>
                ))}
              </div>
            </div>
            {avisoModo && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-caption text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {avisoModo}
              </p>
            )}

            {modo === "simples" ? (
              <div className="space-y-3">
                <Campo label="Frequência">
                  <NativeSelect className="w-full" value={simples.tipo} onChange={(e) => mudarTipo(e.target.value as AgendaSimples["tipo"])}>
                    <option value="intervalo">A cada X minutos</option>
                    <option value="horas">A cada X horas</option>
                    <option value="diario">Diário / dias da semana</option>
                    <option value="mensal">Mensal</option>
                  </NativeSelect>
                </Campo>

                {simples.tipo === "intervalo" && (
                  <Campo label="Intervalo">
                    <NativeSelect
                      className="w-full"
                      value={simples.minutos}
                      onChange={(e) => setSimples({ tipo: "intervalo", minutos: Number(e.target.value) as (typeof INTERVALOS)[number] })}
                    >
                      {INTERVALOS.map((m) => (
                        <option key={m} value={m}>
                          A cada {m} minutos
                        </option>
                      ))}
                    </NativeSelect>
                  </Campo>
                )}

                {simples.tipo === "horas" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Campo label="A cada">
                      <NativeSelect
                        className="w-full"
                        value={simples.aCada}
                        onChange={(e) => setSimples({ ...simples, aCada: Number(e.target.value) as (typeof HORAS)[number] })}
                      >
                        {HORAS.map((h) => (
                          <option key={h} value={h}>
                            {h === 1 ? "1 hora" : `${h} horas`}
                          </option>
                        ))}
                      </NativeSelect>
                    </Campo>
                    <Campo label="No minuto" dica="0 a 59">
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        inputMode="numeric"
                        value={simples.minuto}
                        onChange={(e) => {
                          const n = Math.min(59, Math.max(0, Math.trunc(Number(e.target.value) || 0)));
                          setSimples({ ...simples, minuto: n });
                        }}
                      />
                    </Campo>
                  </div>
                )}

                {simples.tipo === "diario" && (
                  <>
                    <fieldset className="space-y-1.5">
                      <legend className="text-body-sm font-medium">Dias da semana</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map((d, i) => {
                          const marcado = simples.dias.includes(i);
                          return (
                            <label
                              key={d}
                              className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors",
                                marcado ? "border-tech/50 bg-tech/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                              )}
                            >
                              <Checkbox
                                checked={marcado}
                                onChange={(e) => {
                                  const dias = e.target.checked ? [...simples.dias, i] : simples.dias.filter((x) => x !== i);
                                  setSimples({ ...simples, dias: [...new Set(dias)].sort((a, b) => a - b) });
                                }}
                              />
                              {d}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {simples.dias.length === 0 || simples.dias.length === 7 ? "Todos os dias." : "Só nos dias marcados."}
                      </p>
                    </fieldset>
                    <Campo label="Horário">
                      <Input
                        type="time"
                        value={hhmm(simples.hora, simples.minuto)}
                        onChange={(e) => {
                          const h = lerHora(e.target.value);
                          if (h) setSimples({ ...simples, ...h });
                        }}
                        className="w-40"
                      />
                    </Campo>
                  </>
                )}

                {simples.tipo === "mensal" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Campo label="Dia do mês" dica={simples.dia > 28 ? "Meses sem esse dia são pulados." : undefined}>
                      <NativeSelect
                        className="w-full"
                        value={simples.dia}
                        onChange={(e) => setSimples({ ...simples, dia: Number(e.target.value) })}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            Dia {d}
                          </option>
                        ))}
                      </NativeSelect>
                    </Campo>
                    <Campo label="Horário">
                      <Input
                        type="time"
                        value={hhmm(simples.hora, simples.minuto)}
                        onChange={(e) => {
                          const h = lerHora(e.target.value);
                          if (h) setSimples({ ...simples, ...h });
                        }}
                      />
                    </Campo>
                  </div>
                )}
                <p className="text-caption text-muted-foreground">
                  Equivale a <code className="rounded bg-secondary px-1 py-0.5 font-mono">{cronAtual}</code>
                </p>
              </div>
            ) : (
              <Campo label="Expressão cron" dica="5 campos: minuto hora dia-do-mês mês dia-da-semana (0 = domingo). Ex.: 0 6 * * 1-5">
                <Input
                  value={avancado}
                  onChange={(e) => setAvancado(e.target.value)}
                  className={cn("font-mono", !previa.valido && !previa.carregando && "border-destructive")}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={!previa.valido}
                />
              </Campo>
            )}

            <Campo label="Fuso horário">
              <NativeSelect className="w-full" value={tz} onChange={(e) => setTz(e.target.value)}>
                {opcoesTz.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </NativeSelect>
            </Campo>

            {/* Prévia */}
            <div className="rounded-lg border border-border/70 p-3" aria-live="polite">
              <p className="mb-2 flex items-center gap-2 text-caption font-medium">
                <CalendarClock className="size-3.5 text-tech" aria-hidden /> Próximas 5 execuções
                {previa.carregando && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Calculando" />}
              </p>
              {!previa.valido ? (
                <p className="flex items-start gap-1.5 text-caption text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {previa.erro ?? "Expressão inválida."}
                </p>
              ) : previa.proximas.length === 0 ? (
                <p className="text-caption text-muted-foreground">Calculando…</p>
              ) : (
                <>
                  <p className="mb-1.5 text-caption text-muted-foreground">{descreverCron(cronAtual)} ({tz})</p>
                  <ol className="tabular space-y-0.5 text-caption">
                    {previa.proximas.map((iso) => (
                      <li key={iso}>
                        {formatarNoFuso(iso, tz, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </section>

          {/* Sobreposição */}
          <section className="space-y-2">
            <h3 className="text-body-sm font-semibold">Se a execução anterior ainda estiver rodando</h3>
            <NativeSelect
              className="w-full"
              value={overlap}
              onChange={(e) => setOverlap(e.target.value as AgendamentoEditavel["overlap_policy"])}
            >
              {Object.entries(OVERLAP_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <p className="text-caption text-muted-foreground">{OVERLAP_DICA[overlap]}</p>
          </section>

          {/* Parâmetros */}
          <section className="space-y-3">
            <h3 className="text-body-sm font-semibold">Parâmetros</h3>
            {chavesConfig.length === 0 ? (
              <p className="text-caption text-muted-foreground">Esta automação não tem parâmetros ajustáveis.</p>
            ) : (
              chavesConfig.map((k) => {
                const t = tipos[k];
                const v = valores[k];
                const dica = dicaConfig(k, agendamento.job_type);
                const rotulo = rotuloConfig(k, agendamento.job_type);
                if (t === "boolean") {
                  return (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-body-sm font-medium">{rotulo}</p>
                        {dica && <p className="text-caption text-muted-foreground">{dica}</p>}
                      </div>
                      <Switch checked={Boolean(v)} onCheckedChange={(b) => setValores((s) => ({ ...s, [k]: b }))} aria-label={rotulo} />
                    </div>
                  );
                }
                if (t === "json") {
                  return (
                    <Campo key={k} label={rotulo} dica={dica ?? "Valor em JSON."}>
                      <Textarea
                        className="font-mono text-caption"
                        value={String(v ?? "")}
                        onChange={(e) => setValores((s) => ({ ...s, [k]: e.target.value }))}
                        spellCheck={false}
                      />
                    </Campo>
                  );
                }
                return (
                  <Campo key={k} label={rotulo} dica={dica}>
                    <Input
                      type={t === "number" ? "number" : "text"}
                      inputMode={t === "number" ? "decimal" : undefined}
                      value={String(v ?? "")}
                      onChange={(e) => setValores((s) => ({ ...s, [k]: e.target.value }))}
                    />
                  </Campo>
                );
              })
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <SheetClose asChild>
            <Button variant="ghost" size="sm" disabled={salvando}>
              Cancelar
            </Button>
          </SheetClose>
          <Button size="sm" variant="tech" onClick={salvar} disabled={salvando || previa.carregando || !previa.valido} aria-busy={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
