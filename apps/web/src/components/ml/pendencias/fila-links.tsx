"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Loader2,
  Package,
  ShieldCheck,
  SkipForward,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { proximoSemLink, salvarEProximo } from "@/app/ml/(painel)/pendencias/actions";
import { validarLinkAfiliado } from "@/app/ml/(painel)/produtos/actions";
import { ScoreBadge } from "@/components/ml/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
export function FilaLinks({ produto, restantes, pular, podeOperar }: { produto: ProdutoLink; restantes: number; pular: string[]; podeOperar: boolean }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [validacao, setValidacao] = useState<Validacao | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [validando, iniciarValidar] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const [pulando, iniciarPular] = useTransition();
  const ocupado = validando || salvando || pulando;

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
            <span className="text-caption text-muted-foreground">{produto.codigo}</span>
          </div>
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
              Enter salva e abre o próximo. O link é conferido (formato, domínio e redirecionamento) antes de salvar.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
