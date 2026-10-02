"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Download, ExternalLink, History, ImageOff, Link2, Loader2, RefreshCw, Save, Sparkles, Type } from "lucide-react";
import { toast } from "sonner";
import { editarCriativo, regerarCopy, regerarImagem, usarImagem } from "@/app/ml/(painel)/criativos/actions";
import { editarPacoteExtra } from "@/app/ml/(painel)/criativos/actions-v2";
import { historicoCriativo, tiposAssets, type AssetHistorico, type RevisaoHistorico } from "@/app/ml/(painel)/criativos/consultas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Campo, Checkbox, NativeSelect, Textarea } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { StatusBadge } from "@/components/ml/status";
import { labelAngulo } from "@/lib/ml/conteudo/angulos";
import { LIMITES_PIN } from "@/lib/ml/conteudo/guardrails";
import { formatarNoFuso } from "@/lib/ml/tempo";
import { cn } from "@/lib/utils";
import { DetalhesV2 } from "./detalhes-v2";
import { UploadImagem } from "./upload-imagem";
import { RecorteImagem } from "./recorte-imagem";
import {
  ASSET_KIND_LABEL,
  MODOS_IMAGEM,
  PACOTE_LABEL,
  REVISAO_LABEL,
  baixarArquivo,
  editavel,
  labelModo,
  nomeArquivo,
  type BoardOpcao,
  type CriativoView,
} from "./rotulos";

const listaVirgula = (s: string, max: number) =>
  s
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, max);

function Contador({ atual, max }: { atual: number; max: number }) {
  const perto = atual > max * 0.9;
  return (
    <span className={cn("tabular", atual > max ? "text-destructive" : perto ? "text-warning" : "text-muted-foreground")}>
      {atual}/{max}
    </span>
  );
}

/** Campo com contador de caracteres no rótulo. */
function CampoContado({ label, atual, max, dica, children }: { label: string; atual: number; max: number; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-body-sm font-medium">
        {label} <Contador atual={atual} max={max} />
      </span>
      {children}
      {dica && <span className="block text-caption text-muted-foreground">{dica}</span>}
    </label>
  );
}

