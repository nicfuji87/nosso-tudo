"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  Pencil,
  Plus,
  ShieldAlert,
  TimerReset,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber, hojeISO } from "@/lib/format";
import {
  ALIANCAS,
  LABEL_ALIANCA,
  LABEL_TIPO_PROGRAMA,
  TIPOS_PROGRAMA,
  type ProgramaViagem,
  type TransferenciaViagem,
} from "@/lib/viagens/tipos";
import {
  confirmarVerificacao,
  excluirTransferencia,
  salvarPrograma,
  salvarTransferencia,
} from "@/app/app/admin/viagens/actions";

/**
 * Curadoria do grafo de milhas.
 *
 * O eixo visual desta tela é a CONFIANÇA no dado, não a estética: cada aresta
 * carrega um trilho colorido à esquerda que diz, de relance, se aquele ratio
 * pode ser usado para mover pontos de forma irreversível. A fila de trabalho
 * do admin é "zerar os trilhos vermelhos", e a tela foi desenhada para isso.
 */

const DIAS_ATE_VELHO = 90;

type Confianca = "verificada" | "velha" | "nunca";

function confiancaDe(t: TransferenciaViagem, hoje: string): Confianca {
  if (!t.verificadoEm) return "nunca";
  const dias = Math.round(
    (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${t.verificadoEm}T00:00:00Z`)) / 86_400_000,
  );
  return dias > DIAS_ATE_VELHO ? "velha" : "verificada";
}

const ESTILO_CONFIANCA: Record<
  Confianca,
  { trilho: string; icone: typeof BadgeCheck; cor: string; rotulo: string }
> = {
  verificada: {
    trilho: "bg-success",
    icone: BadgeCheck,
    cor: "text-success",
    rotulo: "verificada",
  },
  velha: { trilho: "bg-warning", icone: TimerReset, cor: "text-warning", rotulo: "desatualizada" },
  nunca: { trilho: "bg-destructive", icone: ShieldAlert, cor: "text-destructive", rotulo: "nunca verificada" },
};

// ---------------------------------------------------------------------------

interface Props {
  programas: ProgramaViagem[];
  transferencias: TransferenciaViagem[];
}

export function ViagensGrafo({ programas, transferencias }: Props) {
  const hoje = hojeISO();
  const [editandoPrograma, setEditandoPrograma] = useState<ProgramaViagem | "novo" | null>(null);
  const [editandoTransf, setEditandoTransf] = useState<TransferenciaViagem | "nova" | null>(null);
  const [pendente, iniciar] = useTransition();

  const nomes = useMemo(() => new Map(programas.map((p) => [p.id, p.nome])), [programas]);

  const ordenadas = useMemo(() => {
    // Fila de curadoria: o que não dá para confiar aparece primeiro.
    const peso: Record<Confianca, number> = { nunca: 0, velha: 1, verificada: 2 };
    return [...transferencias].sort((a, b) => {
      const d = peso[confiancaDe(a, hoje)] - peso[confiancaDe(b, hoje)];
      if (d !== 0) return d;
      return (nomes.get(a.origemId) ?? "").localeCompare(nomes.get(b.origemId) ?? "");
    });
  }, [transferencias, hoje, nomes]);

  const pendentes = ordenadas.filter((t) => confiancaDe(t, hoje) !== "verificada").length;

  function verificar(id: string) {
    iniciar(async () => {
      const r = await confirmarVerificacao(id);
      if (r.error) toast.error(r.error);
      else toast.success("Marcada como verificada hoje.");
    });
  }

  function excluir(id: string) {
    iniciar(async () => {
      const r = await excluirTransferencia(id);
      if (r.error) toast.error(r.error);
      else toast.success("Transferência removida.");
    });
  }

  return (
    <div className="space-y-8">
      {/* ---- Transferências ---- */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-h4 font-semibold">Transferências</h3>
            <p className="text-body-sm text-muted-foreground">
              As arestas do grafo. Cada uma vira uma conta que move pontos sem volta — por isso
              nenhuma vale nada até ser conferida na fonte.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditandoTransf("nova")}>
            <Plus className="size-4" />
            Nova transferência
          </Button>
        </header>

        {pendentes > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-body-sm">
            <ShieldAlert className="size-4 shrink-0 text-destructive" />
            <span>
              <span className="font-semibold">{pendentes}</span> de {ordenadas.length}{" "}
              {pendentes === 1 ? "transferência precisa" : "transferências precisam"} de conferência.
              O motor sinaliza todo caminho que passa por elas.
            </span>
          </div>
        )}

        <ul className="space-y-2">
          {ordenadas.map((t) => {
            const conf = confiancaDe(t, hoje);
            const estilo = ESTILO_CONFIANCA[conf];
            const Icone = estilo.icone;
            const bonusVivo = t.bonusPercent > 0 && (!t.bonusValidoAte || t.bonusValidoAte >= hoje);

            return (
              <li
                key={t.id}
                className={cn(
                  "relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden rounded-xl border border-border bg-card py-3 pl-5 pr-4 shadow-card",
                  !t.ativa && "opacity-55",
                )}
              >
                {/* Trilho de confiança */}
                <span className={cn("absolute inset-y-0 left-0 w-1.5", estilo.trilho)} />

                <div className="flex min-w-[240px] flex-1 items-center gap-2">
                  <span className="truncate text-body-sm font-medium">
                    {nomes.get(t.origemId) ?? "?"}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-body-sm font-medium">
                    {nomes.get(t.destinoId) ?? "?"}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono text-caption tabular-nums text-muted-foreground">
                  <span className="text-foreground">
                    {t.ratioOrigem}:{t.ratioDestino}
                  </span>
                  {t.bonusPercent > 0 && (
                    <Badge variant={bonusVivo ? "accent" : "outline"} size="sm">
                      +{formatNumber(t.bonusPercent)}%
                      {t.bonusValidoAte && ` até ${formatDate(t.bonusValidoAte, "dd/MM")}`}
                    </Badge>
                  )}
                  {t.multiplo > 1 && <span>múlt. {formatNumber(t.multiplo)}</span>}
                  {t.minimoTransferencia > 0 && (
                    <span>mín. {formatNumber(t.minimoTransferencia)}</span>
                  )}
                  <span>{t.prazoDiasMax === 0 ? "na hora" : `${t.prazoDiasMax}d`}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={cn("flex items-center gap-1 text-caption", estilo.cor)}>
                    <Icone className="size-3.5" />
                    {conf === "verificada" && t.verificadoEm
                      ? formatDate(t.verificadoEm, "dd/MM/yy")
                      : estilo.rotulo}
                  </span>
                  {t.fonteUrl && (
                    <a
                      href={t.fonteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      title="Abrir fonte"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {conf !== "verificada" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendente}
                      onClick={() => verificar(t.id)}
                    >
                      <BadgeCheck className="size-3.5" />
                      Conferi
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditandoTransf(t)}
                    title="Editar"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={pendente}
                    onClick={() => excluir(t.id)}
                    title="Excluir"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- Programas ---- */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-h4 font-semibold">Programas</h3>
            <p className="text-body-sm text-muted-foreground">
              Os nós. <span className="font-medium">Valor por mil</span> é o que torna comparável
              gastar Livelo ou Smiles — sem ele, o motor não ranqueia por custo em reais.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditandoPrograma("novo")}>
            <Plus className="size-4" />
            Novo programa
          </Button>
        </header>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[720px] text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Programa</th>
                <th className="px-4 py-2.5 font-medium">Tipo</th>
                <th className="px-4 py-2.5 font-medium">Aliança</th>
                <th className="px-4 py-2.5 font-medium">seats.aero</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor / mil</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {programas.map((p) => (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/40",
                    !p.ativo && "opacity-55",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.nome}</span>
                      {!p.ativo && (
                        <Badge variant="outline" size="sm">
                          inativo
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-caption text-muted-foreground">{p.slug}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {LABEL_TIPO_PROGRAMA[p.tipo]}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.alianca ? LABEL_ALIANCA[p.alianca] : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.fonteSeatsAero ? (
                      <span className="font-mono text-caption">{p.fonteSeatsAero}</span>
                    ) : (
                      <span className="text-caption text-muted-foreground">não buscável</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {p.valorPorMilCents != null ? (
                      `R$ ${(p.valorPorMilCents / 100).toFixed(2).replace(".", ",")}`
                    ) : (
                      <span className="text-caption text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditandoPrograma(p)}
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ProgramaDialog
        aberto={editandoPrograma !== null}
        programa={editandoPrograma === "novo" ? null : editandoPrograma}
        onFechar={() => setEditandoPrograma(null)}
      />
      <TransferenciaDialog
        aberto={editandoTransf !== null}
        transferencia={editandoTransf === "nova" ? null : editandoTransf}
        programas={programas}
        onFechar={() => setEditandoTransf(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-body-sm focus-visible:outline-none focus-visible:shadow-focus";

function ProgramaDialog({
  aberto,
  programa,
  onFechar,
}: {
  aberto: boolean;
  programa: ProgramaViagem | null;
  onFechar: () => void;
}) {
  const [pendente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await salvarPrograma({
        id: programa?.id,
        slug: fd.get("slug"),
        nome: fd.get("nome"),
        tipo: fd.get("tipo"),
        pais: fd.get("pais"),
        alianca: fd.get("alianca"),
        fonteSeatsAero: fd.get("fonteSeatsAero"),
        valorPorMilCents: fd.get("valorPorMilCents"),
        observacoes: fd.get("observacoes"),
        ativo: fd.get("ativo") === "on",
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(programa ? "Programa atualizado." : "Programa criado.");
        onFechar();
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{programa ? "Editar programa" : "Novo programa"}</DialogTitle>
          <DialogDescription>Um nó do grafo de milhas.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" key={programa?.id ?? "novo"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome">
              <Input name="nome" defaultValue={programa?.nome ?? ""} required />
            </Campo>
            <Campo label="Slug" hint="minúsculas, sem espaço">
              <Input
                name="slug"
                defaultValue={programa?.slug ?? ""}
                required
                className="font-mono"
              />
            </Campo>
            <Campo label="Tipo">
              <select name="tipo" defaultValue={programa?.tipo ?? "aereo"} className={CLASSE_SELECT}>
                {TIPOS_PROGRAMA.map((t) => (
                  <option key={t} value={t}>
                    {LABEL_TIPO_PROGRAMA[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Aliança">
              <select name="alianca" defaultValue={programa?.alianca ?? ""} className={CLASSE_SELECT}>
                <option value="">Nenhuma</option>
                {ALIANCAS.map((a) => (
                  <option key={a} value={a}>
                    {LABEL_ALIANCA[a]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="País" hint="sigla de 2 letras">
              <Input name="pais" maxLength={2} defaultValue={programa?.pais ?? ""} />
            </Campo>
            <Campo label="Fonte no seats.aero" hint="vazio = não buscável lá">
              <Input
                name="fonteSeatsAero"
                defaultValue={programa?.fonteSeatsAero ?? ""}
                className="font-mono"
              />
            </Campo>
          </div>

          <Campo
            label="Valor por mil milhas (centavos)"
            hint="Ex.: 2200 = R$ 22,00 por 1.000. É o que permite comparar caminhos de origens diferentes."
          >
            <Input
              name="valorPorMilCents"
              inputMode="numeric"
              defaultValue={programa?.valorPorMilCents ?? ""}
              className="font-mono tabular-nums"
            />
          </Campo>

          <Campo label="Observações">
            <Input name="observacoes" defaultValue={programa?.observacoes ?? ""} />
          </Campo>

          <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
            <Label htmlFor="ativo-prog">Ativo no grafo</Label>
            <Switch id="ativo-prog" name="ativo" defaultChecked={programa?.ativo ?? true} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferenciaDialog({
  aberto,
  transferencia,
  programas,
  onFechar,
}: {
  aberto: boolean;
  transferencia: TransferenciaViagem | null;
  programas: ProgramaViagem[];
  onFechar: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const t = transferencia;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await salvarTransferencia({
        id: t?.id,
        origemId: fd.get("origemId"),
        destinoId: fd.get("destinoId"),
        ratioOrigem: fd.get("ratioOrigem"),
        ratioDestino: fd.get("ratioDestino"),
        bonusPercent: fd.get("bonusPercent"),
        bonusValidoAte: fd.get("bonusValidoAte"),
        minimoTransferencia: fd.get("minimoTransferencia"),
        multiplo: fd.get("multiplo"),
        prazoDiasMin: fd.get("prazoDiasMin"),
        prazoDiasMax: fd.get("prazoDiasMax"),
        ativa: fd.get("ativa") === "on",
        fonteUrl: fd.get("fonteUrl"),
        verificadoEm: fd.get("verificadoEm"),
        observacoes: fd.get("observacoes"),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(t ? "Transferência atualizada." : "Transferência criada.");
        onFechar();
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t ? "Editar transferência" : "Nova transferência"}</DialogTitle>
          <DialogDescription>
            Uma aresta do grafo. Confira na fonte antes de marcar como verificada — este número
            move pontos sem volta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" key={t?.id ?? "nova"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Origem">
              <select
                name="origemId"
                defaultValue={t?.origemId ?? ""}
                required
                className={CLASSE_SELECT}
              >
                <option value="">Escolha…</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Destino">
              <select
                name="destinoId"
                defaultValue={t?.destinoId ?? ""}
                required
                className={CLASSE_SELECT}
              >
                <option value="">Escolha…</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Ratio da origem" hint="1000:800 → aqui vai 1000">
              <Input
                name="ratioOrigem"
                inputMode="numeric"
                defaultValue={t?.ratioOrigem ?? 1}
                className="font-mono tabular-nums"
              />
            </Campo>
            <Campo label="Ratio do destino" hint="1000:800 → aqui vai 800">
              <Input
                name="ratioDestino"
                inputMode="numeric"
                defaultValue={t?.ratioDestino ?? 1}
                className="font-mono tabular-nums"
              />
            </Campo>
          </div>

          <div className="grid gap-4 rounded-lg bg-accent/10 p-4 sm:grid-cols-2">
            <Campo label="Bônus (%)">
              <Input
                name="bonusPercent"
                inputMode="decimal"
                defaultValue={t?.bonusPercent ?? 0}
                className="font-mono tabular-nums"
              />
            </Campo>
            <Campo label="Bônus válido até" hint="obrigatório se houver bônus">
              <Input type="date" name="bonusValidoAte" defaultValue={t?.bonusValidoAte ?? ""} />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Campo label="Mínimo">
              <Input
                name="minimoTransferencia"
                inputMode="numeric"
                defaultValue={t?.minimoTransferencia ?? 0}
                className="font-mono tabular-nums"
              />
            </Campo>
            <Campo label="Múltiplo">
              <Input
                name="multiplo"
                inputMode="numeric"
                defaultValue={t?.multiplo ?? 1}
                className="font-mono tabular-nums"
              />
            </Campo>
            <Campo label="Prazo mín. (d)">
              <Input
                name="prazoDiasMin"
                inputMode="numeric"
                defaultValue={t?.prazoDiasMin ?? 0}
                className="font-mono tabular-nums"
              />
            </Campo>
            <Campo label="Prazo máx. (d)">
              <Input
                name="prazoDiasMax"
                inputMode="numeric"
                defaultValue={t?.prazoDiasMax ?? 0}
                className="font-mono tabular-nums"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Fonte (URL)" hint="de onde veio o ratio">
              <Input name="fonteUrl" type="url" defaultValue={t?.fonteUrl ?? ""} />
            </Campo>
            <Campo label="Verificado em">
              <Input type="date" name="verificadoEm" defaultValue={t?.verificadoEm ?? ""} />
            </Campo>
          </div>

          <Campo label="Observações">
            <Input name="observacoes" defaultValue={t?.observacoes ?? ""} />
          </Campo>

          <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
            <Label htmlFor="ativa-transf">Ativa no grafo</Label>
            <Switch id="ativa-transf" name="ativa" defaultChecked={t?.ativa ?? true} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
