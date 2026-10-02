"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  ImageOff,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Scissors,
  Star,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  adicionarImagemUrl,
  definirPapelImagem,
  enviarImagemProduto,
  importarImagens,
  prepararRecorteAgora,
} from "@/app/ml/(painel)/criativos/actions-v2";
import { AcaoBotao, type RespostaAcao } from "@/components/ml/acao-botao";
import { JobStatus } from "@/components/ml/job-status";
import { WizardLote, type WizardLoteProps } from "@/components/ml/familias/wizard-lote";
import {
  MIDIA_STATUS_LABEL,
  ORIGEM_MIDIA_LABEL,
  PAPEL_MIDIA_LABEL,
  RECORTE_STATUS_LABEL,
  type MidiaView,
  type PapelMidia,
} from "@/components/ml/familias/rotulos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";

const TIPOS = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 9.5 * 1024 * 1024;

const TOM_PAPEL: Record<string, "tech" | "accent" | "outline" | "default"> = {
  primary_reference: "tech",
  complementary: "accent",
  do_not_use: "outline",
  consult_only: "default",
};

const XADREZ: React.CSSProperties = {
  backgroundImage:
    "conic-gradient(rgb(var(--border)) 25%, rgb(var(--card)) 0 50%, rgb(var(--border)) 0 75%, rgb(var(--card)) 0)",
  backgroundSize: "16px 16px",
};

