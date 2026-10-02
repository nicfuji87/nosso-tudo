"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, ChevronRight, CloudDownload, FolderTree, Info, Loader2, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/patterns/empty-state";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Checkbox, Secao } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import { atualizarCategoria, expandirCategoria, sincronizarCategoriasRaiz } from "@/app/ml/(painel)/configuracoes/actions";
import type { RespostaAcao } from "@/components/ml/acao-botao";
import { cn } from "@/lib/utils";

export interface CategoriaLite {
  id: string;
  name: string;
  parent_id: string | null;
  has_children: boolean | null;
  tracked: boolean;
  prohibited: boolean;
  commission_pct: number | null;
  max_products: number | null;
  priority: number;
  path: { id: string; name: string }[];
}

function useExec() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const exec = (fn: () => Promise<RespostaAcao>, opts?: { silencioso?: boolean }) =>
    new Promise<boolean>((resolve) =>
      iniciar(async () => {
        try {
          const r = await fn();
          if (r?.error) {
            toast.error(r.error);
            resolve(false);
            return;
          }
          if (!opts?.silencioso && r?.mensagem) toast.success(r.mensagem);
          router.refresh();
          resolve(true);
        } catch {
          toast.error("Não foi possível concluir. Tente de novo.");
          resolve(false);
        }
      }),
    );
  return { pendente, exec };
}

function caminhoTexto(c: CategoriaLite): string {
  const nomes = c.path.map((p) => p.name);
  if (nomes.length === 0 || nomes[nomes.length - 1] !== c.name) nomes.push(c.name);
  return nomes.join(" › ");
}

const numOuNull = (s: string): number | null | "erro" => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "erro";
};

