import { AlertTriangle, Ban, CheckCircle2, CircleHelp, ThumbsUp } from "lucide-react";
import { ScoreBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { FATOR_LABEL, type Fator } from "@/lib/ml/scoring/engine";
import type { ComponenteScore } from "@/lib/ml/tipos";
import { cn } from "@/lib/utils";
import { n, pct, textos } from "./formato";

export interface ScoreLinha {
  id: string;
  score: number | string;
  confidence: number | string;
  eligible: boolean;
  components: unknown;
  positives: unknown;
  alerts: unknown;
  missing_data: string[] | null;
  hard_rule_failures: string[] | null;
  formula_version: number;
  model: string | null;
  prompt_version: string | null;
  reason: string | null;
  created_at: string;
}

function lerComponentes(v: unknown): ComponenteScore[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      key: String(c.key ?? ""),
      label: String(c.label ?? c.key ?? ""),
      weight: n(c.weight) ?? 0,
      value: n(c.value) ?? 0,
      points: n(c.points) ?? 0,
      detail: typeof c.detail === "string" ? c.detail : "",
      missing: c.missing === true,
      estimated: c.estimated === true,
    }));
}

const labelFator = (k: string) => FATOR_LABEL[k as Fator] ?? k;

/** Score total e decomposição por fator (spec §8 e §21) — nunca só um número. */
export function ScoreDetalhe({
  atual,
  historico,
  formatar,
}: {
  atual: ScoreLinha | null;
  historico: ScoreLinha[];
  formatar: (d: string) => string;
}) {
  if (!atual)
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
        Ainda sem score — o produto entra na análise depois do enriquecimento.
      </p>
    );

  const score = n(atual.score) ?? 0;
  const conf = n(atual.confidence) ?? 0;
  const comps = lerComponentes(atual.components);
  const somaPesos = comps.reduce((a, c) => a + c.weight, 0) || 1;
  const positivos = textos(atual.positives);
  const alertas = textos(atual.alerts);
  const falhas = atual.hard_rule_failures ?? [];
  const faltantes = atual.missing_data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex items-center gap-3">
          <span className="text-[2.75rem] font-semibold leading-none tracking-tight tabular">{Math.round(score)}</span>
          <div className="space-y-1">
            <ScoreBadge score={score} confianca={conf} />
            <p className="text-caption text-muted-foreground">de 100</p>
          </div>
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-caption">
            <span className="text-muted-foreground">Confiança</span>
            <span className="font-medium tabular">{pct(conf * 100)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-valuenow={Math.round(conf * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confiança do score">
            <div className="h-full rounded-full bg-tech" style={{ width: `${Math.round(conf * 100)}%` }} />
          </div>
          <p className="text-caption text-muted-foreground">Fração do peso total que tinha dado real.</p>
        </div>
        <div className="space-y-1.5">
          {atual.eligible ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3.5" aria-hidden /> Elegível
            </Badge>
          ) : (
            <Badge variant="destructive">
              <Ban className="size-3.5" aria-hidden /> Inelegível
            </Badge>
          )}
          {falhas.length > 0 && (
            <ul className="space-y-0.5">
              {falhas.map((f, i) => (
                <li key={i} className="text-caption text-destructive">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {faltantes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">Dados faltantes:</span>
          {faltantes.map((k) => (
            <Badge key={k} variant="outline" className="px-2 py-0">
              <CircleHelp className="size-3" aria-hidden /> {labelFator(k)}
            </Badge>
          ))}
        </div>
      )}

      {comps.length > 0 && (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[40rem] text-body-sm">
            <thead className="border-b border-border text-left text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Fator</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Peso</th>
                <th scope="col" className="w-40 py-2 pr-3 font-medium">Valor</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Pontos</th>
                <th scope="col" className="py-2 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {comps.map((c) => (
                <tr key={c.key} className={cn(c.weight === 0 && "text-muted-foreground")}>
                  <td className="py-2 pr-3 font-medium">{c.label || labelFator(c.key)}</td>
                  <td className="py-2 pr-3 text-right tabular">{pct((c.weight / somaPesos) * 100)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full", c.missing ? "bg-muted-foreground/40" : "bg-tech")}
                          style={{ width: `${Math.max(0, Math.min(100, c.value))}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-caption tabular">{Math.round(c.value)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular">{c.points.toFixed(1).replace(".", ",")}</td>
                  <td className="py-2 text-caption">
                    <span className="text-muted-foreground">{c.detail || "—"}</span>
                    {c.missing && (
                      <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-overline">
                        sem dado
                      </Badge>
                    )}
                    {c.estimated && (
                      <Badge variant="warning" className="ml-1.5 px-1.5 py-0 text-overline">
                        estimado
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(positivos.length > 0 || alertas.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-body-sm font-semibold">Motivos positivos</h3>
            {positivos.length ? (
              <ul className="space-y-1">
                {positivos.map((p, i) => (
                  <li key={i} className="flex gap-2 text-body-sm">
                    <ThumbsUp className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-muted-foreground">Nenhum.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-body-sm font-semibold">Alertas</h3>
            {alertas.length ? (
              <ul className="space-y-1">
                {alertas.map((a, i) => (
                  <li key={i} className="flex gap-2 text-body-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-muted-foreground">Nenhum.</p>
            )}
          </div>
        </div>
      )}

      <p className="text-caption text-muted-foreground">
        Fórmula v{atual.formula_version} · Modelo {atual.model ?? "sem IA"} · Prompt {atual.prompt_version ?? "—"} · Calculado{" "}
        {formatar(atual.created_at)}
        {atual.reason ? ` · ${atual.reason}` : ""}
      </p>

      {historico.length > 1 && (
        <details>
          <summary className="cursor-pointer text-caption font-medium text-muted-foreground hover:text-foreground">
            Histórico de score ({historico.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-body-sm">
              <thead className="text-left text-caption text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Data</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Score</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Confiança</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Fórmula</th>
                  <th scope="col" className="py-1.5 font-medium">Elegível</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {historico.map((h) => (
                  <tr key={h.id} className={cn(h.id === atual.id && "font-medium")}>
                    <td className="py-1.5 pr-3 tabular">{formatar(h.created_at)}</td>
                    <td className="py-1.5 pr-3 text-right tabular">{Math.round(n(h.score) ?? 0)}</td>
                    <td className="py-1.5 pr-3 text-right tabular">{pct((n(h.confidence) ?? 0) * 100)}</td>
                    <td className="py-1.5 pr-3">
                      v{h.formula_version}
                      {h.model ? ` · ${h.model}` : ""}
                    </td>
                    <td className="py-1.5">{h.eligible ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
