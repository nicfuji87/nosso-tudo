"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Layers,
  Route,
  ShieldAlert,
  Sparkles,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatBRL, formatNumber } from "@/lib/format";
import type { ProgramaViagem } from "@/lib/viagens/tipos";
import type { AvisoCaminho, CaminhoMilhas, ResultadoCaminhos } from "@/lib/viagens/caminho";
import { simularCaminho } from "@/app/app/admin/viagens/actions";

/**
 * Simulador do motor de caminho — o teste de fumaça da Fase 0.
 *
 * Digite saldos e uma emissão alvo; o motor real roda contra o grafo real. É
 * como se confere que a curadoria produz caminhos que fazem sentido, antes de
 * existir carteira do usuário ou chat da Nia.
 *
 * Composição: números em fonte mono e tabular de propósito — comparar 47.693
 * com 48.000 exige que os dígitos alinhem na vertical.
 */

interface Props {
  programas: ProgramaViagem[];
}

const ICONE_AVISO: Record<AvisoCaminho["tipo"], typeof ShieldAlert> = {
  nao_verificado: ShieldAlert,
  dado_velho: TimerReset,
  bonus_expirado: CircleAlert,
  bonus_vencendo: TriangleAlert,
  muitos_saltos: Layers,
  sem_valor_referencia: CircleAlert,
};

/** Aviso que compromete a confiança no número vs. aviso que é só contexto. */
const AVISO_GRAVE: AvisoCaminho["tipo"][] = ["nao_verificado", "bonus_vencendo", "bonus_expirado"];

function Milhas({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums tracking-tight", className)}>
      {formatNumber(valor)}
    </span>
  );
}

function AvisoLinha({ aviso }: { aviso: AvisoCaminho }) {
  const Icone = ICONE_AVISO[aviso.tipo];
  const grave = AVISO_GRAVE.includes(aviso.tipo);
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-caption leading-relaxed",
        grave ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icone className="mt-0.5 size-3.5 shrink-0" />
      <span>{aviso.mensagem}</span>
    </li>
  );
}

/**
 * O caminho como fluxo: cada nó mostra quantas milhas existem ali, e cada
 * seta mostra a transformação que acontece no salto. É a peça que faz o
 * usuário entender por que o número final é aquele.
 */
function FluxoCaminho({ caminho }: { caminho: CaminhoMilhas }) {
  const primeiro = caminho.passos[0];
  if (!primeiro) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-success/10 px-4 py-3">
        <BadgeCheck className="size-4 shrink-0 text-success" />
        <p className="text-body-sm">
          Já está no programa certo — <Milhas valor={caminho.milhasConsumidas} /> milhas, sem
          transferir nada.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-stretch gap-y-3">
      <NoFluxo nome={caminho.origemNome} milhas={primeiro.milhasEntrada} origem />
      {caminho.passos.map((p) => (
        <div key={p.transferenciaId} className="flex items-stretch">
          <div className="flex w-[104px] flex-col items-center justify-center px-1">
            <span className="font-mono text-[0.625rem] leading-none text-muted-foreground">
              {p.ratioOrigem}:{p.ratioDestino}
            </span>
            <ArrowRight className="my-1 size-4 text-border" strokeWidth={2.5} />
            {p.bonusAplicado > 0 ? (
              <span className="rounded-full bg-accent/25 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold leading-none text-foreground">
                +{formatNumber(p.bonusAplicado)}%
              </span>
            ) : (
              <span className="text-[0.625rem] leading-none text-muted-foreground">
                {p.prazoDiasMax === 0 ? "na hora" : `${p.prazoDiasMax}d`}
              </span>
            )}
          </div>
          <NoFluxo nome={p.destinoNome} milhas={p.milhasSaida} />
        </div>
      ))}
    </div>
  );
}

function NoFluxo({
  nome,
  milhas,
  origem = false,
}: {
  nome: string;
  milhas: number;
  origem?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[132px] flex-col justify-center rounded-lg border px-3 py-2",
        origem ? "border-foreground/25 bg-secondary" : "border-border bg-card",
      )}
    >
      <span className="truncate text-caption text-muted-foreground">{nome}</span>
      <Milhas valor={milhas} className="text-body-sm font-semibold" />
    </div>
  );
}

