"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Users,
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
import { GRUPOS_DESTINO } from "@/lib/viagens/aeroportos";
import { aeroporto, dataComDia, dataCurta, milhasCurto, reais, SEM_TAXAS } from "@/lib/viagens/formato";
import { FONTES_SEATS, nomeFonte } from "@/lib/viagens/milheiro";
import { CABINES, LABEL_CABINE, type Cabine, type PrecoMilheiro } from "@/lib/viagens/radar-calc";
import type { RotaRadar, SnapshotRadar, UsoApis } from "@/lib/viagens/radar-dados";
import { alternarRota, atualizarAgora, excluirRota, salvarRota } from "@/app/app/viagens/radar-actions";
import { GraficoRota, type PontoRota } from "./grafico-rota";

/**
 * Radar de rotas: cada rota é uma pergunta fixa ("BSB → EUA, 6 a 8 dias, 3
 * pessoas") que a rotina responde toda manhã com o melhor achado do dia.
 */

interface Perna {
  origem: string;
  destino: string;
  data: string;
  programa: string;
  milhas: number;
  taxasBrlCents: number;
  custoCents: number;
  fonteCusto: string;
  assentos: number | null;
  direto: boolean;
  companhias: string;
}
interface MelhorMilhas {
  ida: Perna;
  volta: Perna | null;
  dias: number | null;
  milhasPp: number;
  taxasPpCents: number;
  custoPpCents: number;
  programas: string[];
  assentos: "sim" | "desconhecido";
  mesmoAeroporto: boolean;
  cambio?: number;
}
interface MelhorDinheiro {
  precoCents: number;
  companhias: string;
  paradas: number;
  origem: string;
  destino: string;
  dataIda: string;
  dataVolta: string | null;
  nivelPreco: string | null;
}

const PROGRAMAS_TELA = ["smiles", "azul", "qatar", "flyingblue", "turkish", "american", "united", "aeroplan", "connectmiles"];
const CLASSE_SELECT =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-body-sm focus-visible:outline-none focus-visible:shadow-focus";

