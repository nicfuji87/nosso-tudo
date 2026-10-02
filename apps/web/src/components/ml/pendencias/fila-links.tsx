"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Tag,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { proximoSemLink, salvarEProximo, validarRedirectAgora } from "@/app/ml/(painel)/pendencias/actions";
import { validarLinkAfiliado } from "@/app/ml/(painel)/produtos/actions";
import { ScoreBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REDIRECT_STATUS } from "@/components/ml/publicacoes/tipos";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";

export interface ProdutoLink {
  id: string;
  title: string;
  permalink: string | null;
  imagem: string | null;
  preco: number | null;
  precoOriginal: number | null;
  desconto: number | null;
  score: number | null;
  confianca: number | null;
  aguardandoLink: boolean;
  codigo: string;
}

/** Link de afiliado ativo do produto (V2 §10: etiqueta + validação do redirect). */
export interface LinkAtivo {
  id: string;
  affiliate_url: string;
  label: string | null;
  redirect_status: string;
  final_url: string | null;
  final_host: string | null;
  last_checked_at: string | null;
  validated_at: string | null;
  created_at: string;
}

const ICONE_TOM: Record<string, { icon: LucideIcon; cls: string }> = {
  success: { icon: CheckCircle2, cls: "bg-success/10 text-success" },
  warning: { icon: AlertTriangle, cls: "bg-warning/15 text-warning" },
  destructive: { icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  muted: { icon: CircleDashed, cls: "bg-secondary text-muted-foreground" },
};

function encurtar(url: string, max = 72) {
  const sem = url.replace(/^https?:\/\/(www\.)?/, "");
  return sem.length > max ? `${sem.slice(0, max - 1)}…` : sem;
}

/** Status do redirect com texto + ícone. */
function StatusRedirect({ status }: { status: string }) {
  const s = REDIRECT_STATUS[status] ?? REDIRECT_STATUS.unchecked!;
  const t = ICONE_TOM[s.tom] ?? ICONE_TOM.muted!;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium", t.cls)} title={s.dica}>
      <t.icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAINEL_AFILIADOS = "https://www.mercadolivre.com.br/afiliados";

type Validacao = { valido: boolean; erros: string[]; avisos: string[]; url?: string | null };

function hrefFila(id: string | null, pular: string[]) {
  const p = new URLSearchParams();
  if (id) p.set("id", id);
  if (pular.length) p.set("pular", pular.join(","));
  const s = p.toString();
  return `/ml/pendencias/links${s ? `?${s}` : ""}`;
}

/** Fila rápida de links de afiliado (spec §9): um produto por vez, "Salvar e próximo". */
export function FilaLinks({
  produto,
  restantes,
  pular,
  podeOperar,
  linkAtivo = null,
  tz = "America/Sao_Paulo",
}: {
  produto: ProdutoLink;
  restantes: number;
  pular: string[];
  podeOperar: boolean;
  linkAtivo?: LinkAtivo | null;
  tz?: string;
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState(linkAtivo?.label ?? "");
  const [destino, setDestino] = useState<{ status: string; host: string | null; mensagem: string } | null>(null);
  const [validandoDestino, iniciarValidarDestino] = useTransition();
  const [validacao, setValidacao] = useState<Validacao | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [validando, iniciarValidar] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const [pulando, iniciarPular] = useTransition();
  const ocupado = validando || salvando || pulando || validandoDestino;

  function validarDestino() {
    if (!linkAtivo || !podeOperar) return;
    iniciarValidarDestino(async () => {
      const r = await validarRedirectAgora(linkAtivo.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setDestino({ status: r.status, host: r.host, mensagem: r.mensagem });
      if (r.status === "ok") toast.success(r.mensagem);
      else if (r.status === "ok_unverified") toast.warning(r.mensagem);
      else toast.error(r.mensagem);
      router.refresh();
    });
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(produto.codigo);
      toast.success("ID do produto copiado.");
    } catch {
      toast.error("Não foi possível copiar o ID.");
    }
  }

  const statusDestino = destino?.status ?? linkAtivo?.redirect_status ?? "unchecked";
  const hostDestino = destino ? destino.host : (linkAtivo?.final_host ?? null);

  function mudarUrl(v: string) {
    setUrl(v);
    setValidacao(null);
    setErroSalvar(null);
  }

  async function copiarOriginal() {
    if (!produto.permalink) return;
    try {
      await navigator.clipboard.writeText(produto.permalink);
      toast.success("URL original copiada.");
    } catch {
      toast.error("Não foi possível copiar — selecione a URL e use Ctrl+C.");
    }
  }

  async function colar() {
    try {
      const texto = (await navigator.clipboard.readText()).trim();
      if (!texto) {
        toast.info("A área de transferência está vazia.");
        return;
      }
      mudarUrl(texto);
      campo.current?.focus();
    } catch {
      toast.error("O navegador bloqueou a leitura da área de transferência. Clique no campo e use Ctrl+V.");
      campo.current?.focus();
    }
  }

  function validar() {
    if (!url.trim()) return;
    iniciarValidar(async () => {
      const r = await validarLinkAfiliado(produto.id, url.trim());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setValidacao({ valido: r.valido, erros: r.erros, avisos: r.avisos, url: r.url });
    });
  }

  function salvar() {
    if (!url.trim() || !podeOperar) {
      campo.current?.focus();
      return;
    }
    iniciarSalvar(async () => {
      setErroSalvar(null);
      const r = await salvarEProximo(produto.id, url.trim(), label.trim() || null, pular);
      if (!r.ok) {
        setErroSalvar(r.error);
        campo.current?.focus();
        return;
      }
      if (r.avisos.length) toast.success("Link salvo.", { description: r.avisos.join(" ") });
      else toast.success("Link salvo — produto pronto para criativos.");
      router.push(hrefFila(r.proximo, pular));
    });
  }

  function ignorar() {
    iniciarPular(async () => {
      const novo = [...pular.filter((p) => p !== produto.id), produto.id];
      const r = await proximoSemLink(novo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.push(hrefFila(r.productId, novo));
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">Links de afiliado</h1>
          <p className="text-body-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{restantes}</span> aguardando link
            {pular.length > 0 && <span> · {pular.length} ignorado(s) nesta sessão</span>} · meta 10–30 s por produto
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Produto */}
        <section aria-label="Produto" className="rounded-xl border border-border/70 bg-card p-4 shadow-card">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border/70 bg-card">
            {produto.imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={produto.imagem} alt={produto.title} className="absolute inset-0 size-full object-contain" />
            ) : (
              <Package className="absolute inset-0 m-auto size-10 text-muted-foreground" aria-hidden />
            )}
          </div>
          <h2 className="mt-4 text-body font-semibold leading-snug">{produto.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ScoreBadge score={produto.score} confianca={produto.confianca} />
            {produto.preco != null && <span className="text-body font-semibold tabular">{brl.format(produto.preco)}</span>}
            {produto.precoOriginal != null && produto.preco != null && produto.precoOriginal > produto.preco && (
              <span className="text-caption text-muted-foreground line-through tabular">{brl.format(produto.precoOriginal)}</span>
            )}
            {produto.desconto != null && produto.desconto > 0 && <Badge variant="success">-{Math.round(produto.desconto)}%</Badge>}
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-caption">
            <dt className="text-muted-foreground">ID do produto</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-foreground">{produto.codigo}</span>
              <button
                type="button"
                onClick={copiarCodigo}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Copiar ID do produto"
                title="Copiar ID do produto"
              >
                <Copy className="size-3.5" />
              </button>
            </dd>
            <dt className="text-muted-foreground">Etiqueta</dt>
            <dd className="min-w-0 truncate">
              {linkAtivo?.label ? (
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Tag className="size-3.5" aria-hidden />
                  {linkAtivo.label}
                </span>
              ) : (
                <span className="text-muted-foreground">{linkAtivo ? "Link sem etiqueta" : "Sem link ainda"}</span>
              )}
            </dd>
          </dl>
          {!produto.aguardandoLink && (
            <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-caption text-muted-foreground">
              Este produto não está aguardando link. Salvar aqui substitui o link atual.
            </p>
          )}
          <div className="mt-4 space-y-2">
            <p className="text-caption font-medium text-muted-foreground">URL original</p>
            <p className="break-all rounded-lg bg-secondary/60 px-3 py-2 font-mono text-caption">{produto.permalink ?? "Sem URL original"}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copiarOriginal} disabled={!produto.permalink}>
                <Copy /> Copiar URL original
              </Button>
              {produto.permalink && (
                <Button asChild variant="tech" size="sm">
                  <a href={produto.permalink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Abrir produto
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Link */}
        <section aria-label="Link de afiliado" className="space-y-4">
          {linkAtivo && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-card" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-body-sm font-semibold">
                    <Link2 className="size-4 text-tech" aria-hidden /> Link atual
                  </p>
                  <a
                    href={linkAtivo.affiliate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block break-all font-mono text-caption text-muted-foreground hover:text-foreground"
                    title={linkAtivo.affiliate_url}
                  >
                    {encurtar(linkAtivo.affiliate_url)}
                  </a>
                </div>
                <StatusRedirect status={statusDestino} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
                <dt className="text-muted-foreground">Host final</dt>
                <dd className="min-w-0 truncate font-mono">{hostDestino ?? "—"}</dd>
                <dt className="text-muted-foreground">Destino detectado</dt>
                <dd className="min-w-0">
                  {linkAtivo.final_url ? (
                    <a
                      href={linkAtivo.final_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 hover:text-foreground"
                      title={linkAtivo.final_url}
                    >
                      <span className="truncate font-mono">{encurtar(linkAtivo.final_url, 64)}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Ainda não resolvido</span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Última validação</dt>
                <dd className="tabular">
                  {linkAtivo.last_checked_at ? formatarNoFuso(linkAtivo.last_checked_at, tz, { dateStyle: "short", timeStyle: "short" }) : "Nunca"}
                </dd>
              </dl>
              {destino && <p className="text-caption text-muted-foreground">{destino.mensagem}</p>}
              {statusDestino === "inconsistent" && (
                <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-caption text-destructive">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  O link leva a outro destino — a publicação fica bloqueada. Gere um novo link no painel de afiliados e cole abaixo.
                </p>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={validarDestino} disabled={!podeOperar || ocupado}>
                {validandoDestino ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Validar destino
              </Button>
            </div>
          )}

          <ol className="grid gap-2 rounded-xl border border-border/70 bg-card p-4 text-body-sm shadow-card sm:grid-cols-2">
            {[
              <>Clique em <strong>Abrir produto</strong> (ou copie a URL original).</>,
              <>
                Gere o link no{" "}
                <a href={PAINEL_AFILIADOS} target="_blank" rel="noopener noreferrer" className="font-medium text-tech underline-offset-4 hover:underline">
                  painel de afiliados do Mercado Livre
                </a>
                .
              </>,
              <>Cole o link no campo abaixo.</>,
              <>
                <strong>Salvar e próximo</strong> (ou Enter).
              </>,
            ].map((passo, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tech/15 text-caption font-semibold text-tech">{i + 1}</span>
                <span className="pt-0.5">{passo}</span>
              </li>
            ))}
          </ol>

          <form
            className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-card"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
          >
            <label htmlFor="link-afiliado" className="block text-body-sm font-medium">
              Cole o link de afiliado
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="link-afiliado"
                ref={campo}
                value={url}
                onChange={(e) => mudarUrl(e.target.value)}
                placeholder="https://mercadolivre.com/sec/…"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                aria-invalid={Boolean(erroSalvar || (validacao && !validacao.valido))}
                aria-describedby="link-resultado"
                className="h-12 font-mono text-body-sm"
                disabled={!podeOperar}
              />
              <Button type="button" variant="secondary" onClick={colar} disabled={!podeOperar} className="h-12 shrink-0">
                <ClipboardPaste /> Colar da área de transferência
              </Button>
            </div>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground">
                <Tag className="size-3.5" aria-hidden /> Etiqueta / tag (opcional)
              </summary>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder="ex.: campanha-outubro"
                className="mt-2"
                aria-label="Etiqueta do link"
              />
            </details>

            <div id="link-resultado" aria-live="polite" className="space-y-1.5">
              {erroSalvar && (
                <p className="flex items-start gap-1.5 text-body-sm text-destructive">
                  <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erroSalvar}
                </p>
              )}
              {validacao?.erros.map((e) => (
                <p key={e} className="flex items-start gap-1.5 text-body-sm text-destructive">
                  <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
                </p>
              ))}
              {validacao?.avisos.map((a) => (
                <p key={a} className="flex items-start gap-1.5 text-body-sm text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {a}
                </p>
              ))}
              {validacao?.valido && (
                <p className="flex items-center gap-1.5 text-body-sm text-success">
                  <CheckCircle2 className="size-4" aria-hidden /> Link válido.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" variant="tech" size="lg" disabled={!podeOperar || !url.trim() || ocupado} className="flex-1 sm:flex-none">
                {salvando ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                Salvar e próximo
              </Button>
              <Button type="button" variant="secondary" onClick={validar} disabled={!podeOperar || !url.trim() || ocupado}>
                {validando ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                Validar
              </Button>
              <Button type="button" variant="ghost" onClick={ignorar} disabled={ocupado} className="sm:ml-auto">
                {pulando ? <Loader2 className="animate-spin" /> : <SkipForward />}
                Ignorar por agora
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">
              Enter salva e abre o próximo. O link é conferido (formato, domínio e redirecionamento) antes de salvar; o destino final é resolvido
              no servidor e fica registrado com o host e a data da validação.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