/** Painel lateral do criativo: textos, board, imagem (regerar/substituir) e histórico. */
export function EditorCriativo({
  criativo,
  boards,
  tz,
  podeOperar,
  aberto,
  aoMudar,
  acoes,
  erroAprovacao,
  aoJob,
}: {
  criativo: CriativoView;
  boards: BoardOpcao[];
  tz: string;
  podeOperar: boolean;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  acoes?: React.ReactNode;
  /** Motivo da última aprovação que falhou (V2). */
  erroAprovacao?: string | null;
  /** Encaminha jobs disparados aqui para o acompanhamento da tela. */
  aoJob?: (jobId: string, rotulo: string) => void;
}) {
  const router = useRouter();
  const pode = podeOperar && editavel(criativo.status);
  const v2 = Boolean(criativo.family_id);
  const manualV2 = v2 && (criativo.image_mode === "manual_chatgpt" || criativo.image_mode === "upload");
  const [secao, setSecao] = useState(criativo.board_section_id ?? "");
  const [interesses, setInteresses] = useState(criativo.interests.join(", "));
  const [feitaComIA, setFeitaComIA] = useState(criativo.image_mode === "manual_chatgpt");
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState(criativo.headline ?? "");
  const [titulo, setTitulo] = useState(criativo.title ?? "");
  const [descricao, setDescricao] = useState(criativo.description ?? "");
  const [alt, setAlt] = useState(criativo.alt_text ?? "");
  const [cta, setCta] = useState(criativo.cta ?? "");
  const [keywords, setKeywords] = useState(criativo.keywords.join(", "));
  const [boardId, setBoardId] = useState(criativo.board_id ?? "");
  const [modo, setModo] = useState("");
  const [jobs, setJobs] = useState<{ id: string; rotulo: string }[]>([]);
  const [historico, setHistorico] = useState<{ revisoes: RevisaoHistorico[]; assets: AssetHistorico[] } | null>(null);
  const [versao, setVersao] = useState(0);
  const [salvando, iniciarSalvar] = useTransition();
  const [regerando, iniciarRegerar] = useTransition();

  // Recarrega textos quando o servidor devolver uma versão nova (ex.: copy regenerada).
  useEffect(() => {
    setHeadline(criativo.headline ?? "");
    setTitulo(criativo.title ?? "");
    setDescricao(criativo.description ?? "");
    setAlt(criativo.alt_text ?? "");
    setCta(criativo.cta ?? "");
    setKeywords(criativo.keywords.join(", "));
    setBoardId(criativo.board_id ?? "");
    setSecao(criativo.board_section_id ?? "");
    setInteresses(criativo.interests.join(", "));
    // Só quando o servidor muda o criativo (updated_at) — refresh comum não apaga o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criativo.updated_at]);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void historicoCriativo(criativo.id).then((r) => {
      if (vivo && r.ok) setHistorico({ revisoes: r.revisoes, assets: r.assets });
    });
    // V2: rótulo de cada versão (sem texto / final / cenário).
    if (v2)
      void tiposAssets(criativo.id).then((r) => {
        if (vivo && r.ok) setTipos(r.tipos);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, criativo.id, criativo.updated_at, versao, v2]);

  const listaKeywords = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const listaInteresses = listaVirgula(interesses, 10);
  const secaoInvalida = secao.trim() !== "" && !/^\d+$/.test(secao.trim());
  const extrasMudaram = v2 && ((secao.trim() || null) !== (criativo.board_section_id ?? null) || listaInteresses.join("|") !== criativo.interests.join("|"));

  function salvar() {
    if (!pode) return;
    if (secaoInvalida) {
      toast.error("A seção do board é o ID numérico da seção no Pinterest.");
      return;
    }
    iniciarSalvar(async () => {
      const r = await editarCriativo(criativo.id, {
        headline,
        title: titulo,
        description: descricao,
        alt_text: alt,
        cta,
        keywords: listaKeywords.slice(0, 15),
        board_id: boardId || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (extrasMudaram) {
        const e = await editarPacoteExtra(criativo.id, { board_section_id: secao.trim() || null, interests: listaInteresses });
        if (!e.ok) {
          toast.error(`Textos salvos, mas o pacote não: ${e.error}`);
          router.refresh();
          return;
        }
      }
      if (r.alteracoes.length) toast.warning(r.mensagem);
      else toast.success(r.mensagem);
      setVersao((v) => v + 1);
      router.refresh();
    });
  }

  function regerar(tipo: "imagem" | "copy") {
    iniciarRegerar(async () => {
      const r = tipo === "imagem" ? await regerarImagem(criativo.id, (!v2 && modo) || undefined) : await regerarCopy(criativo.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      const jobId = r.jobId;
      const rotulo = tipo === "imagem" ? (v2 ? "Cena" : "Imagem") : v2 ? "Pacote Pinterest" : "Textos";
      if (jobId) {
        setJobs((j) => [{ id: jobId, rotulo }, ...j.filter((x) => x.id !== jobId)].slice(0, 3));
        aoJob?.(jobId, rotulo);
      }
      router.refresh();
    });
  }

  const img = criativo.asset;

  return (
    <Sheet open={aberto} onOpenChange={aoMudar}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tipo="creative" status={criativo.status} />
            <Badge variant="default">{labelModo(criativo.image_mode)}</Badge>
            {criativo.angulo && <Badge variant="outline">{labelAngulo(criativo.angulo)}</Badge>}
            <span className="text-caption text-muted-foreground">Formato {criativo.format}</span>
          </div>
          <SheetTitle className="line-clamp-2">{criativo.headline || criativo.title || "Criativo"}</SheetTitle>
          <SheetDescription>
            {criativo.produto ? (
              <Link href={`/ml/produtos/${criativo.produto.id}`} className="underline-offset-4 hover:underline">
                {criativo.produto.title}
              </Link>
            ) : (
              "Produto"
            )}
            {" · "}criado {formatarNoFuso(criativo.created_at, tz)}
          </SheetDescription>
        </SheetHeader>

        {acoes && <div className="mt-4 flex flex-wrap gap-2">{acoes}</div>}

        {erroAprovacao && (
          <p className="mt-4 flex gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Não aprovado: {erroAprovacao}
          </p>
        )}

        {v2 && (
          <section
            aria-label="Pacote Pinterest e fidelidade"
            className={cn(
              "mt-4 space-y-2 rounded-xl border px-3 py-3",
              criativo.package_status === "ready" ? "border-border/70 bg-secondary/30" : criativo.package_status === "invalid" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5",
            )}
          >
            <DetalhesV2 c={criativo} mostrarTitulo={false} />
            {criativo.package_errors.length > 0 ? (
              <div>
                <p className="text-caption font-medium">{PACOTE_LABEL[criativo.package_status] ?? criativo.package_status} — falta resolver:</p>
                <ul className="mt-1 space-y-0.5 text-caption text-muted-foreground">
                  {criativo.package_errors.map((e, i) => (
                    <li key={`${e.campo}-${i}`}>• {e.mensagem}</li>
                  ))}
                </ul>
              </div>
            ) : criativo.package_status === "ready" ? (
              <p className="text-caption text-muted-foreground">Pacote completo: título, descrição, alt text, board e link de afiliado prontos para o Pinterest.</p>
            ) : (
              <p className="text-caption text-muted-foreground">O pacote é gerado automaticamente quando a imagem final fica pronta. Use “Regerar copy” para refazer.</p>
            )}
          </section>
        )}

        {criativo.rejection_reason && criativo.status === "rejected" && (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">
            Rejeitado: {criativo.rejection_reason}
          </p>
        )}
        {criativo.last_error && (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-body-sm text-warning">Último erro: {criativo.last_error}</p>
        )}
        {!editavel(criativo.status) && (
          <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-body-sm text-muted-foreground">
            Criativo {criativo.status === "published" ? "publicado" : "arquivado"} — somente leitura. Use “Duplicar” para criar uma variante editável.
          </p>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
          {/* Imagem */}
          <div className="space-y-3">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-secondary/50">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.public_url} alt={criativo.alt_text ?? "Imagem do criativo"} className="absolute inset-0 size-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-caption text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden /> Sem imagem
                </div>
              )}
            </div>
            {img && (
              <p className="text-caption text-muted-foreground tabular">
                {img.width && img.height ? `${img.width}×${img.height}` : "Dimensões desconhecidas"}
                {criativo.quality_score != null && ` · qualidade ${Math.round(criativo.quality_score)}`}
              </p>
            )}
            {criativo.quality_notes.length > 0 && (
              <ul className="space-y-0.5 text-caption text-warning">
                {criativo.quality_notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            )}
            {img && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => void baixarArquivo(img.public_url, nomeArquivo(criativo.headline ?? criativo.produto?.title ?? "criativo", img.public_url))}
              >
                <Download /> Baixar imagem
              </Button>
            )}
            {img && pode && <RecorteImagem creativeId={criativo.id} src={img.public_url} aoAplicar={() => setVersao((v) => v + 1)} />}
            <ParaPinterest
              link={criativo.produto?.link ?? null}
              produtoId={criativo.product_id}
              campos={[
                ["Título", titulo],
                ["Descrição", descricao],
                ["Texto alternativo", alt],
              ]}
            />
          </div>

          {/* Textos */}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key.toLowerCase() === "s")) {
                e.preventDefault();
                salvar();
              }
            }}
          >
            <fieldset disabled={!pode || salvando} className="space-y-4">
              <CampoContado label="Headline" atual={headline.length} max={LIMITES_PIN.headline} dica="Texto curto que vai na arte.">
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={LIMITES_PIN.headline} />
              </CampoContado>
              <CampoContado label="Título do Pin" atual={titulo.length} max={LIMITES_PIN.titulo}>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={LIMITES_PIN.titulo} />
              </CampoContado>
              <CampoContado label="Descrição" atual={descricao.length} max={LIMITES_PIN.descricao} dica="O aviso de link de afiliado é garantido automaticamente.">
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={LIMITES_PIN.descricao} rows={5} />
              </CampoContado>
              <CampoContado label="Texto alternativo" atual={alt.length} max={LIMITES_PIN.altText} dica="Descreve a imagem para acessibilidade.">
                <Textarea value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={LIMITES_PIN.altText} rows={2} className="min-h-[60px]" />
              </CampoContado>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoContado label="CTA" atual={cta.length} max={40}>
                  <Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={40} />
                </CampoContado>
                <Campo label="Board sugerido">
                  <NativeSelect className="w-full" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                    <option value="">Automático (padrão / categoria)</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.is_default ? " (padrão)" : ""}
                      </option>
                    ))}
                    {criativo.board_id && !boards.some((b) => b.id === criativo.board_id) && (
                      <option value={criativo.board_id}>{criativo.board ?? "Board indisponível"}</option>
                    )}
                  </NativeSelect>
                </Campo>
              </div>
              <CampoContado label="Palavras-chave" atual={listaKeywords.length} max={15} dica="Separe por vírgula (até 15).">
                <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="organização, cozinha, achadinho" />
              </CampoContado>
              {v2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="Seção do board" dica={secaoInvalida ? "Use o ID numérico da seção no Pinterest." : "Opcional — ID da seção no Pinterest."}>
                    <Input
                      value={secao}
                      onChange={(e) => setSecao(e.target.value)}
                      inputMode="numeric"
                      placeholder="Ex.: 5498...21"
                      aria-invalid={secaoInvalida}
                    />
                  </Campo>
                  <CampoContado label="Interesses (referência)" atual={listaInteresses.length} max={10} dica="Separe por vírgula. Ficam no app para revisão — não vão pela API.">
                    <Input value={interesses} onChange={(e) => setInteresses(e.target.value)} placeholder="banheiro pequeno, organização" />
                  </CampoContado>
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="tech" disabled={!pode || salvando}>
                {salvando ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
              <span className="text-caption text-muted-foreground">Ctrl+Enter salva</span>
            </div>
          </form>
        </div>

        <Separator className="my-6" />

        {/* Regeneração e substituição */}
        <section className="space-y-4" aria-labelledby="sec-regerar">
          <h3 id="sec-regerar" className="text-body font-semibold">
            Imagem e textos
          </h3>
          <div className="flex flex-wrap items-end gap-2">
            {!v2 && (
              <Campo label="Modo da nova imagem" className="min-w-48">
                <NativeSelect className="w-full" value={modo} onChange={(e) => setModo(e.target.value)} disabled={!pode}>
                  <option value="">Manter ({labelModo(criativo.image_mode)})</option>
                  {MODOS_IMAGEM.filter((m) => m !== criativo.image_mode).map((m) => (
                    <option key={m} value={m}>
                      {labelModo(m)}
                    </option>
                  ))}
                </NativeSelect>
              </Campo>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!pode || regerando || manualV2}
              title={manualV2 ? "Variante manual: envie uma nova imagem abaixo." : undefined}
              onClick={() => regerar("imagem")}
            >
              {regerando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {v2 ? "Regerar cena" : "Regerar imagem"}
            </Button>
            <Button type="button" variant="secondary" disabled={!pode || regerando} onClick={() => regerar("copy")}>
              <Type /> Regerar copy
            </Button>
          </div>
          {v2 && pode && (
            <p className="text-caption text-muted-foreground">
              {manualV2 ? "Variante feita fora do app (ChatGPT/upload): para refazer, envie outra imagem." : "Nova cena = nova versão; a anterior fica no histórico."}
            </p>
          )}
          {criativo.status === "approved" && pode && (
            <p className="text-caption text-muted-foreground">Regerar volta o criativo para revisão.</p>
          )}
          {jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
              <Sparkles className="size-3.5 text-tech" aria-hidden />
              <span className="text-caption font-medium">{j.rotulo}:</span>
              <JobStatus jobId={j.id} compacto aoTerminar={() => setVersao((v) => v + 1)} />
            </div>
          ))}
          {pode && (
            <div className="space-y-1.5">
              <p className="text-body-sm font-medium">Substituir imagem</p>
              {v2 && (
                <label className="flex items-center gap-2 text-caption text-muted-foreground">
                  <Checkbox checked={feitaComIA} onChange={(e) => setFeitaComIA(e.target.checked)} />
                  Imagem feita com IA (marca o AI disclosure)
                </label>
              )}
              <UploadImagem
                creativeId={criativo.id}
                rotuloEnviar="Substituir"
                compacto
                feitaComIA={v2 ? feitaComIA : undefined}
                aoEnviar={() => setVersao((v) => v + 1)}
              />
              {v2 && <p className="text-caption text-muted-foreground">Após o envio, a fidelidade é checada e o pacote Pinterest é gerado automaticamente.</p>}
            </div>
          )}
        </section>

        <Separator className="my-6" />

        {/* Histórico */}
        <section className="space-y-4" aria-labelledby="sec-historico">
          <h3 id="sec-historico" className="flex items-center gap-2 text-body font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden /> Histórico
          </h3>
          {!historico ? (
            <p className="text-caption text-muted-foreground">Carregando…</p>
          ) : (
            <>
              {historico.assets.length > 0 && (
                <div>
                  <p className="mb-2 text-caption font-medium text-muted-foreground">Imagens ({historico.assets.length})</p>
                  <ul className="flex gap-3 overflow-x-auto pb-2">
                    {historico.assets.map((a) => (
                      <li key={a.id} className="w-24 shrink-0 space-y-1">
                        <a
                          href={a.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "relative block aspect-[2/3] overflow-hidden rounded-lg border bg-secondary/50",
                            a.id === criativo.asset?.id ? "border-tech ring-2 ring-tech/40" : "border-border/70",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.public_url} alt={`Versão de ${formatarNoFuso(a.created_at, tz)}`} loading="lazy" className="absolute inset-0 size-full object-cover" />
                        </a>
                        <p className="text-overline text-muted-foreground">
                          {a.id === criativo.asset?.id ? "Atual · " : ""}
                          {tipos[a.id] ? `${ASSET_KIND_LABEL[tipos[a.id]!] ?? tipos[a.id]} · ` : ""}
                          {labelModo(a.mode)}
                        </p>
                        <p className="text-overline text-muted-foreground tabular">{formatarNoFuso(a.created_at, tz)}</p>
                        {pode && a.id !== criativo.asset?.id && tipos[a.id] !== "background" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-full px-2 text-caption"
                            disabled={regerando}
                            onClick={() =>
                              iniciarRegerar(async () => {
                                const r = await usarImagem(criativo.id, a.id);
                                if (!r.ok) toast.error(r.error);
                                else {
                                  toast.success(r.mensagem);
                                  setVersao((v) => v + 1);
                                  router.refresh();
                                }
                              })
                            }
                          >
                            Usar esta
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {historico.revisoes.length > 0 ? (
                <ol className="space-y-2">
                  {historico.revisoes.map((r) => (
                    <li key={r.id} className="rounded-xl border border-border/70 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-body-sm font-medium">{REVISAO_LABEL[r.reason] ?? r.reason}</span>
                        <span className="text-caption text-muted-foreground tabular">{formatarNoFuso(r.created_at, tz)}</span>
                      </div>
                      {(r.headline || r.title) && (
                        <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground">
                          Antes: {r.headline ? `“${r.headline}”` : ""}
                          {r.headline && r.title ? " · " : ""}
                          {r.title ?? ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-caption text-muted-foreground">Sem alterações registradas.</p>
              )}
            </>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

/** Atalhos para publicar à mão no Pinterest: link de afiliado (destino do Pin) e textos com "Copiar". */
function ParaPinterest({ link, produtoId, campos }: { link: string | null; produtoId: string; campos: [string, string][] }) {
  const copiar = (rotulo: string, texto: string) =>
    void navigator.clipboard.writeText(texto).then(
      () => toast.success(`${rotulo} copiado.`),
      () => toast.error("Não foi possível copiar."),
    );
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-caption font-semibold">
        <Link2 className="size-3.5" aria-hidden /> Link de afiliado (destino do Pin)
      </p>
      {link ? (
        <>
          <p className="break-all font-mono text-caption text-muted-foreground">{link}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => copiar("Link", link)}>
              <Copy /> Copiar link
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Abrir link de afiliado">
                <ExternalLink />
              </a>
            </Button>
          </div>
        </>
      ) : (
        <p className="text-caption text-warning">
          Produto sem link de afiliado.{" "}
          <Link href={`/ml/produtos/${produtoId}#link`} className="underline">
            Cadastrar link
          </Link>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {campos.map(([rotulo, texto]) => (
          <Button key={rotulo} type="button" variant="ghost" size="sm" disabled={!texto.trim()} onClick={() => copiar(rotulo, texto)}>
            <Copy /> {rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}