export function RadarPainel({
  rotas,
  snapshots,
  precos,
  programasPadrao,
  uso,
  temChaveSerpApi,
}: {
  rotas: RotaRadar[];
  snapshots: SnapshotRadar[];
  precos: PrecoMilheiro;
  programasPadrao: string[];
  uso: UsoApis;
  temChaveSerpApi: boolean;
}) {
  const [editando, setEditando] = useState<RotaRadar | "nova" | null>(null);
  const [rodando, iniciar] = useTransition();

  const porRota = useMemo(() => {
    const m = new Map<string, SnapshotRadar[]>();
    for (const s of snapshots) m.set(s.rotaId, [...(m.get(s.rotaId) ?? []), s]);
    return m;
  }, [snapshots]);

  function rodarAgora() {
    iniciar(async () => {
      const r = await atualizarAgora();
      if (r.error) toast.error(r.error);
      else if (r.resumo) {
        const s = r.resumo;
        if (s.erros.length) toast.warning(`Atualizado com avisos: ${s.erros[0]}`);
        else toast.success(`Pronto: ${s.rotas.ok} rota(s) atualizada(s).`);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-body-sm text-muted-foreground">
          Rotas que você acompanha. Toda manhã a rotina busca o melhor preço em milhas (seats.aero) e
          em dinheiro (Google Flights), monta a ida e a volta e grava o histórico. O custo em R$ usa o
          custo do milheiro da sua carteira.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={rodarAgora} disabled={rodando}>
            <RefreshCw className={cn(rodando && "animate-spin")} />
            {rodando ? "Buscando…" : "Atualizar agora"}
          </Button>
          <Button size="sm" onClick={() => setEditando("nova")}>
            <Plus /> Nova rota
          </Button>
        </div>
      </div>

      <UsoCota uso={uso} />

      {!temChaveSerpApi && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-caption text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Preços em dinheiro desligados: falta a chave do SerpApi (gratuita). Cadastre na aba Promoções.
        </p>
      )}

      {rotas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-body-sm text-muted-foreground">
          Nenhuma rota ainda. Crie uma — por exemplo, “Brasília → EUA, 6 a 8 dias, 3 pessoas”.
        </div>
      ) : (
        <div className="space-y-4">
          {rotas.map((r) => (
            <CartaoRota
              key={r.id}
              rota={r}
              snapshots={porRota.get(r.id) ?? []}
              programasPadrao={programasPadrao}
              precos={precos}
              onEditar={() => setEditando(r)}
            />
          ))}
        </div>
      )}

      <RotaDialog
        rota={editando === "nova" ? null : editando}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        programasPadrao={programasPadrao}
      />
    </div>
  );
}

function UsoCota({ uso }: { uso: UsoApis }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground">
      <span>
        seats.aero hoje: <b className="text-foreground">{uso.seatsHoje}</b> consultas
        {uso.seatsRestante != null && ` · restam ${uso.seatsRestante} de 1.000`}
      </span>
      <span>
        SerpApi no mês: <b className="text-foreground">{uso.serpapiMes}</b>
      </span>
      {uso.ultimaExecucao && (
        <span>
          Última rotina: {new Date(uso.ultimaExecucao.iniciadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          {uso.ultimaExecucao.status !== "ok" && ` (${uso.ultimaExecucao.status})`}
        </span>
      )}
    </div>
  );
}

function descricaoLocais(iatas: string[]): string {
  const grupo = GRUPOS_DESTINO.find(
    (g) => g.aeroportos.length === iatas.length && g.aeroportos.every((a) => iatas.includes(a)),
  );
  if (grupo) return grupo.nome;
  return iatas.length > 4 ? `${iatas.slice(0, 4).join(", ")} +${iatas.length - 4}` : iatas.join(", ");
}

function CartaoRota({
  rota,
  snapshots,
  programasPadrao,
  precos,
  onEditar,
}: {
  rota: RotaRadar;
  snapshots: SnapshotRadar[];
  programasPadrao: string[];
  precos: PrecoMilheiro;
  onEditar: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);

  const milhas = snapshots.filter((s) => s.tipo === "milhas");
  const dinheiro = snapshots.filter((s) => s.tipo === "dinheiro");
  const ultimoM = milhas[milhas.length - 1];
  const ultimoD = dinheiro[dinheiro.length - 1];
  const melhor = ultimoM?.melhor as unknown as MelhorMilhas | undefined;
  const cash = ultimoD?.melhor as unknown as MelhorDinheiro | undefined;
  const alternativas = (ultimoM?.alternativas ?? []) as unknown as MelhorMilhas[];

  const pontos: PontoRota[] = useMemo(() => {
    const datas = [...new Set(snapshots.map((s) => s.dataRef))].sort();
    return datas.map((d) => ({
      data: d,
      milhas: milhas.find((s) => s.dataRef === d)?.custoPpCents ?? null,
      dinheiro: dinheiro.find((s) => s.dataRef === d)?.custoPpCents ?? null,
    }));
  }, [snapshots, milhas, dinheiro]);

  const programas = rota.programas.length ? rota.programas : programasPadrao;
  // Taxa zero quase sempre é "o programa não informou", não "não tem taxa".
  const semTaxas =
    melhor &&
    (melhor.programas.some((p) => SEM_TAXAS.has(p)) ||
      melhor.ida.taxasBrlCents === 0 ||
      (melhor.volta != null && melhor.volta.taxasBrlCents === 0));
  const economia = melhor && cash ? cash.precoCents - melhor.custoPpCents : null;

  function alternar() {
    iniciar(async () => {
      const r = await alternarRota(rota.id, !rota.ativo);
      if (r.error) toast.error(r.error);
    });
  }
  function excluir() {
    if (!confirm(`Excluir a rota “${rota.nome}” e o histórico dela?`)) return;
    iniciar(async () => {
      const r = await excluirRota(rota.id);
      if (r.error) toast.error(r.error);
      else toast.success("Rota excluída.");
    });
  }

  return (
    <article className={cn("rounded-xl border border-border bg-card shadow-card", !rota.ativo && "opacity-70")}>
      <header className="flex flex-wrap items-start gap-3 border-b border-border/60 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold">{rota.nome}</h3>
            {!rota.ativo && <Badge variant="outline" size="sm">pausada</Badge>}
          </div>
          <p className="text-caption text-muted-foreground">
            {descricaoLocais(rota.origens)} <ArrowRight className="inline size-3" /> {descricaoLocais(rota.destinos)} ·{" "}
            {dataCurta(rota.dataInicio)} a {dataCurta(rota.dataFim)}
            {rota.duracaoMin != null &&
              ` · ${rota.duracaoMin === rota.duracaoMax ? rota.duracaoMin : `${rota.duracaoMin} a ${rota.duracaoMax}`} dias`}{" "}
            · <Users className="inline size-3" /> {rota.pessoas} · {LABEL_CABINE[rota.cabine]} ·{" "}
            {programas.map(nomeFonte).join(", ")}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={onEditar} title="Editar" disabled={pendente}>
            <Pencil className="size-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={alternar} title={rota.ativo ? "Pausar" : "Retomar"} disabled={pendente}>
            {rota.ativo ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={excluir}
            title="Excluir"
            disabled={pendente}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {melhor ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-mono text-h3 font-semibold tabular-nums">{milhasCurto(melhor.milhasPp)}</p>
                <p className="text-body-sm text-muted-foreground">
                  milhas/pessoa · ≈ <b className="text-foreground">{reais(melhor.custoPpCents)}</b>/pessoa ·{" "}
                  {reais(melhor.custoPpCents * rota.pessoas)} para {rota.pessoas}
                </p>
              </div>
              <div className="space-y-1.5 text-body-sm">
                <LinhaPerna rotulo="Ida" p={melhor.ida} />
                {melhor.volta && <LinhaPerna rotulo="Volta" p={melhor.volta} />}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {melhor.dias != null && <Badge size="sm">{melhor.dias} dias</Badge>}
                {melhor.assentos === "sim" ? (
                  <Badge variant="success" size="sm">cabem {rota.pessoas}</Badge>
                ) : (
                  <Badge variant="warning" size="sm">assentos não informados</Badge>
                )}
                {!melhor.mesmoAeroporto && <Badge variant="warning" size="sm">volta por outro aeroporto</Badge>}
                {semTaxas && <Badge variant="warning" size="sm">taxas não informadas</Badge>}
                {melhor.programas.some((p) => (precos.porPrograma[p]?.fonte ?? "estimado") === "estimado") && (
                  <Badge variant="outline" size="sm">custo do milheiro estimado</Badge>
                )}
              </div>
            </>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {rota.ultimoErro ?? (rota.ultimaExecucao ? "Sem resultado ainda." : "Ainda não buscada — roda na próxima manhã ou em “Atualizar agora”.")}
            </p>
          )}

          {cash && (
            <p className="text-body-sm">
              <span className="text-muted-foreground">Em dinheiro (Google Flights, {dataCurta(ultimoD?.dataRef)}):</span>{" "}
              <b>{reais(cash.precoCents)}</b>/pessoa {cash.dataVolta ? "ida e volta" : "só ida"} · {cash.companhias || "—"} ·{" "}
              {cash.paradas === 0 ? "direto" : `${cash.paradas} parada(s)`}
              {cash.nivelPreco && <span className="text-muted-foreground"> · preço {cash.nivelPreco === "low" ? "baixo" : cash.nivelPreco === "high" ? "alto" : "normal"} para a rota</span>}
              {economia != null && (
                <span className={cn("ml-1 font-medium", economia > 0 ? "text-success" : "text-warning")}>
                  {economia > 0 ? `· milhas economizam ${reais(economia)}/pessoa` : "· dinheiro sai mais barato"}
                </span>
              )}
            </p>
          )}

          {alternativas.length > 0 && (
            <div>
              <button
                onClick={() => setAberto((a) => !a)}
                className="flex items-center gap-1 text-caption font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} />
                {alternativas.length} outras datas
              </button>
              {aberto && (
                <ul className="mt-2 space-y-1 text-caption">
                  {alternativas.map((a, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2 text-muted-foreground">
                      <span className="text-foreground">
                        {dataComDia(a.ida.data)}
                        {a.volta && ` → ${dataComDia(a.volta.data)}`}
                      </span>
                      <span>
                        {milhasCurto(a.milhasPp)} ({a.programas.map(nomeFonte).join(" + ")}) · ≈ {reais(a.custoPpCents)}/pessoa
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          {pontos.length >= 2 ? (
            <GraficoRota pontos={pontos} />
          ) : (
            <p className="text-caption text-muted-foreground">O gráfico aparece a partir do 2º dia de histórico.</p>
          )}
          <p className="text-caption text-muted-foreground">
            {rota.ultimaExecucao
              ? `Atualizada em ${new Date(rota.ultimaExecucao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. `
              : ""}
            Dado em cache: confira no site antes de transferir pontos.
          </p>
        </div>
      </div>
    </article>
  );
}

function LinhaPerna({ rotulo, p }: { rotulo: string; p: Perna }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="w-11 text-caption font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <span className="font-medium">{dataComDia(p.data)}</span>
      <span>
        {aeroporto(p.origem)} → {aeroporto(p.destino)}
      </span>
      <span className="text-muted-foreground">
        · {nomeFonte(p.programa)} {milhasCurto(p.milhas)}
        {p.taxasBrlCents > 0 && ` + ${reais(p.taxasBrlCents)}`} · {p.direto ? "direto" : "com conexão"}
        {p.companhias && ` · ${p.companhias}`}
        {p.assentos != null && ` · ${p.assentos} lugares`}
      </span>
    </div>
  );
}

function RotaDialog({
  rota,
  aberto,
  onFechar,
  programasPadrao,
}: {
  rota: RotaRadar | null;
  aberto: boolean;
  onFechar: () => void;
  programasPadrao: string[];
}) {
  const [pendente, iniciar] = useTransition();
  const [programas, setProgramas] = useState<string[]>(rota?.programas ?? []);
  const [direto, setDireto] = useState(rota?.apenasDireto ?? false);
  const [dinheiro, setDinheiro] = useState(rota?.incluirDinheiro ?? true);
  const [chave, setChave] = useState(0);

  // Reabre limpo/preenchido a cada abertura.
  const [ultimo, setUltimo] = useState<string | null>(null);
  const id = aberto ? (rota?.id ?? "nova") : null;
  if (id !== ultimo) {
    setUltimo(id);
    setProgramas(rota?.programas ?? []);
    setDireto(rota?.apenasDireto ?? false);
    setDinheiro(rota?.incluirDinheiro ?? true);
    setChave((k) => k + 1);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await salvarRota({
        id: rota?.id,
        nome: fd.get("nome"),
        origens: fd.get("origens"),
        destinos: fd.get("destinos"),
        dataInicio: fd.get("dataInicio"),
        dataFim: fd.get("dataFim"),
        duracaoMin: fd.get("duracaoMin"),
        duracaoMax: fd.get("duracaoMax"),
        pessoas: fd.get("pessoas"),
        cabine: fd.get("cabine"),
        programas,
        apenasDireto: direto,
        incluirDinheiro: dinheiro,
        alertaMilhasPp: fd.get("alertaMilhasPp"),
        alertaReaisPp: fd.get("alertaReaisPp"),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(rota ? "Rota atualizada." : "Rota criada. Ela entra na busca da próxima manhã (ou clique em Atualizar agora).");
        onFechar();
      }
    });
  }

  const alternarPrograma = (p: string) =>
    setProgramas((atual) => (atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p]));

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rota ? "Editar rota" : "Nova rota"}</DialogTitle>
          <DialogDescription>
            Origens e destinos aceitam códigos (GRU, MIA) ou grupos:{" "}
            {GRUPOS_DESTINO.slice(0, 8)
              .map((g) => g.nome)
              .join(", ")}
            … Trechos com conexão em outro programa (ex.: Qatar via Doha) entram como rotas separadas por trecho.
          </DialogDescription>
        </DialogHeader>

        <form key={chave} onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input name="nome" required maxLength={80} defaultValue={rota?.nome} placeholder="EUA nas férias, 6 a 8 dias" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Saindo de</Label>
              <Input name="origens" required defaultValue={rota?.origens.join(", ")} placeholder="BSB, GRU, GIG" />
            </div>
            <div className="space-y-1.5">
              <Label>Indo para</Label>
              <Input name="destinos" required defaultValue={rota?.destinos.join(", ")} placeholder="EUA  ou  NRT, HND" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Janela da viagem: de</Label>
              <Input type="date" name="dataInicio" required defaultValue={rota?.dataInicio} />
            </div>
            <div className="space-y-1.5">
              <Label>até</Label>
              <Input type="date" name="dataFim" required defaultValue={rota?.dataFim} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Dias (mín.)</Label>
              <Input type="number" name="duracaoMin" min={1} max={90} defaultValue={rota?.duracaoMin ?? ""} placeholder="só ida" />
            </div>
            <div className="space-y-1.5">
              <Label>Dias (máx.)</Label>
              <Input type="number" name="duracaoMax" min={1} max={90} defaultValue={rota?.duracaoMax ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Pessoas</Label>
              <Input type="number" name="pessoas" min={1} max={9} required defaultValue={rota?.pessoas ?? 3} />
            </div>
            <div className="space-y-1.5">
              <Label>Cabine</Label>
              <select name="cabine" className={CLASSE_SELECT} defaultValue={rota?.cabine ?? "economy"}>
                {CABINES.map((c: Cabine) => (
                  <option key={c} value={c}>
                    {LABEL_CABINE[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Programas</Label>
            <p className="text-caption text-muted-foreground">
              Nenhum marcado = os que vocês alcançam ({programasPadrao.map(nomeFonte).join(", ")}). LATAM Pass não é coberta pelo seats.aero.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROGRAMAS_TELA.filter((p) => p in FONTES_SEATS).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => alternarPrograma(p)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-caption transition-colors",
                    programas.includes(p) ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary",
                  )}
                >
                  {nomeFonte(p)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-body-sm">
              Só voos diretos
              <Switch checked={direto} onCheckedChange={setDireto} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-body-sm">
              Comparar com dinheiro
              <Switch checked={dinheiro} onCheckedChange={setDinheiro} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Avisar no WhatsApp se ≤ milhas/pessoa</Label>
              <Input type="number" name="alertaMilhasPp" min={1} defaultValue={rota?.alertaMilhasPp ?? ""} placeholder="ex.: 130000" />
            </div>
            <div className="space-y-1.5">
              <Label>…ou se ≤ R$/pessoa</Label>
              <Input
                type="number"
                name="alertaReaisPp"
                min={1}
                defaultValue={rota?.alertaReaisPpCents != null ? Math.round(rota.alertaReaisPpCents / 100) : ""}
                placeholder="ex.: 3000"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar rota"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
