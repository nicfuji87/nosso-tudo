import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileWarning,
  HardDrive,
  ImageIcon,
  Images,
  Link2Off,
  PackageCheck,
  PackageX,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FIDELIDADE_STATUS_LABEL, PAPEL_MIDIA_LABEL } from "@/components/ml/familias/rotulos";
import { StatusBadge } from "@/components/ml/status";
import { labelJob } from "@/lib/ml/jobs/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { ATOR_LABEL, idCurto, linkEntidade, rotuloAcao, rotuloEntidade, truncarTexto } from "./formatos";
import { JsonBloco } from "./json-bloco";

/**
 * Eventos operacionais da V2 (spec V2 §11.13): importação de mídia, prompts,
 * imagens, fidelidade, pacote Pinterest, redirect de links e bloqueios
 * anti-repetição. Fonte: `ml_audit_log` (decisões) e `ml_job_logs.data.evento`
 * (passos dentro dos jobs). Puro/servidor — sem estado no client.
 */

type Tom = "info" | "ok" | "aviso" | "erro";

const TOM_BADGE: Record<Tom, "tech" | "success" | "warning" | "destructive"> = {
  info: "tech",
  ok: "success",
  aviso: "warning",
  erro: "destructive",
};

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** Categorias da aba Eventos (`?categoria=`). `imagem` vem dos logs de job. */
export const CATEGORIAS_EVENTO = [
  { valor: "midia", rotulo: "Importação de mídia" },
  { valor: "prompt", rotulo: "Prompt gerado" },
  { valor: "imagem", rotulo: "Imagem gerada" },
  { valor: "fidelidade", rotulo: "Alerta de fidelidade" },
  { valor: "pacote", rotulo: "Pacote Pinterest inválido" },
  { valor: "link", rotulo: "Link com redirect inconsistente" },
  { valor: "cooldown", rotulo: "Variante bloqueada por cooldown" },
  { valor: "repeticao", rotulo: "Variante bloqueada por repetição" },
] as const;
export type CategoriaEvento = (typeof CATEGORIAS_EVENTO)[number]["valor"];

export function ehCategoriaEvento(v: string | undefined): v is CategoriaEvento {
  return CATEGORIAS_EVENTO.some((c) => c.valor === v);
}

/** Ações de auditoria de cada categoria (a categoria `imagem` usa os logs de job). */
export const ACOES_POR_CATEGORIA: Record<Exclude<CategoriaEvento, "imagem">, string[]> = {
  midia: ["midia.importar", "midia.adicionar", "midia.papel"],
  prompt: ["prompt.gerado"],
  fidelidade: ["fidelidade.alerta", "fidelidade.problema"],
  pacote: ["pacote.invalido"],
  link: ["link.redirect_inconsistente"],
  cooldown: ["variante.bloqueada"],
  repeticao: ["variante.bloqueada", "publicacao.anti_flood"],
};

/** Todas as ações exibidas em "Todos os eventos". */
export const ACOES_EVENTOS_V2 = Array.from(new Set([...Object.values(ACOES_POR_CATEGORIA).flat(), "criativo.imagem_manual"]));

/** Valores de `ml_job_logs.data->>evento` filtráveis na aba Jobs (`?evento=`). */
export const EVENTOS_JOB: Record<string, { rotulo: string; tom: Tom; icone: LucideIcon }> = {
  "midia.falha_download": { rotulo: "Falha de download", tom: "erro", icone: Download },
  "midia.falha_storage": { rotulo: "Falha de Storage", tom: "erro", icone: HardDrive },
  imagem_gerada: { rotulo: "Imagem gerada", tom: "ok", icone: ImageIcon },
  fidelity_warning: { rotulo: "Alerta de fidelidade", tom: "aviso", icone: ShieldAlert },
  pacote_invalido: { rotulo: "Pacote Pinterest inválido", tom: "aviso", icone: PackageX },
  pacote_pronto: { rotulo: "Pacote Pinterest pronto", tom: "ok", icone: PackageCheck },
};

