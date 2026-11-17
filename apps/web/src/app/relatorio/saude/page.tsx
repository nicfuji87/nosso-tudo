import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth";
import { getRelatorioSaude } from "@/lib/saude/relatorio";
import { MiniBpm } from "@/components/saude/graficos-saude";
import { EcgTracado } from "@/components/saude/ecg-tracado";
import { BotaoImprimir } from "@/components/saude/botao-imprimir";

export const metadata: Metadata = { title: "Relatório de saúde · Nosso Tudo" };
export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const diaNoite = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const duracao = (a: string, b: string) => { const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
const SITUACAO: Record<string, string> = { deitado: "deitado", levantando: "levantando", parado: "parado", esforco: "no esforço", outro: "outra" };

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page space-y-2 border-t border-border/70 pt-5">
      <h2 className="text-h4 font-semibold tracking-tight">{titulo}</h2>
      {nota && <p className="text-caption text-muted-foreground">{nota}</p>}
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-body-sm text-muted-foreground">{children}</p>;
}

export default async function RelatorioSaudePage({ searchParams }: { searchParams: { dias?: string } }) {
  const { workspace, profile } = await getWorkspaceContext();
  const dias = [7, 14, 30, 60, 90].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 30;
  const r = await getRelatorioSaude(workspace.id, dias, TZ);

  const repousos = r.noites.map((n) => n.fcRepouso).filter((v): v is number => v != null);
  const vfcs = r.noites.map((n) => n.vfc).filter((v): v is number => v != null);
  const porModalidade = new Map<string, { n: number; min: number }>();
  for (const t of r.treinos) {
    const m = porModalidade.get(t.modalidade) ?? { n: 0, min: 0 };
    porModalidade.set(t.modalidade, { n: m.n + 1, min: m.min + Math.round((new Date(t.fim).getTime() - new Date(t.inicio).getTime()) / 60_000) });
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 bg-background px-4 py-8 text-foreground print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/saude" className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar ao painel
        </Link>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/relatorio/saude?dias=${d}`}
              className={`rounded-full border px-3 py-1 text-caption ${d === dias ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}>
              {d} dias
            </Link>
          ))}
          <BotaoImprimir />
        </div>
      </div>

      <header className="space-y-1">
        <div className="mb-3 flex items-center gap-2.5">
          <Image src="/assets/logo/icone_nt.png" alt="Nosso Tudo" width={36} height={36} priority />
          <span className="text-body font-semibold tracking-tight">Nosso Tudo · Saúde</span>
        </div>
        <p className="text-overline uppercase text-muted-foreground">Relatório de saúde · últimos {dias} dias</p>
        <h1 className="text-h2 font-semibold tracking-tight">{profile.nome}</h1>
        <p className="text-body-sm text-muted-foreground">
          Gerado em {dataHora(r.geradoEm)} · medições contínuas de pulso pelo Galaxy Watch 6{r.relogio?.versao ? ` (app Saúde NT ${r.relogio.versao})` : ""}.
        </p>
        <p className="rounded-lg bg-secondary/70 p-3 text-caption text-muted-foreground">
          Dados de bem-estar coletados por relógio de pulso (PPG). Servem para mostrar padrões e contexto; não são exames e não substituem avaliação médica.
          Frequência cardíaca em musculação, lutas e natação tem baixa confiança no pulso.
        </p>
      </header>

      <Secao titulo="Resumo" nota="Valores do período, a partir do que o relógio mediu.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { r: "Noites medidas", v: String(r.noites.length) },
            { r: "FC de repouso (mediana)", v: mediana(repousos) != null ? `${mediana(repousos)} bpm` : "—" },
            { r: "VFC noturna (mediana)", v: mediana(vfcs) != null ? `${mediana(vfcs)} ms` : "—" },
            { r: "Mal-estares registrados", v: String(r.malEstares.length) },
          ].map((k) => (
            <div key={k.r} className="rounded-xl border border-border/70 p-3">
              <p className="text-caption text-muted-foreground">{k.r}</p>
              <p className="tabular text-h4 font-semibold">{k.v}</p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Mal-estares" nota="Registrados no relógio (1 toque) ou no site. Batimento médio por minuto de 10 min antes a 10 min depois.">
        {r.malEstares.length === 0 ? <Vazio>Nenhum mal-estar registrado no período.</Vazio> : (
          <ul className="space-y-4">
            {r.malEstares.map((m) => {
              const vals = m.serie.map((p) => p.bpm);
              return (
                <li key={m.id} className="break-inside-avoid rounded-xl border border-border/70 p-3">
                  <p className="text-body-sm font-semibold">
                    {dataHora(m.ts)} · {m.situacao ? SITUACAO[m.situacao] ?? m.situacao : "situação não informada"}
                    <span className="font-normal text-muted-foreground"> · registrado no {m.fonte}</span>
                  </p>
                  {(m.sintomas.length > 0 || m.nota) && (
                    <p className="text-body-sm text-muted-foreground">{[m.sintomas.join(", "), m.nota].filter(Boolean).join(" · ")}</p>
                  )}
                  {vals.length > 0 && (
                    <p className="tabular text-caption text-muted-foreground">FC no período: mín {Math.min(...vals)} · máx {Math.max(...vals)} bpm</p>
                  )}
                  <MiniBpm pontos={m.serie} momento={m.ts} />
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <Secao titulo="Testes ortostáticos (deitado → em pé)" nota="2 min deitado e parado, depois 3 min em pé parado. Δ = FC aos 3 min em pé − FC deitado.">
        {r.ortostaticos.length === 0 ? <Vazio>Nenhum teste no período. No relógio: Laboratório › Teste em pé, ou pelo atalho do mostrador.</Vazio> : (
          <table className="tabular w-full text-body-sm">
            <thead className="text-left text-caption text-muted-foreground">
              <tr><th className="py-1">Data</th><th>Deitado</th><th>Pico em pé</th><th>1 min</th><th>3 min</th><th>Δ 3 min</th><th>Sintomas</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {r.ortostaticos.map((o) => (
                <tr key={o.ts}>
                  <td className="py-1.5">{dataHora(o.ts)}</td>
                  <td>{o.deitado ?? "—"}</td><td>{o.pico ?? "—"}</td><td>{o.m1 ?? "—"}</td><td>{o.m3 ?? "—"}</td>
                  <td className="font-semibold">{o.deitado != null && o.m3 != null ? `${o.m3 - o.deitado >= 0 ? "+" : ""}${o.m3 - o.deitado}` : "—"}</td>
                  <td>{o.sintomas ? "sim" : "não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="ECG do relógio" nota="Traçado de 30 s do app Saúde NT (sinal de estudo, não é o app de ECG certificado). Para fins clínicos, use o ECG do Samsung Health Monitor.">
        {r.ecgs.length === 0 ? <Vazio>Nenhum ECG no período.</Vazio> : r.ecgs.map((e) => (
          <div key={e.id} className="break-inside-avoid space-y-1.5">
            <p className="tabular text-body-sm font-medium">{dataHora(e.ts)} · {Math.round(e.duracaoS)} s · {Math.round(e.hz)} Hz</p>
            <EcgTracado amostras={e.amostras} hz={e.hz} duracaoS={e.duracaoS} />
          </div>
        ))}
      </Secao>

      <Secao titulo="Noites" nota="Sono estimado pelo batimento (não há sensor de sono). Repouso = menor média de 30 min; VFC (RMSSD) e pele = mediana dentro do sono.">
        {r.noites.length === 0 ? <Vazio>Nenhuma noite medida no período.</Vazio> : (
          <table className="tabular w-full text-body-sm">
            <thead className="text-left text-caption text-muted-foreground">
              <tr><th className="py-1">Noite</th><th>Sono estimado</th><th>Repouso</th><th>VFC</th><th>Pele</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {r.noites.map((n) => (
                <tr key={n.noite}>
                  <td className="py-1.5">{diaNoite(n.noite)}</td>
                  <td>{n.sonoInicio && n.sonoFim ? `${hora(n.sonoInicio)}–${hora(n.sonoFim)} (${duracao(n.sonoInicio, n.sonoFim)})` : "—"}</td>
                  <td>{n.fcRepouso != null ? `${n.fcRepouso} bpm` : "—"}</td>
                  <td>{n.vfc != null ? `${n.vfc} ms` : "—"}</td>
                  <td>{n.temp != null ? `${String(n.temp).replace(".", ",")} °C` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Atividade física" nota="Treinos detectados pelo batimento e confirmados, ou lançados à mão.">
        {r.treinos.length === 0 ? <Vazio>Nenhum treino registrado no período.</Vazio> : (
          <>
            <p className="text-body-sm">
              {[...porModalidade.entries()].map(([m, v]) => `${m}: ${v.n}× (${Math.round(v.min / 60 * 10) / 10} h)`).join(" · ")}
            </p>
            <table className="tabular w-full text-body-sm">
              <thead className="text-left text-caption text-muted-foreground">
                <tr><th className="py-1">Quando</th><th>Modalidade</th><th>Duração</th><th>FC média / pico</th><th>Esforço (0–10)</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {r.treinos.map((t) => (
                  <tr key={t.inicio}>
                    <td className="py-1.5">{data(t.inicio)} {hora(t.inicio)}</td>
                    <td>{t.modalidade}</td>
                    <td>{duracao(t.inicio, t.fim)}</td>
                    <td>{t.fcMedia != null ? `${t.fcMedia} / ${t.fcMax}` : "—"}</td>
                    <td>{t.esforco ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Secao>

      <Secao titulo="Diário" nota="Sintomas, medicamentos, doença, álcool e outras anotações.">
        {r.diario.length === 0 ? <Vazio>Nada anotado no período.</Vazio> : (
          <ul className="divide-y divide-border/60 text-body-sm">
            {r.diario.map((d, i) => (
              <li key={`${d.ts}-${i}`} className="tabular flex gap-3 py-1.5">
                <span className="w-28 shrink-0 text-muted-foreground">{dataHora(d.ts)}</span>
                <span className="font-medium">{d.tipo}</span>
                <span className="text-muted-foreground">{d.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <footer className="border-t border-border/70 pt-4 text-caption text-muted-foreground">
        Nosso Tudo · módulo Saúde · algoritmos: noites-v4, treino-v1, radar-v1. Em dor no peito, desmaio ou falta de ar, procure atendimento.
      </footer>
    </main>
  );
}