/** Uma linha da árvore: acompanhar, proibir e ajustes (comissão, máx., prioridade). */
function LinhaCategoria({
  cat,
  nivel,
  filhos,
  aberto,
  onAlternar,
  podeEditar,
  podeOperar,
  mostrarCaminho,
}: {
  cat: CategoriaLite;
  nivel: number;
  filhos: number;
  aberto: boolean;
  onAlternar: () => Promise<void>;
  podeEditar: boolean;
  podeOperar: boolean;
  mostrarCaminho?: boolean;
}) {
  const { pendente, exec } = useExec();
  const [expandindo, setExpandindo] = useState(false);
  const [comissao, setComissao] = useState(cat.commission_pct == null ? "" : String(cat.commission_pct));
  const [maximo, setMaximo] = useState(cat.max_products == null ? "" : String(cat.max_products));
  const [prioridade, setPrioridade] = useState(String(cat.priority));

  const c = numOuNull(comissao);
  const m = numOuNull(maximo);
  const p = numOuNull(prioridade);
  const erroC = c === "erro" || (typeof c === "number" && (c < 0 || c > 100));
  const erroM = m === "erro" || (typeof m === "number" && (!Number.isInteger(m) || m < 1 || m > 200));
  const erroP = p === "erro" || p === null || (typeof p === "number" && (!Number.isInteger(p) || p < -100 || p > 100));
  const sujo =
    comissao.trim() !== (cat.commission_pct == null ? "" : String(cat.commission_pct)) ||
    maximo.trim() !== (cat.max_products == null ? "" : String(cat.max_products)) ||
    prioridade.trim() !== String(cat.priority);
  const podeExpandir = cat.has_children !== false && podeOperar ? true : filhos > 0;
  const folha = cat.has_children === false;

  return (
    <li className={cn("border-b border-border/60 last:border-0", cat.prohibited && "bg-destructive/5")}>
      <div className="flex flex-col gap-2 px-2 py-2.5 lg:flex-row lg:items-center" style={{ paddingLeft: `${0.5 + nivel * 1.25}rem` }}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {podeExpandir ? (
            <button
              type="button"
              onClick={async () => {
                setExpandindo(true);
                await onAlternar();
                setExpandindo(false);
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              aria-expanded={aberto}
              aria-label={aberto ? `Recolher ${cat.name}` : `Ver subcategorias de ${cat.name}`}
              disabled={expandindo}
            >
              {expandindo ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className={cn("size-4 transition-transform", aberto && "rotate-90")} />}
            </button>
          ) : (
            <span className="size-7 shrink-0" aria-hidden />
          )}
          <label className="flex min-w-0 cursor-pointer items-center gap-2">
            <Checkbox
              checked={cat.tracked}
              disabled={!podeEditar || pendente || cat.prohibited}
              onChange={(e) => void exec(() => atualizarCategoria(cat.id, { tracked: e.target.checked }))}
              aria-label={`Acompanhar ${cat.name}`}
            />
            <span className="min-w-0">
              <span className={cn("block truncate text-body-sm", cat.tracked && "font-semibold")}>{mostrarCaminho ? caminhoTexto(cat) : cat.name}</span>
              <span className="flex flex-wrap gap-1.5 text-caption text-muted-foreground">
                <span className="tabular">{cat.id}</span>
                {folha && <span>· sem subcategorias (tem ranking próprio)</span>}
                {!folha && filhos > 0 && <span>· {filhos} subcategorias</span>}
              </span>
            </span>
          </label>
          {cat.tracked && (
            <Badge variant="tech" size="sm" className="shrink-0">
              <Star className="size-3" aria-hidden /> Acompanhada
            </Badge>
          )}
          {cat.prohibited && (
            <Badge variant="destructive" size="sm" className="shrink-0">
              <Ban className="size-3" aria-hidden /> Proibida
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2 pl-9 lg:pl-0">
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
            Proibida
            <Switch
              checked={cat.prohibited}
              disabled={!podeEditar || pendente}
              onCheckedChange={(v) => void exec(() => atualizarCategoria(cat.id, v ? { prohibited: true, tracked: false } : { prohibited: false }))}
              aria-label={`Proibir ${cat.name}`}
            />
          </label>
          <label className="w-20 text-caption text-muted-foreground">
            Comissão %
            <Input
              value={comissao}
              onChange={(e) => setComissao(e.target.value)}
              inputMode="decimal"
              placeholder="auto"
              className={cn("tabular h-9 px-2", erroC && "border-destructive")}
              disabled={!podeEditar || pendente}
              aria-invalid={erroC}
            />
          </label>
          <label className="w-20 text-caption text-muted-foreground">
            Máx. prod.
            <Input
              value={maximo}
              onChange={(e) => setMaximo(e.target.value)}
              inputMode="numeric"
              placeholder="padrão"
              className={cn("tabular h-9 px-2", erroM && "border-destructive")}
              disabled={!podeEditar || pendente}
              aria-invalid={erroM}
            />
          </label>
          <label className="w-20 text-caption text-muted-foreground">
            Prioridade
            <Input
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value)}
              inputMode="numeric"
              className={cn("tabular h-9 px-2", erroP && "border-destructive")}
              disabled={!podeEditar || pendente}
              aria-invalid={erroP}
            />
          </label>
          {podeEditar && sujo && (
            <Button
              size="sm"
              variant="tech"
              className="h-9"
              disabled={pendente || erroC || erroM || erroP}
              onClick={() =>
                void exec(() =>
                  atualizarCategoria(cat.id, {
                    commission_pct: typeof c === "number" ? c : null,
                    max_products: typeof m === "number" ? m : null,
                    priority: typeof p === "number" ? p : 0,
                  }),
                )
              }
            >
              {pendente && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function Arvore({
  ids,
  porId,
  filhosDe,
  nivel,
  abertos,
  alternar,
  podeEditar,
  podeOperar,
}: {
  ids: string[];
  porId: Map<string, CategoriaLite>;
  filhosDe: Map<string, string[]>;
  nivel: number;
  abertos: Set<string>;
  alternar: (c: CategoriaLite) => Promise<void>;
  podeEditar: boolean;
  podeOperar: boolean;
}) {
  return (
    <>
      {ids.map((id) => {
        const cat = porId.get(id);
        if (!cat) return null;
        const filhos = filhosDe.get(id) ?? [];
        const aberto = abertos.has(id);
        return (
          <Fragment key={id}>
            <LinhaCategoria
              cat={cat}
              nivel={nivel}
              filhos={filhos.length}
              aberto={aberto}
              onAlternar={() => alternar(cat)}
              podeEditar={podeEditar}
              podeOperar={podeOperar}
            />
            {aberto && filhos.length > 0 && (
              <Arvore
                ids={filhos}
                porId={porId}
                filhosDe={filhosDe}
                nivel={nivel + 1}
                abertos={abertos}
                alternar={alternar}
                podeEditar={podeEditar}
                podeOperar={podeOperar}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export function GerenciarCategorias({
  categorias,
  mlConectado,
  podeEditar,
  podeOperar,
}: {
  categorias: CategoriaLite[];
  mlConectado: boolean;
  podeEditar: boolean;
  podeOperar: boolean;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const remover = useExec();

  const { porId, filhosDe, raizes, acompanhadas } = useMemo(() => {
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const filhosDe = new Map<string, string[]>();
    const raizes: string[] = [];
    const ordenar = (a: string, b: string) => (porId.get(a)?.name ?? "").localeCompare(porId.get(b)?.name ?? "", "pt-BR");
    for (const c of categorias) {
      if (c.parent_id && porId.has(c.parent_id)) {
        const l = filhosDe.get(c.parent_id) ?? [];
        l.push(c.id);
        filhosDe.set(c.parent_id, l);
      } else if (!c.parent_id) raizes.push(c.id);
    }
    raizes.sort(ordenar);
    for (const l of filhosDe.values()) l.sort(ordenar);
    const acompanhadas = categorias.filter((c) => c.tracked).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "pt-BR"));
    return { porId, filhosDe, raizes, acompanhadas };
  }, [categorias]);

  const resultadosBusca = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (q.length < 2) return null;
    return categorias.filter((c) => c.name.toLocaleLowerCase("pt-BR").includes(q) || c.id.toLowerCase() === q).slice(0, 60);
  }, [busca, categorias]);

  const alternar = async (c: CategoriaLite) => {
    if (abertos.has(c.id)) {
      setAbertos((s) => {
        const n = new Set(s);
        n.delete(c.id);
        return n;
      });
      return;
    }
    if ((filhosDe.get(c.id)?.length ?? 0) === 0 && c.has_children !== false) {
      if (!podeOperar) return;
      try {
        const r = await expandirCategoria(c.id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success(r.mensagem);
        router.refresh();
      } catch {
        toast.error("Não foi possível carregar as subcategorias.");
        return;
      }
    }
    setAbertos((s) => new Set(s).add(c.id));
  };

  return (
    <div className="space-y-6">
      <Secao
        titulo="Categorias acompanhadas"
        descricao="O app procura produtos só nas categorias marcadas. Comece com poucas (3 a 5) que combinem com o Pinterest: casa, decoração, cozinha, beleza, moda."
        acoes={
          podeOperar && (
            <AcaoBotao
              size="sm"
              variant="secondary"
              acao={sincronizarCategoriasRaiz}
              semRefresh
              aoConcluir={(r) => setJobId(typeof r.jobId === "string" ? r.jobId : null)}
              disabled={!mlConectado}
              title={!mlConectado ? "Conecte o Mercado Livre primeiro" : undefined}
            >
              <CloudDownload /> Carregar categorias do Mercado Livre
            </AcaoBotao>
          )
        }
      >
        {!mlConectado && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 text-body-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p>
              Para carregar as categorias, conecte o Mercado Livre em{" "}
              <Link href="/ml/integracoes#mercadolivre" className="font-medium text-tech underline-offset-4 hover:underline">
                Integrações
              </Link>
              .
            </p>
          </div>
        )}
        {jobId && (
          <div className="mb-4">
            <JobStatus jobId={jobId} />
          </div>
        )}
        {acompanhadas.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">Nenhuma categoria acompanhada ainda. Marque abaixo as que quer acompanhar.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {acompanhadas.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-full border border-tech/30 bg-tech/5 py-1 pl-3 pr-1 text-body-sm">
                <span className="max-w-[18rem] truncate" title={caminhoTexto(c)}>
                  {c.name}
                </span>
                {c.priority !== 0 && <span className="tabular text-caption text-muted-foreground">({c.priority > 0 ? `+${c.priority}` : c.priority})</span>}
                {podeEditar && (
                  <button
                    type="button"
                    disabled={remover.pendente}
                    onClick={() => void remover.exec(() => atualizarCategoria(c.id, { tracked: false }))}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label={`Parar de acompanhar ${c.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 flex items-start gap-2 text-caption text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          O ranking de mais vendidos (top 20) do Mercado Livre existe só nas categorias finais, sem subcategorias. Ao marcar uma categoria “mãe”, o app olha
          as subcategorias dela (veja “Incluir subcategorias” em Descoberta, abaixo).
        </p>
      </Secao>

      <Secao titulo="Explorar categorias" descricao="Abra uma categoria para ver as subcategorias. Marque a caixa para acompanhar.">
        {categorias.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="Nenhuma categoria carregada"
            description="Clique em “Carregar categorias do Mercado Livre” acima para buscar a lista oficial."
          />
        ) : (
          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar entre as categorias carregadas…" className="pl-10" aria-label="Buscar categoria" />
            </div>
            <ul className="max-h-[36rem] overflow-y-auto rounded-xl border border-border/70">
              {resultadosBusca ? (
                resultadosBusca.length === 0 ? (
                  <li className="px-4 py-6 text-center text-body-sm text-muted-foreground">Nada encontrado. Abra a categoria mãe para carregar mais subcategorias.</li>
                ) : (
                  resultadosBusca.map((c) => (
                    <LinhaCategoria
                      key={c.id}
                      cat={c}
                      nivel={0}
                      filhos={filhosDe.get(c.id)?.length ?? 0}
                      aberto={false}
                      onAlternar={async () => {
                        setBusca("");
                        const cadeia = [...c.path.map((x) => x.id).filter((id) => id !== c.id)];
                        setAbertos((s) => new Set([...s, ...cadeia]));
                        await alternar(c);
                      }}
                      podeEditar={podeEditar}
                      podeOperar={podeOperar}
                      mostrarCaminho
                    />
                  ))
                )
              ) : (
                <Arvore
                  ids={raizes}
                  porId={porId}
                  filhosDe={filhosDe}
                  nivel={0}
                  abertos={abertos}
                  alternar={alternar}
                  podeEditar={podeEditar}
                  podeOperar={podeOperar}
                />
              )}
            </ul>
            <p className="text-caption text-muted-foreground">
              <strong>Proibida</strong>: o app nunca recomenda produtos dessa categoria. <strong>Comissão %</strong>: sua comissão de afiliado na categoria
              (melhora o score). <strong>Máx. prod.</strong>: limite por rodada (vazio = padrão). <strong>Prioridade</strong>: −100 a 100, maior aparece primeiro.
            </p>
          </div>
        )}
      </Secao>
    </div>
  );
}