export function ehEventoJob(v: string | undefined): v is string {
  return v != null && v in EVENTOS_JOB;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const FMT_HORA: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const temConteudo = (v: unknown) => v != null && !(typeof v === "object" && Object.keys(v as object).length === 0);

function EntidadeLink({ tipo, id }: { tipo: string | null; id: string | null }) {
  if (!tipo || !id) return null;
  const href = linkEntidade(tipo, id);
  const conteudo = (
    <>
      {rotuloEntidade(tipo)} <span className="font-mono">{idCurto(id)}</span>
    </>
  );
  return href ? (
    <Link href={href} className="whitespace-nowrap text-tech hover:underline">
      {conteudo}
    </Link>
  ) : (
    <span className="whitespace-nowrap">{conteudo}</span>
  );
}

// ---------------------------------------------------------------------------
// Eventos de auditoria
// ---------------------------------------------------------------------------

export interface LinhaEvento {
  id: number;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  created_at: string;
}

interface Apresentacao {
  icone: LucideIcon;
  tom: Tom;
  rotulo: string;
  resumo: string | null;
  detalhe?: string | null;
}

function apresentar(e: LinhaEvento): Apresentacao {
  const m = obj(e.metadata);
  const antes = obj(e.before);
  const depois = obj(e.after);
  switch (e.action) {
    case "midia.importar": {
      const novas = num(m.novas) ?? 0;
      const falhas = num(m.falhas) ?? 0;
      const total = num(m.total);
      const partes = [`${novas} nova${novas === 1 ? "" : "s"}`, `${falhas} falha${falhas === 1 ? "" : "s"}`];
      if (total != null) partes.push(`${total} no total`);
      const sel = str(m.selecao);
      return {
        icone: Images,
        tom: falhas > 0 ? "aviso" : "info",
        rotulo: m.refresh ? "Imagens do anúncio atualizadas" : rotuloAcao(e.action),
        resumo: partes.join(" · "),
        detalhe: sel ? `Seleção automática de referências: ${sel}` : null,
      };
    }
    case "midia.adicionar":
      return { icone: Images, tom: "info", rotulo: rotuloAcao(e.action), resumo: str(m.tipo) ? `Origem: ${m.tipo === "upload" ? "upload" : "URL manual"}` : null };
    case "midia.papel": {
      const de = str(antes.papel);
      const para = str(depois.papel);
      return {
        icone: Images,
        tom: "info",
        rotulo: rotuloAcao(e.action),
        resumo: `${de ? PAPEL_MIDIA_LABEL[de] ?? de : "—"} → ${para ? PAPEL_MIDIA_LABEL[para] ?? para : "—"}`,
      };
    }
    case "prompt.gerado": {
      const faltando = lista(m.faltando).filter((x): x is string => typeof x === "string");
      return {
        icone: Sparkles,
        tom: faltando.length ? "aviso" : "info",
        rotulo: rotuloAcao(e.action),
        resumo: str(m.versao) ? `Template ${m.versao}` : null,
        detalhe: faltando.length ? `Variáveis vazias: ${faltando.map((f) => `{${f}}`).join(", ")}` : null,
      };
    }
    case "fidelidade.alerta": {
      const status = str(m.status);
      const score = num(m.score);
      return {
        icone: ShieldAlert,
        tom: status === "failed" ? "erro" : "aviso",
        rotulo: rotuloAcao(e.action),
        resumo: [status ? FIDELIDADE_STATUS_LABEL[status] ?? status : null, score != null ? `score ${score}` : null].filter(Boolean).join(" · ") || null,
      };
    }
    case "fidelidade.problema":
      return { icone: ScanSearch, tom: "erro", rotulo: rotuloAcao(e.action), resumo: "Marcado na revisão humana do checklist", detalhe: str(m.nota) };
    case "pacote.invalido": {
      const erros = lista(m.erros).map((x) => (typeof x === "string" ? x : str(obj(x).mensagem) ?? JSON.stringify(x)));
      return { icone: FileWarning, tom: "aviso", rotulo: rotuloAcao(e.action), resumo: erros.length ? truncarTexto(erros.join("; "), 200) : null };
    }
    case "link.redirect_inconsistente":
      return {
        icone: Link2Off,
        tom: "erro",
        rotulo: rotuloAcao(e.action),
        resumo: str(m.destino) ? `Destino: ${truncarTexto(String(m.destino), 120)}` : null,
        detalhe: str(m.detalhe),
      };
    case "variante.bloqueada": {
      const cooldown = m.evento === "bloqueada_cooldown";
      const msgs = lista(m.conflitos)
        .map((c) => str(obj(c).mensagem))
        .filter((x): x is string => Boolean(x));
      return {
        icone: cooldown ? Timer : Ban,
        tom: "aviso",
        rotulo: cooldown ? "Variante bloqueada por cooldown" : "Variante bloqueada por repetição",
        resumo: msgs.length ? truncarTexto(msgs.join(" "), 220) : null,
      };
    }
    case "publicacao.anti_flood": {
      const n = num(m.reagendados) ?? 0;
      return { icone: Timer, tom: "aviso", rotulo: rotuloAcao(e.action), resumo: `${n} Pin${n === 1 ? "" : "s"} atrasado${n === 1 ? "" : "s"} reagendado${n === 1 ? "" : "s"} para não publicar em rajada` };
    }
    case "criativo.imagem_manual":
      return { icone: ImageIcon, tom: "ok", rotulo: "Imagem enviada manualmente", resumo: m.ai_modified ? "Marcada como gerada/modificada por IA" : null };
    default:
      return { icone: AlertTriangle, tom: "info", rotulo: rotuloAcao(e.action), resumo: null };
  }
}

export function ListaEventos({ linhas, tz, hrefJob }: { linhas: LinhaEvento[]; tz: string; hrefJob: (id: string) => string }) {
  return (
    <ol className="divide-y divide-border/50 rounded-xl border border-border/70 bg-card shadow-card">
      {linhas.map((e) => {
        const a = apresentar(e);
        const Icone = a.icone;
        const jobId = str(obj(e.metadata).job_id);
        const temDados = temConteudo(e.metadata) || temConteudo(e.before) || temConteudo(e.after);
        return (
          <li key={e.id} className="flex gap-3 px-4 py-3">
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                a.tom === "erro" ? "bg-destructive/10 text-destructive" : a.tom === "aviso" ? "bg-warning/15 text-warning" : a.tom === "ok" ? "bg-success/10 text-success" : "bg-tech/10 text-tech"
              }`}
              aria-hidden
            >
              <Icone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium">
                    {a.rotulo}
                    <Badge variant={TOM_BADGE[a.tom]} size="sm">
                      {a.tom === "erro" ? "Erro" : a.tom === "aviso" ? "Atenção" : a.tom === "ok" ? "OK" : "Info"}
                    </Badge>
                  </p>
                  {a.resumo && <p className="text-caption text-muted-foreground">{a.resumo}</p>}
                  {a.detalhe && <p className="text-caption text-warning">{a.detalhe}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                    <code className="font-mono">{e.action}</code>
                    {e.entity_type && e.entity_id && (
                      <>
                        <span aria-hidden>·</span>
                        <EntidadeLink tipo={e.entity_type} id={e.entity_id} />
                      </>
                    )}
                    {jobId && (
                      <>
                        <span aria-hidden>·</span>
                        <Link href={hrefJob(jobId)} scroll={false} className="whitespace-nowrap text-tech hover:underline">
                          Job <span className="font-mono">{idCurto(jobId)}</span>
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-caption">
                  <Badge variant={e.actor_type === "user" ? "default" : "tech"} size="sm">
                    {ATOR_LABEL[e.actor_type] ?? e.actor_type}
                  </Badge>
                  <time className="tabular text-muted-foreground" dateTime={e.created_at}>
                    {formatarNoFuso(e.created_at, tz, FMT_HORA)}
                  </time>
                </div>
              </div>
              {temDados && (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {temConteudo(e.before) && <JsonBloco titulo="Antes" valor={e.before} />}
                  {temConteudo(e.after) && <JsonBloco titulo="Depois" valor={e.after} />}
                  {temConteudo(e.metadata) && <JsonBloco titulo="Detalhes" valor={e.metadata} />}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Eventos de logs de job
// ---------------------------------------------------------------------------

export interface LinhaEventoJob {
  id: number;
  job_id: string;
  level: string;
  message: string;
  data: unknown;
  created_at: string;
  job: { type: string; status: string; entity_type: string | null; entity_id: string | null } | null;
}

export function TabelaEventosJob({ linhas, tz, hrefJob, jobAtivo }: { linhas: LinhaEventoJob[]; tz: string; hrefJob: (id: string) => string; jobAtivo: string | null }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-card">
      <table className="w-full min-w-[900px] text-left text-body-sm">
        <thead className="border-b border-border/70 bg-secondary/40 text-overline uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Quando</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Evento</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Mensagem</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Job</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium">Entidade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {linhas.map((l) => {
            const d = obj(l.data);
            const ev = str(d.evento) ?? "";
            const def = EVENTOS_JOB[ev];
            const Icone = def?.icone ?? (l.level === "error" ? AlertTriangle : CheckCircle2);
            const tom: Tom = def?.tom ?? (l.level === "error" ? "erro" : l.level === "warn" ? "aviso" : "info");
            const nErros = lista(d.erros).length;
            const extra = [
              str(d.tipo) && `tipo: ${d.tipo}`,
              str(d.versao) && `template: ${d.versao}`,
              nErros > 0 && `${nErros} problema${nErros === 1 ? "" : "s"}`,
              str(d.url) && truncarTexto(String(d.url), 80),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <tr key={l.id} className={`align-top ${l.job_id === jobAtivo ? "bg-tech/5" : ""}`}>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-caption">{formatarNoFuso(l.created_at, tz, FMT_HORA)}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={TOM_BADGE[tom]} size="sm" className="whitespace-nowrap">
                    <Icone className="size-3" aria-hidden /> {def?.rotulo ?? (ev || l.level)}
                  </Badge>
                </td>
                <td className="max-w-[360px] px-3 py-2.5 text-caption" title={l.message}>
                  {truncarTexto(l.message, 160)}
                  {extra && <span className="mt-0.5 block text-muted-foreground">{extra}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={hrefJob(l.job_id)} scroll={false} className="block whitespace-nowrap text-tech hover:underline">
                    {l.job ? labelJob(l.job.type) : "Job"} <span className="font-mono text-caption">{idCurto(l.job_id)}</span>
                  </Link>
                  {l.job && (
                    <span className="mt-1 inline-block">
                      <StatusBadge tipo="job" status={l.job.status} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-caption">
                  {l.job?.entity_type && l.job.entity_id ? <EntidadeLink tipo={l.job.entity_type} id={l.job.entity_id} /> : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
