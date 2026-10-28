"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, KeyRound, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { dataCurta, milhasCurto, reais } from "@/lib/viagens/formato";
import { FONTES_SEATS, nomeFonte } from "@/lib/viagens/milheiro";
import { CABINES, LABEL_CABINE, type Cabine } from "@/lib/viagens/radar-calc";
import type { ConfigRadar, PromocaoTela, UsoApis } from "@/lib/viagens/radar-dados";
import { atualizarAgora, salvarChaveSerpApi, salvarConfigPromo } from "@/app/app/viagens/radar-actions";

/**
 * Promoções do dia saindo das origens fixas. "Promoção" = menor preço de hoje
 * bem abaixo do preço normal daquela rota (histórico próprio ou, enquanto ele
 * é curto, os outros meses da mesma rota).
 */

const PROGRAMAS_TELA = ["smiles", "azul", "qatar", "flyingblue", "turkish", "american", "united", "aeroplan", "connectmiles"];

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-caption transition-colors",
        ativo ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function PromocoesPainel({
  config,
  programasPadrao,
  dataRef,
  promocoes,
  uso,
  chaveSerpApiFinal,
}: {
  config: ConfigRadar;
  programasPadrao: string[];
  dataRef: string | null;
  promocoes: PromocaoTela[];
  uso: UsoApis;
  chaveSerpApiFinal: string | null;
}) {
  const [rodando, iniciar] = useTransition();
  const [configAberta, setConfigAberta] = useState(!config.salvo || config.origensPromo.length === 0);
  const [origem, setOrigem] = useState<string | "todas">("todas");

  const origens = useMemo(() => [...new Set(promocoes.map((p) => p.origem))].sort(), [promocoes]);
  const filtradas = promocoes.filter((p) => origem === "todas" || p.origem === origem);
  const milhas = filtradas.filter((p) => p.tipo === "milhas");
  const dinheiro = filtradas.filter((p) => p.tipo === "dinheiro");

  function rodarAgora() {
    iniciar(async () => {
      const r = await atualizarAgora();
      if (r.error) toast.error(r.error);
      else if (r.resumo?.erros.length) toast.warning(`Atualizado com avisos: ${r.resumo.erros[0]}`);
      else
        toast.success(
          `Pronto: ${r.resumo?.promocoes?.milhas ?? 0} em milhas e ${r.resumo?.promocoes?.dinheiro ?? 0} em dinheiro.`,
        );
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-body-sm text-muted-foreground">
          Todo dia de manhã a rotina varre os voos saindo de{" "}
          <b className="text-foreground">{config.origensPromo.length ? config.origensPromo.join(", ") : "—"}</b> e marca
          como promoção o que está pelo menos {config.descontoMinimoPct}% abaixo do preço normal da rota.
          {config.avisoWhatsapp && " As melhores chegam no seu WhatsApp."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfigAberta((a) => !a)}>
            <Settings2 /> Configurar
          </Button>
          <Button size="sm" onClick={rodarAgora} disabled={rodando || config.origensPromo.length === 0}>
            <RefreshCw className={cn(rodando && "animate-spin")} />
            {rodando ? "Buscando…" : "Atualizar agora"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground">
        <span>
          seats.aero hoje: <b className="text-foreground">{uso.seatsHoje}</b>
          {uso.seatsRestante != null && ` · restam ${uso.seatsRestante} de 1.000`}
        </span>
        <span>
          SerpApi no mês: <b className="text-foreground">{uso.serpapiMes}</b> de {config.serpapiMensalMax}
        </span>
        {dataRef && <span>Varredura de {dataCurta(dataRef)}</span>}
      </div>

      {configAberta && <ConfigForm config={config} programasPadrao={programasPadrao} onSalvo={() => setConfigAberta(false)} />}
      <ChaveSerpApi final={chaveSerpApiFinal} />

      {origens.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip ativo={origem === "todas"} onClick={() => setOrigem("todas")}>
            Todas as origens
          </Chip>
          {origens.map((o) => (
            <Chip key={o} ativo={origem === o} onClick={() => setOrigem(o)}>
              {o}
            </Chip>
          ))}
        </div>
      )}

      {!dataRef ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-body-sm text-muted-foreground">
          Nenhuma varredura ainda. Defina as origens em Configurar e clique em Atualizar agora — ou espere a rotina da manhã.
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-h4">Em milhas</h2>
            {milhas.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Nada abaixo de {config.descontoMinimoPct}% do normal hoje.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
                <table className="w-full min-w-[720px] text-body-sm">
                  <thead>
                    <tr className="text-left text-caption text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Rota</th>
                      <th className="px-3 py-2 font-medium">Programa</th>
                      <th className="px-3 py-2 font-medium">Voo</th>
                      <th className="px-3 py-2 text-right font-medium">Milhas</th>
                      <th className="px-3 py-2 text-right font-medium">Normal</th>
                      <th className="px-3 py-2 text-right font-medium">Desconto</th>
                      <th className="px-3 py-2 text-right font-medium">≈ R$/pessoa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milhas.map((p) => (
                      <tr key={p.id} className="border-t border-border/50">
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {p.origem} → {p.destinoNome ?? p.destino}
                          </span>
                          <span className="block text-caption text-muted-foreground">
                            {p.regiao ?? ""} {p.direto ? "· direto" : "· com conexão"}
                            {p.assentos != null && ` · ${p.assentos} lugares`}
                            {p.cabine !== "economy" && ` · ${LABEL_CABINE[p.cabine as Cabine] ?? p.cabine}`}
                          </span>
                        </td>
                        <td className="px-3 py-2">{nomeFonte(p.programa)}</td>
                        <td className="px-3 py-2 tabular-nums">{dataCurta(p.dataVoo)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{milhasCurto(p.milhas)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {milhasCurto(p.referenciaCents)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="success" size="sm">
                            −{Math.round(p.descontoPct ?? 0)}%
                          </Badge>
                          {p.referenciaFonte === "mercado_hoje" && (
                            <span className="block text-caption text-muted-foreground" title="Comparado com os outros meses da mesma rota hoje, enquanto o histórico diário ainda é curto.">
                              vs. outros meses
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {reais(p.custoCents)}
                          {!p.taxasCents && (
                            <span className="block text-caption text-muted-foreground">+ taxas não informadas</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-h4">Em dinheiro</h2>
            {!chaveSerpApiFinal ? (
              <p className="text-body-sm text-muted-foreground">Cadastre a chave do SerpApi acima para ver preços em dinheiro.</p>
            ) : dinheiro.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Nenhum destino em dinheiro nesta varredura.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
                <table className="w-full min-w-[620px] text-body-sm">
                  <thead>
                    <tr className="text-left text-caption text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Rota</th>
                      <th className="px-3 py-2 font-medium">Datas</th>
                      <th className="px-3 py-2 text-right font-medium">Ida e volta/pessoa</th>
                      <th className="px-3 py-2 text-right font-medium">Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dinheiro.map((p) => (
                      <tr key={p.id} className="border-t border-border/50">
                        <td className="px-3 py-2">
                          <span className="font-medium">
                            {p.origem} → {p.destinoNome ?? p.destino}
                          </span>
                          <span className="block text-caption text-muted-foreground">
                            {p.companhias ?? ""} {p.direto ? "· direto" : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {dataCurta(p.dataVoo)}
                          {typeof p.payload.dataVolta === "string" && ` → ${dataCurta(p.payload.dataVolta)}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{reais(p.precoCents)}</td>
                        <td className="px-3 py-2 text-right">
                          {p.descontoPct != null ? (
                            <Badge variant="success" size="sm">
                              −{Math.round(p.descontoPct)}%
                            </Badge>
                          ) : (
                            <span className="text-caption text-muted-foreground">sem histórico ainda</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-caption text-muted-foreground">
            Milhas: cache do seats.aero. Dinheiro: Google Flights via SerpApi. R$ por pessoa usa o custo do milheiro da
            carteira e o dólar do dia para as taxas. Confira no site do programa antes de transferir pontos.
          </p>
        </>
      )}
    </div>
  );
}

function ConfigForm({
  config,
  programasPadrao,
  onSalvo,
}: {
  config: ConfigRadar;
  programasPadrao: string[];
  onSalvo: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [cabines, setCabines] = useState<Cabine[]>(config.cabinesPromo);
  const [programas, setProgramas] = useState<string[]>(config.programas);
  const [aviso, setAviso] = useState(config.avisoWhatsapp);
  const [dinheiro, setDinheiro] = useState(config.dinheiroPromo);

  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await salvarConfigPromo({
        origens: fd.get("origens"),
        cabines,
        programas,
        pessoas: fd.get("pessoas"),
        descontoMinimoPct: fd.get("descontoMinimoPct"),
        avisoWhatsapp: aviso,
        dinheiroPromo: dinheiro,
        serpapiMensalMax: fd.get("serpapiMensalMax"),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Configuração salva. Vale a partir da próxima varredura.");
        onSalvo();
      }
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Origens fixas</Label>
          <Input name="origens" defaultValue={config.origensPromo.join(", ")} placeholder="BSB, GRU, GIG" />
          <p className="text-caption text-muted-foreground">Até 8. Cada origem entra na varredura diária.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Pessoas</Label>
          <Input type="number" name="pessoas" min={1} max={9} defaultValue={config.pessoasPromo} />
          <p className="text-caption text-muted-foreground">Prioriza voo que cabe todo mundo.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Cabines</Label>
        <div className="flex flex-wrap gap-1.5">
          {CABINES.map((c) => (
            <Chip key={c} ativo={cabines.includes(c)} onClick={() => setCabines((l) => alternar(l, c))}>
              {LABEL_CABINE[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Programas</Label>
        <p className="text-caption text-muted-foreground">
          Nenhum marcado = os que vocês alcançam ({programasPadrao.map(nomeFonte).join(", ")}).
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PROGRAMAS_TELA.filter((p) => p in FONTES_SEATS).map((p) => (
            <Chip key={p} ativo={programas.includes(p)} onClick={() => setProgramas((l) => alternar(l, p))}>
              {nomeFonte(p)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Desconto mínimo para ser promoção (%)</Label>
          <Input type="number" name="descontoMinimoPct" min={0} max={90} defaultValue={config.descontoMinimoPct} />
        </div>
        <div className="space-y-1.5">
          <Label>Teto de buscas SerpApi por mês</Label>
          <Input type="number" name="serpapiMensalMax" min={0} defaultValue={config.serpapiMensalMax} />
          <p className="text-caption text-muted-foreground">O plano grátis tem 250.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-body-sm">
          Avisar no WhatsApp (1 resumo por dia)
          <Switch checked={aviso} onCheckedChange={setAviso} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-body-sm">
          Incluir promoções em dinheiro
          <Switch checked={dinheiro} onCheckedChange={setDinheiro} />
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </form>
  );
}

function ChaveSerpApi({ final }: { final: string | null }) {
  const [aberto, setAberto] = useState(!final);
  const [pendente, iniciar] = useTransition();
  const [valor, setValor] = useState("");

  function salvar() {
    iniciar(async () => {
      const r = await salvarChaveSerpApi(valor);
      if (r.error) toast.error(r.error);
      else {
        toast.success(valor ? "Chave guardada no cofre do Supabase." : "Chave removida.");
        setValor("");
        setAberto(false);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <button onClick={() => setAberto((a) => !a)} className="flex w-full items-center gap-2 text-left text-body-sm">
        <KeyRound className="size-4 text-muted-foreground" />
        <span className="font-medium">Preços em dinheiro (SerpApi)</span>
        <span className="text-muted-foreground">{final ? `· chave ${final}` : "· sem chave"}</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="mt-3 space-y-2">
          <p className="text-caption text-muted-foreground">
            Crie uma conta grátis em serpapi.com (250 buscas/mês), copie a “Private API Key” do painel e cole aqui. Ela fica
            cifrada no Vault do Supabase e nunca volta para o navegador.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={final ? "Nova chave (vazio = remover)" : "Cole a chave aqui"}
            />
            <Button size="sm" onClick={salvar} disabled={pendente || (!valor && !final)}>
              {valor || !final ? "Salvar" : "Remover"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