/** Seção "Imagens do anúncio" (V2 §4, §11.3): galeria, papéis de referência, recorte e entrada manual. */
export function ImagensAnuncio({
  productId,
  midias,
  importadoEm,
  tz,
  podeOperar,
  wizard,
}: {
  productId: string;
  midias: MidiaView[];
  importadoEm: string | null;
  tz: string;
  podeOperar: boolean;
  wizard: Omit<WizardLoteProps, "aberto" | "aoMudar" | "semGatilho" | "midias" | "productId">;
}) {
  const [jobImportacao, setJobImportacao] = useState<string | null>(null);
  const [jobsRecorte, setJobsRecorte] = useState<Record<string, string>>({});
  const [wizardAberto, setWizardAberto] = useState(false);
  const [modoUrl, setModoUrl] = useState(false);

  const comJobImportacao = useCallback((r: RespostaAcao) => {
    if (typeof r.jobId === "string") setJobImportacao(r.jobId);
  }, []);

  const prontas = midias.filter((m) => m.status === "ready");
  const temPrincipal = midias.some((m) => m.media_role === "primary_reference" && m.status === "ready");

  return (
    <div className="space-y-4">
      {/* Barra de ações da seção */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
          <span className="tabular">
            {midias.length} imagem{midias.length === 1 ? "" : "ns"}
            {midias.length > prontas.length ? ` · ${prontas.length} pronta${prontas.length === 1 ? "" : "s"}` : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {importadoEm ? `Atualizado em ${importadoEm}` : "Nunca importado"}
          </span>
          {midias.length > 0 && !temPrincipal && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3.5" aria-hidden /> Sem referência principal
            </span>
          )}
        </p>
        {podeOperar && (
          <div className="flex flex-wrap items-center gap-2">
            <AcaoBotao size="sm" variant="outline" acao={() => importarImagens(productId)} aoConcluir={comJobImportacao} semRefresh>
              <RefreshCw /> Importar ou atualizar imagens
            </AcaoBotao>
            <Button size="sm" variant={modoUrl ? "secondary" : "outline"} onClick={() => setModoUrl((v) => !v)} aria-expanded={modoUrl}>
              <Link2 /> Adicionar por URL
            </Button>
            <EnviarImagem productId={productId} />
            <Button size="sm" variant="tech" onClick={() => setWizardAberto(true)}>
              <Layers /> Criar família / Gerar lote
            </Button>
          </div>
        )}
      </div>

      {jobImportacao && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2">
          <JobStatus jobId={jobImportacao} />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
            onClick={() => setJobImportacao(null)}
          >
            <RotateCcw className="size-3" aria-hidden /> Limpar
          </button>
        </div>
      )}

      {podeOperar && modoUrl && <FormUrl productId={productId} aoConcluir={() => setModoUrl(false)} />}

      {midias.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <ImagePlus className="size-5" aria-hidden />
          </div>
          <h3 className="text-body font-semibold">Nenhuma imagem do anúncio na galeria</h3>
          <p className="max-w-md text-body-sm text-muted-foreground">
            Importe as fotos reais do anúncio (API do Mercado Livre e dados da descoberta). Elas viram referência para os criativos — o
            produto gerado precisa ser fiel a elas.
          </p>
          {podeOperar && (
            <div className="mt-3">
              <AcaoBotao size="sm" variant="tech" acao={() => importarImagens(productId)} aoConcluir={comJobImportacao} semRefresh>
                <RefreshCw /> Importar imagens do anúncio
              </AcaoBotao>
            </div>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {midias.map((m, i) => (
            <li key={m.id} className="flex">
              <CartaoMidia
                midia={m}
                indice={i}
                tz={tz}
                podeOperar={podeOperar}
                jobRecorte={jobsRecorte[m.id] ?? null}
                aoRecortar={(jobId) => setJobsRecorte((j) => ({ ...j, [m.id]: jobId }))}
              />
            </li>
          ))}
        </ul>
      )}

      {podeOperar && (
        <WizardLote {...wizard} productId={productId} midias={midias} aberto={wizardAberto} aoMudar={setWizardAberto} semGatilho />
      )}
    </div>
  );
}

function CartaoMidia({
  midia: m,
  indice,
  tz,
  podeOperar,
  jobRecorte,
  aoRecortar,
}: {
  midia: MidiaView;
  indice: number;
  tz: string;
  podeOperar: boolean;
  jobRecorte: string | null;
  aoRecortar: (jobId: string) => void;
}) {
  const pronta = m.status === "ready";
  const alt = `Imagem ${indice + 1} do anúncio${m.is_primary ? " (principal)" : ""}`;
  const papelAtual = m.media_role as PapelMidia;
  const definir = (papel: PapelMidia) => () => definirPapelImagem(m.id, papel);

  return (
    <article
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card shadow-card",
        papelAtual === "primary_reference" ? "border-tech ring-1 ring-tech/40" : "border-border/70",
        papelAtual === "do_not_use" && "opacity-75",
      )}
    >
      <div className="relative aspect-square border-b border-border/70 bg-white">
        {m.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem do Storage/Mercado Livre
          <img src={m.url} alt={alt} loading="lazy" className="size-full object-contain p-2" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-caption text-muted-foreground">
            <ImageOff className="size-6" aria-hidden /> Sem prévia
          </span>
        )}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {m.is_primary && (
            <Badge variant="default" className="bg-card/95 px-2 py-0 shadow-sm">
              <Star className="size-3 fill-current text-warning" aria-hidden /> Principal do anúncio
            </Badge>
          )}
        </div>
        <span className="absolute bottom-2 right-2 rounded-full bg-card/90 px-2 py-0.5 text-caption text-muted-foreground shadow-sm tabular">
          {m.width && m.height ? `${m.width}×${m.height}` : "—"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={TOM_PAPEL[m.media_role] ?? "default"} className="px-2 py-0">
            {m.media_role === "primary_reference" ? (
              <Star className="size-3" aria-hidden />
            ) : m.media_role === "do_not_use" ? (
              <Ban className="size-3" aria-hidden />
            ) : m.media_role === "consult_only" ? (
              <Eye className="size-3" aria-hidden />
            ) : (
              <Layers className="size-3" aria-hidden />
            )}
            {PAPEL_MIDIA_LABEL[m.media_role] ?? m.media_role}
          </Badge>
          <span className="text-caption text-muted-foreground">{m.role_source === "user" ? "por você" : "automático"}</span>
        </div>

        <dl className="space-y-0.5 text-caption">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Origem</dt>
            <dd className="text-right">{ORIGEM_MIDIA_LABEL[m.source_type] ?? m.source_type}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right">
              <StatusMidia status={m.status} />
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Capturada</dt>
            <dd className="text-right tabular">{formatarNoFuso(m.captured_at, tz, { dateStyle: "short", timeStyle: "short" })}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Recorte</dt>
            <dd className="text-right">
              <StatusRecorte status={m.cutout_status} />
            </dd>
          </div>
        </dl>
        {m.status === "failed" && m.error && <p className="line-clamp-3 text-caption text-destructive">{m.error}</p>}
        {m.cutout_note && m.cutout_status !== "ready" && <p className="line-clamp-2 text-caption text-muted-foreground">{m.cutout_note}</p>}

        {m.cutout_status === "ready" && m.cutout_url && (
          <div className="flex items-center gap-2">
            <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border/70" style={XADREZ}>
              {/* eslint-disable-next-line @next/next/no-img-element -- recorte (PNG transparente) do Storage */}
              <img src={m.cutout_url} alt={`Recorte da imagem ${indice + 1}`} loading="lazy" className="size-full object-contain" />
            </div>
            <p className="text-caption text-muted-foreground">Produto recortado, usado na composição exata.</p>
          </div>
        )}

        {jobRecorte && <JobStatus jobId={jobRecorte} compacto />}

        <div className="mt-auto space-y-2 pt-1">
          {podeOperar && (
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Papel da imagem">
              <PapelBotao
                ativo={papelAtual === "primary_reference"}
                disabled={!pronta}
                title={pronta ? "Usar como referência principal" : "Disponível quando a imagem estiver pronta"}
                acao={definir("primary_reference")}
              >
                Principal
              </PapelBotao>
              <PapelBotao
                ativo={papelAtual === "complementary"}
                disabled={!pronta}
                title={pronta ? "Usar como referência complementar" : "Disponível quando a imagem estiver pronta"}
                acao={definir("complementary")}
              >
                Complementar
              </PapelBotao>
              <PapelBotao ativo={papelAtual === "do_not_use"} title="Não usar para geração" acao={definir("do_not_use")}>
                Não usar
              </PapelBotao>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {m.source_url && (
              <Button asChild size="sm" variant="ghost" className="h-8 px-2.5 text-caption">
                <a href={m.source_url} target="_blank" rel="noopener noreferrer" title="Abrir original">
                  <ExternalLink /> Original
                </a>
              </Button>
            )}
            {m.public_url && (
              <Button asChild size="sm" variant="ghost" className="h-8 px-2.5 text-caption">
                <a href={m.public_url} download={`referencia-${indice + 1}`} target="_blank" rel="noopener noreferrer" title="Baixar referência">
                  <Download /> Baixar
                </a>
              </Button>
            )}
            {podeOperar && pronta && m.cutout_status !== "ready" && (
              <AcaoBotao
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-caption"
                acao={() => prepararRecorteAgora(m.id)}
                aoConcluir={(r) => typeof r.jobId === "string" && aoRecortar(r.jobId)}
                semRefresh
                title="Preparar recorte do produto"
              >
                <Scissors /> Recorte
              </AcaoBotao>
            )}
            {podeOperar && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" className="ml-auto size-8" aria-label="Mais ações da imagem">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <ItemPapel mediaId={m.id} papel="consult_only" atual={papelAtual}>
                    <Eye className="size-4" /> Somente consulta
                  </ItemPapel>
                  {m.cutout_url && m.cutout_status === "ready" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <a href={m.cutout_url} download={`recorte-${indice + 1}`} target="_blank" rel="noopener noreferrer">
                          <Download className="size-4" /> Baixar recorte
                        </a>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function PapelBotao({
  ativo,
  acao,
  children,
  disabled,
  title,
}: {
  ativo: boolean;
  acao: () => Promise<RespostaAcao>;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <AcaoBotao
      size="sm"
      variant={ativo ? "tech" : "outline"}
      className="h-8 px-1.5 text-caption"
      acao={acao}
      disabled={disabled || ativo}
      aria-pressed={ativo}
      title={title}
    >
      {children}
    </AcaoBotao>
  );
}

function ItemPapel({ mediaId, papel, atual, children }: { mediaId: string; papel: PapelMidia; atual: PapelMidia; children: React.ReactNode }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  return (
    <DropdownMenuItem
      disabled={atual === papel}
      onSelect={() =>
        iniciar(async () => {
          const r = await definirPapelImagem(mediaId, papel);
          if ("error" in r) toast.error(r.error);
          else {
            toast.success(r.mensagem);
            router.refresh();
          }
        })
      }
    >
      {children}
    </DropdownMenuItem>
  );
}

function StatusMidia({ status }: { status: string }) {
  const Icon = status === "ready" ? CheckCircle2 : status === "failed" ? AlertTriangle : Loader2;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        status === "ready" ? "text-success" : status === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-3.5", status === "pending" && "animate-spin")} aria-hidden />
      {MIDIA_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function StatusRecorte({ status }: { status: string }) {
  const Icon = status === "ready" ? CheckCircle2 : status === "failed" ? AlertTriangle : status === "not_possible" ? Ban : Scissors;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        status === "ready" ? "text-success" : status === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {RECORTE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function FormUrl({ productId, aoConcluir }: { productId: string; aoConcluir: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="space-y-2 rounded-xl border border-border/70 bg-secondary/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = url.trim();
        if (!v) return;
        iniciar(async () => {
          const r = await adicionarImagemUrl(productId, v);
          if ("error" in r) {
            toast.error(r.error);
            return;
          }
          toast.success(r.mensagem);
          setUrl("");
          aoConcluir();
          router.refresh();
        });
      }}
    >
      <label htmlFor="url-imagem" className="text-body-sm font-medium">
        URL da imagem
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="url-imagem"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://http2.mlstatic.com/D_NQ_NP_…-O.webp"
          className="h-10 flex-1"
          disabled={pendente}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="tech" className="h-10" disabled={pendente || !url.trim()}>
            {pendente ? <Loader2 className="animate-spin" /> : <ImagePlus />} Adicionar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-10" onClick={aoConcluir} disabled={pendente}>
            <X /> Cancelar
          </Button>
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        Por segurança, só aceitamos imagens do Mercado Livre (domínio mlstatic). Para outras imagens, use “Enviar imagem”.
      </p>
    </form>
  );
}

function EnviarImagem({ productId }: { productId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(f: File | null | undefined) {
    if (!f) return;
    if (!TIPOS.includes(f.type)) {
      toast.error("Formato não suportado. Use PNG, JPG ou WebP.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`Imagem com ${(f.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB — o limite é 9,5 MB.`);
      return;
    }
    const fd = new FormData();
    fd.set("arquivo", f);
    iniciar(async () => {
      const r = await enviarImagemProduto(productId, fd);
      if (input.current) input.current.value = "";
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      router.refresh();
    });
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={TIPOS.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => enviar(e.target.files?.[0])}
      />
      <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={pendente} title="PNG, JPG ou WebP até 9,5 MB">
        {pendente ? <Loader2 className="animate-spin" /> : <Upload />} Enviar imagem
      </Button>
    </>
  );
}
