import Link from "next/link";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { PinThumb } from "./thumb";
import { StatusIcone, rotuloStatusPin } from "./status-icone";
import { hrefCom, quandoPin, type ParamsUrl, type PinView } from "./tipos";

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const BASE = "/ml/publicacoes";

/** Aritmética de calendário sobre "YYYY-MM-DD" (sem fuso — o dia já vem calculado no fuso configurado). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function hora(iso: string | null, tz: string) {
  return iso ? formatarNoFuso(iso, tz, { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

function rotuloDia(dia: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts }).format(new Date(`${dia}T12:00:00Z`));
}

function Chip({ pin, tz, params }: { pin: PinView; tz: string; params: ParamsUrl }) {
  const titulo = pin.title || pin.creative?.headline || pin.product?.title || "Pin";
  return (
    <Link
      href={hrefCom(BASE, params, { pin: pin.id })}
      scroll={false}
      title={`${hora(quandoPin(pin), tz)} · ${rotuloStatusPin(pin.status)} · ${titulo}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-1 py-0.5 text-caption transition-colors hover:border-tech/50 hover:bg-tech/5",
        (pin.status === "failed" || pin.status === "blocked") && "border-destructive/40",
        pin.status === "canceled" && "opacity-60",
      )}
    >
      <PinThumb pin={pin} className="w-4 rounded-sm" />
      <span className="tabular">{hora(quandoPin(pin), tz)}</span>
      <StatusIcone status={pin.status} className="ml-auto" />
    </Link>
  );
}

export function CalendarioMes({
  mes,
  hoje,
  porDia,
  tz,
  params,
}: {
  mes: string; // YYYY-MM
  hoje: string; // YYYY-MM-DD no fuso
  porDia: Map<string, PinView[]>;
  tz: string;
  params: ParamsUrl;
}) {
  const primeiro = `${mes}-01`;
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const dowPrimeiro = (new Date(`${primeiro}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  const inicio = somarDias(primeiro, -dowPrimeiro);
  const dias: string[] = [];
  for (let d = inicio; dias.length < 42; d = somarDias(d, 1)) {
    dias.push(d);
    if (dias.length % 7 === 0 && d >= ultimo) break;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-card">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-7 border-b border-border/70 bg-secondary/40">
          {SEMANA.map((d) => (
            <div key={d} className="px-2 py-1.5 text-overline uppercase tracking-wide text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((dia, i) => {
            const pins = porDia.get(dia) ?? [];
            const foraDoMes = !dia.startsWith(mes);
            const visiveis = pins.slice(0, 4);
            const resto = pins.length - visiveis.length;
            return (
              <div
                key={dia}
                className={cn(
                  "min-h-28 space-y-1 border-border/60 p-1.5",
                  i % 7 !== 6 && "border-r",
                  i < dias.length - 7 && "border-b",
                  foraDoMes && "bg-secondary/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "tabular flex size-6 items-center justify-center rounded-full text-caption",
                      dia === hoje ? "bg-tech font-semibold text-tech-foreground" : foraDoMes ? "text-muted-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {Number(dia.slice(8))}
                  </span>
                  {pins.length > 0 && <span className="text-overline text-muted-foreground">{pins.length}</span>}
                </div>
                {visiveis.map((p) => (
                  <Chip key={p.id} pin={p} tz={tz} params={params} />
                ))}
                {resto > 0 && (
                  <Link
                    href={hrefCom(BASE, params, { vista: "semana", semana: somarDias(dia, -((new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7)), mes: null })}
                    className="block px-1 text-caption text-tech hover:underline"
                  >
                    +{resto} mais
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Semana({
  inicio,
  hoje,
  porDia,
  tz,
  params,
}: {
  inicio: string;
  hoje: string;
  porDia: Map<string, PinView[]>;
  tz: string;
  params: ParamsUrl;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {dias.map((dia) => {
        const pins = porDia.get(dia) ?? [];
        return (
          <section
            key={dia}
            className={cn("min-h-40 rounded-xl border border-border/70 bg-card p-2 shadow-card", dia === hoje && "border-tech/60")}
            aria-label={rotuloDia(dia, { weekday: "long", day: "numeric", month: "long" })}
          >
            <header className="mb-2 flex items-baseline justify-between gap-1 px-1">
              <span className="text-overline uppercase tracking-wide text-muted-foreground">{rotuloDia(dia, { weekday: "short" })}</span>
              <span className={cn("tabular text-body-sm font-semibold", dia === hoje && "text-tech")}>
                {rotuloDia(dia, { day: "2-digit", month: "2-digit" })}
              </span>
            </header>
            {pins.length === 0 ? (
              <p className="px-1 text-caption text-muted-foreground/70">—</p>
            ) : (
              <ul className="space-y-1.5">
                {pins.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={hrefCom(BASE, params, { pin: p.id })}
                      scroll={false}
                      className={cn(
                        "flex gap-2 rounded-lg border border-border/60 p-1.5 transition-colors hover:border-tech/50 hover:bg-tech/5",
                        (p.status === "failed" || p.status === "blocked") && "border-destructive/40",
                        p.status === "canceled" && "opacity-60",
                      )}
                    >
                      <PinThumb pin={p} className="w-9 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-caption">
                          <StatusIcone status={p.status} />
                          <span className="tabular font-medium">{hora(quandoPin(p), tz)}</span>
                        </div>
                        <p className="line-clamp-2 text-caption leading-snug">{p.product?.title ?? p.title ?? "Pin"}</p>
                        {p.board && <p className="truncate text-overline text-muted-foreground">{p.board.name}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