function CartaoCaminho({
  caminho,
  posicao,
  alvo,
}: {
  caminho: CaminhoMilhas;
  posicao: number;
  alvo: number;
}) {
  const melhor = posicao === 0 && caminho.cobreSozinho;
  const graves = caminho.avisos.filter((a) => AVISO_GRAVE.includes(a.tipo)).length;

  return (
    <article
      className={cn(
        "animate-fade-up rounded-xl border bg-card p-4 shadow-card",
        melhor ? "border-accent/60 ring-1 ring-accent/25" : "border-border",
      )}
      style={{ animationDelay: `${posicao * 60}ms` }}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {melhor ? (
            <Badge variant="accent" size="sm">
              <Sparkles className="size-3" />
              melhor caminho
            </Badge>
          ) : (
            <span className="font-mono text-caption text-muted-foreground">#{posicao + 1}</span>
          )}
          <h4 className="text-body-sm font-semibold">{caminho.origemNome}</h4>
          {!caminho.cobreSozinho && (
            <Badge variant="warning" size="sm">
              não cobre sozinho
            </Badge>
          )}
          {graves > 0 && (
            <Badge variant="destructive" size="sm">
              {graves} alerta{graves > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 text-caption text-muted-foreground">
          <span>
            {caminho.saltos === 0
              ? "sem transferência"
              : `${caminho.saltos} transferência${caminho.saltos > 1 ? "s" : ""}`}
          </span>
          {caminho.prazoDiasMax > 0 && <span>até {caminho.prazoDiasMax}d</span>}
          {caminho.custoEstimadoCents != null && (
            <span className="font-mono font-semibold text-foreground">
              ≈ {formatBRL(caminho.custoEstimadoCents / 100)}
            </span>
          )}
        </div>
      </header>

      <FluxoCaminho caminho={caminho} />

      <footer className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-caption text-muted-foreground">
        <span>
          Consome <Milhas valor={caminho.milhasConsumidas} className="text-foreground" /> de{" "}
          <Milhas valor={caminho.saldoOrigem} /> disponíveis
        </span>
        <span>
          Entrega <Milhas valor={caminho.milhasEntregues} className="text-foreground" /> para um alvo
          de <Milhas valor={alvo} />
        </span>
        {caminho.sobra > 0 && (
          <span>
            Sobra <Milhas valor={caminho.sobra} /> no destino
          </span>
        )}
      </footer>

      {caminho.avisos.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-lg bg-secondary/60 p-3">
          {caminho.avisos.map((a, i) => (
            <AvisoLinha key={`${a.tipo}-${i}`} aviso={a} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function ViagensSimulador({ programas }: Props) {
  const ativos = useMemo(() => programas.filter((p) => p.ativo), [programas]);
  const [alvoId, setAlvoId] = useState(
    () => ativos.find((p) => p.slug === "avios-british")?.id ?? ativos[0]?.id ?? "",
  );
  const [milhas, setMilhas] = useState("62000");
  const [saldos, setSaldos] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoCaminhos | null>(null);
  const [pendente, iniciar] = useTransition();

  const totalOrigens = Object.values(saldos).filter((v) => Number(v) > 0).length;

  function rodar() {
    iniciar(async () => {
      const r = await simularCaminho({
        alvoProgramaId: alvoId,
        milhas,
        saldos: Object.entries(saldos)
          .map(([programaId, saldo]) => ({ programaId, saldo: Number(saldo) || 0 }))
          .filter((s) => s.saldo > 0),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setResultado(r.resultado ?? null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ---- Entrada ---- */}
        <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="space-y-1">
            <h3 className="text-body font-semibold">A emissão</h3>
            <p className="text-caption text-muted-foreground">
              Quanto o bilhete custa, e em qual programa.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alvo">Programa da emissão</Label>
            <select
              id="alvo"
              value={alvoId}
              onChange={(e) => setAlvoId(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-body-sm focus-visible:outline-none focus-visible:shadow-focus"
            >
              {ativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="milhas">Custo em milhas</Label>
            <Input
              id="milhas"
              inputMode="numeric"
              value={milhas}
              onChange={(e) => setMilhas(e.target.value.replace(/\D/g, ""))}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-body font-semibold">Saldos da família</h3>
              <span className="font-mono text-caption text-muted-foreground">
                {totalOrigens} origem{totalOrigens === 1 ? "" : "ns"}
              </span>
            </div>
            <p className="text-caption text-muted-foreground">
              Deixe em branco o que não tem. Na Fase 1 isto vem da carteira.
            </p>
          </div>

          <div className="-mr-2 max-h-[320px] space-y-1 overflow-y-auto pr-2">
            {ativos.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <label
                  htmlFor={`saldo-${p.id}`}
                  className="flex-1 truncate text-caption text-muted-foreground"
                >
                  {p.nome}
                </label>
                <Input
                  id={`saldo-${p.id}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={saldos[p.id] ?? ""}
                  onChange={(e) =>
                    setSaldos((s) => ({ ...s, [p.id]: e.target.value.replace(/\D/g, "") }))
                  }
                  className="h-9 w-[112px] font-mono tabular-nums text-right text-body-sm"
                />
              </div>
            ))}
          </div>

          <Button onClick={rodar} disabled={pendente || !alvoId} className="w-full">
            <Route className="size-4" />
            {pendente ? "Calculando…" : "Calcular caminhos"}
          </Button>
        </div>

        {/* ---- Resultado ---- */}
        <div className="space-y-4">
          {!resultado && (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background-warm/60 p-8 text-center">
              <Route className="size-6 text-muted-foreground" />
              <p className="max-w-sm text-body-sm text-muted-foreground">
                Preencha os saldos e o custo da emissão para ver como as milhas chegam lá — e o que
                cada caminho custa de verdade.
              </p>
            </div>
          )}

          {resultado && (
            <>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4",
                  resultado.viavel
                    ? "border-success/40 bg-success/10"
                    : "border-destructive/40 bg-destructive/10",
                )}
              >
                {resultado.viavel ? (
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div className="space-y-0.5">
                  <p className="text-body-sm font-semibold">
                    {resultado.viavel
                      ? `Dá para emitir ${formatNumber(resultado.alvo.milhas)} milhas em ${resultado.alvoNome}.`
                      : "Não dá para emitir com esses saldos."}
                  </p>
                  {resultado.motivo && (
                    <p className="text-caption text-muted-foreground">{resultado.motivo}</p>
                  )}
                  {resultado.combinacao?.cobreAlvo && (
                    <p className="text-caption text-muted-foreground">
                      Nenhuma origem cobre sozinha — precisa juntar{" "}
                      {resultado.combinacao.parcelas.length} programas.
                    </p>
                  )}
                </div>
              </div>

              {resultado.combinacao?.cobreAlvo && (
                <div className="rounded-xl border border-tech/40 bg-tech/5 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-body-sm font-semibold">
                    <Layers className="size-4 text-tech" />
                    Combinação sugerida
                  </h4>
                  <ul className="space-y-1.5">
                    {resultado.combinacao.parcelas.map((p) => (
                      <li
                        key={p.caminho.origemId}
                        className="flex items-center justify-between gap-3 text-body-sm"
                      >
                        <span className="truncate">{p.caminho.origemNome}</span>
                        <span className="text-muted-foreground">
                          entrega <Milhas valor={p.contribuicao} className="text-foreground" />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {resultado.combinacao.custoEstimadoCents != null && (
                    <p className="mt-3 border-t border-tech/20 pt-2 text-caption text-muted-foreground">
                      Custo somado ≈{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {formatBRL(resultado.combinacao.custoEstimadoCents / 100)}
                      </span>{" "}
                      · até {resultado.combinacao.prazoDiasMax}d
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {resultado.caminhos.map((c, i) => (
                  <CartaoCaminho
                    key={`${c.origemId}-${i}`}
                    caminho={c}
                    posicao={i}
                    alvo={resultado.alvo.milhas}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
