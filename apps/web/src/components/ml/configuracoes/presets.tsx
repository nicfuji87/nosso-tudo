"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, CircleOff, ImagePlus, Loader2, Pencil, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/patterns/empty-state";
import { Campo, NativeSelect, Secao, Textarea } from "@/components/ml/campos";
import { salvarPreset } from "@/app/ml/(painel)/configuracoes/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useExecutarAcao } from "./form";

/** Presets de cena (spec V2 §7) — extensíveis pelo painel sem alterar código. */

export type AreaTexto = "top" | "bottom" | "none";

export interface PresetView {
  id: string;
  key: string;
  name: string;
  environment: string;
  palette: string | null;
  lighting: string | null;
  style: string | null;
  realism: string;
  text_area: string;
  restrictions: string | null;
  category_hint: string | null;
  active: boolean;
  sort: number;
}

const AREA_LABEL: Record<AreaTexto, string> = {
  top: "Texto no terço superior",
  bottom: "Texto no terço inferior",
  none: "Sem área de texto",
};

const area = (v: string): AreaTexto => (v === "bottom" || v === "none" ? v : "top");

interface DadosPreset {
  name: string;
  environment: string;
  palette: string | null;
  lighting: string | null;
  style: string | null;
  realism: string;
  text_area: AreaTexto;
  restrictions: string | null;
  category_hint: string | null;
  active: boolean;
  sort: number;
}

function dadosDe(p: PresetView): DadosPreset {
  return {
    name: p.name,
    environment: p.environment,
    palette: p.palette,
    lighting: p.lighting,
    style: p.style,
    realism: p.realism || "fotográfico",
    text_area: area(p.text_area),
    restrictions: p.restrictions,
    category_hint: p.category_hint,
    active: p.active,
    sort: p.sort,
  };
}

const VAZIO: DadosPreset = {
  name: "",
  environment: "",
  palette: "",
  lighting: "",
  style: "",
  realism: "fotográfico",
  text_area: "top",
  restrictions: "sem pessoas; sem marcas visíveis",
  category_hint: "",
  active: true,
  sort: 0,
};

const LIMITES = { name: 80, environment: 160, palette: 200, lighting: 200, style: 200, realism: 60, restrictions: 300, category_hint: 200 } as const;

function validarPreset(d: DadosPreset): Partial<Record<keyof DadosPreset, string>> {
  const e: Partial<Record<keyof DadosPreset, string>> = {};
  if (d.name.trim().length < 2) e.name = "Informe um nome (mín. 2 caracteres).";
  if (d.environment.trim().length < 2) e.environment = "Descreva o ambiente (mín. 2 caracteres).";
  for (const [k, max] of Object.entries(LIMITES) as [keyof typeof LIMITES, number][]) {
    const v = d[k];
    if (typeof v === "string" && v.length > max) e[k] = `Até ${max} caracteres.`;
  }
  if (!Number.isInteger(d.sort) || d.sort < 0 || d.sort > 1000) e.sort = "Inteiro de 0 a 1000.";
  return e;
}

const limpar = (v: string | null) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

function payload(d: DadosPreset) {
  return {
    name: d.name.trim(),
    environment: d.environment.trim(),
    palette: limpar(d.palette),
    lighting: limpar(d.lighting),
    style: limpar(d.style),
    realism: d.realism.trim() || "fotográfico",
    text_area: d.text_area,
    restrictions: limpar(d.restrictions),
    category_hint: limpar(d.category_hint),
    active: d.active,
    sort: d.sort,
  };
}

// ---------------------------------------------------------------------------
// Diálogo de edição/criação
// ---------------------------------------------------------------------------

function DialogPreset({
  aberto,
  onOpenChange,
  preset,
  sortSugerido,
  podeEditar,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  preset: PresetView | null;
  sortSugerido: number;
  podeEditar: boolean;
}) {
  const [d, setD] = useState<DadosPreset>(() => (preset ? dadosDe(preset) : { ...VAZIO, sort: sortSugerido }));
  const [sortTexto, setSortTexto] = useState(String(preset ? preset.sort : sortSugerido));
  const { pendente, executar } = useExecutarAcao();
  const bloqueado = pendente || !podeEditar;
  const erros = validarPreset(d);
  const valido = Object.keys(erros).length === 0;
  const set = <K extends keyof DadosPreset>(k: K, v: DadosPreset[K]) => setD((x) => ({ ...x, [k]: v }));
  const dica = (k: keyof DadosPreset, padrao?: string) => (erros[k] ? <span className="text-destructive">{erros[k]}</span> : padrao);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{!podeEditar ? "Preset de cena" : preset ? "Editar preset de cena" : "Novo preset de cena"}</DialogTitle>
          <DialogDescription>
            Os campos entram no prompt das imagens ({"{scene_environment}"}, {"{scene_palette}"}…). Mudanças valem para as próximas gerações.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valido || !podeEditar) return;
            const r = await executar(() => salvarPreset(preset?.id ?? null, payload(d)));
            if (r) onOpenChange(false);
          }}
        >
          <Campo label="Nome" dica={dica("name")}>
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={LIMITES.name} placeholder="Ex.: Banheiro pequeno claro" disabled={bloqueado} />
          </Campo>
          <Campo label="Ambiente" dica={dica("environment", "Onde a cena acontece.")}>
            <Input
              value={d.environment}
              onChange={(e) => set("environment", e.target.value)}
              maxLength={LIMITES.environment}
              placeholder="Ex.: banheiro pequeno de apartamento"
              disabled={bloqueado}
            />
          </Campo>
          <Campo label="Paleta" dica={dica("palette")}>
            <Input value={d.palette ?? ""} onChange={(e) => set("palette", e.target.value)} maxLength={LIMITES.palette} placeholder="Ex.: branco, bege e madeira clara" disabled={bloqueado} />
          </Campo>
          <Campo label="Iluminação" dica={dica("lighting")}>
            <Input value={d.lighting ?? ""} onChange={(e) => set("lighting", e.target.value)} maxLength={LIMITES.lighting} placeholder="Ex.: luz natural suave da manhã" disabled={bloqueado} />
          </Campo>
          <Campo label="Estilo" dica={dica("style")}>
            <Input value={d.style ?? ""} onChange={(e) => set("style", e.target.value)} maxLength={LIMITES.style} placeholder="Ex.: escandinavo, limpo e organizado" disabled={bloqueado} />
          </Campo>
          <Campo label="Nível de realismo" dica={dica("realism")}>
            <Input value={d.realism} onChange={(e) => set("realism", e.target.value)} maxLength={LIMITES.realism} list="preset-realismo" disabled={bloqueado} />
            <datalist id="preset-realismo">
              <option value="fotográfico" />
              <option value="fotográfico editorial" />
              <option value="render 3D realista" />
            </datalist>
          </Campo>
          <Campo label="Área reservada para texto" dica="Onde a headline é aplicada; o produto fica na área oposta.">
            <NativeSelect value={d.text_area} onChange={(e) => set("text_area", area(e.target.value))} className="w-full" disabled={bloqueado}>
              {(Object.keys(AREA_LABEL) as AreaTexto[]).map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Ordem" dica={dica("sort", "Menor aparece primeiro.")}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={1}
              value={sortTexto}
              onChange={(e) => {
                setSortTexto(e.target.value);
                const n = Number(e.target.value);
                set("sort", e.target.value.trim() === "" ? -1 : n);
              }}
              className="tabular"
              disabled={bloqueado}
            />
          </Campo>
          <Campo label="Restrições" dica={dica("restrictions", "O que a cena não pode ter. Ex.: sem pessoas; sem marcas visíveis.")} className="sm:col-span-2">
            <Textarea value={d.restrictions ?? ""} onChange={(e) => set("restrictions", e.target.value)} maxLength={LIMITES.restrictions} rows={2} disabled={bloqueado} />
          </Campo>
          <Campo
            label="Palavras de categoria"
            dica={dica("category_hint", "Separadas por | — sugerem este preset para produtos dessas categorias. Ex.: banheiro|box|chuveiro")}
            className="sm:col-span-2"
          >
            <Input value={d.category_hint ?? ""} onChange={(e) => set("category_hint", e.target.value)} maxLength={LIMITES.category_hint} className="font-mono" disabled={bloqueado} />
          </Campo>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 sm:col-span-2">
            <div>
              <p className="text-body-sm font-medium">Preset ativo</p>
              <p className="text-caption text-muted-foreground">Só presets ativos aparecem no wizard e nos lotes automáticos.</p>
            </div>
            <Switch checked={d.active} onCheckedChange={(v) => set("active", v)} disabled={bloqueado} aria-label="Preset ativo" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pendente}>
              {podeEditar ? "Cancelar" : "Fechar"}
            </Button>
            {podeEditar && (
              <Button type="submit" disabled={!valido || pendente} aria-busy={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Save />}
                {preset ? "Salvar preset" : "Criar preset"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

function Chip({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 rounded-full bg-secondary/70 px-2.5 py-0.5 text-caption">
      <span className="text-muted-foreground">{rotulo}:</span>
      <span className="truncate">{valor}</span>
    </span>
  );
}

function LinhaPreset({
  p,
  anterior,
  proximo,
  podeEditar,
  onEditar,
}: {
  p: PresetView;
  anterior: PresetView | null;
  proximo: PresetView | null;
  podeEditar: boolean;
  onEditar: () => void;
}) {
  const { pendente, executar } = useExecutarAcao();

  const salvarOrdem = (alvo: PresetView, sort: number) =>
    executar(() => salvarPreset(alvo.id, { ...payload(dadosDe(alvo)), sort: Math.max(0, Math.min(1000, sort)) }), { semToast: true });

  /** Troca a ordem com o vizinho; em empate, desempata com ±1 (um único salvamento). */
  const mover = async (vizinho: PresetView, direcao: -1 | 1) => {
    let ok: unknown;
    if (vizinho.sort !== p.sort) {
      ok = (await salvarOrdem(p, vizinho.sort)) && (await salvarOrdem(vizinho, p.sort));
    } else if (direcao === -1) {
      ok = await salvarOrdem(vizinho, vizinho.sort + 1);
    } else {
      ok = await salvarOrdem(p, p.sort + 1);
    }
    if (ok) toast.success("Ordem atualizada.");
  };

  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start", !p.active && "bg-secondary/30")}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-body-sm font-medium", !p.active && "text-muted-foreground")}>{p.name}</p>
          {p.active ? (
            <Badge variant="success" size="sm">
              <CheckCircle2 className="size-3" aria-hidden /> Ativo
            </Badge>
          ) : (
            <Badge variant="outline" size="sm">
              <CircleOff className="size-3" aria-hidden /> Inativo
            </Badge>
          )}
          <span className="text-caption text-muted-foreground">{AREA_LABEL[area(p.text_area)]}</span>
        </div>
        <p className="text-caption text-muted-foreground">{p.environment}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip rotulo="Paleta" valor={p.palette} />
          <Chip rotulo="Luz" valor={p.lighting} />
          <Chip rotulo="Estilo" valor={p.style} />
          <Chip rotulo="Realismo" valor={p.realism} />
          <Chip rotulo="Restrições" valor={p.restrictions} />
        </div>
        {p.category_hint && (
          <p className="text-caption text-muted-foreground">
            Sugerido para: <span className="font-mono">{p.category_hint.split("|").filter(Boolean).join(" · ")}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-start">
        <span className="mr-1 tabular text-caption text-muted-foreground" title="Ordem">
          #{p.sort}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={!podeEditar || pendente || !anterior}
          onClick={() => anterior && mover(anterior, -1)}
          aria-label={`Subir ${p.name}`}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={!podeEditar || pendente || !proximo}
          onClick={() => proximo && mover(proximo, 1)}
          aria-label={`Descer ${p.name}`}
        >
          <ArrowDown />
        </Button>
        <Switch
          checked={p.active}
          disabled={!podeEditar || pendente}
          onCheckedChange={(v) => executar(() => salvarPreset(p.id, { ...payload(dadosDe(p)), active: v }))}
          aria-label={p.active ? `Desativar ${p.name}` : `Ativar ${p.name}`}
          className="mx-1"
        />
        <Button type="button" size="sm" variant="secondary" onClick={onEditar} disabled={pendente}>
          <Pencil /> {podeEditar ? "Editar" : "Ver"}
        </Button>
        {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
      </div>
    </li>
  );
}

export function PresetsCena({ presets, podeEditar }: { presets: PresetView[]; podeEditar: boolean }) {
  const [editando, setEditando] = useState<{ preset: PresetView | null; chave: number } | null>(null);
  const ordenados = useMemo(() => [...presets].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR")), [presets]);
  const ativos = presets.filter((p) => p.active).length;
  const proximoSort = Math.min(1000, (ordenados.at(-1)?.sort ?? 0) + 10);

  return (
    <Secao
      titulo="Presets de cena"
      descricao={
        <>
          Ambientes usados nas imagens lifestyle e editoriais. A lista é extensível pelo painel, sem alterar código.{" "}
          <span className="tabular">
            {ativos} de {presets.length} ativo{presets.length === 1 ? "" : "s"}.
          </span>
        </>
      }
      acoes={
        podeEditar ? (
          <Button size="sm" onClick={() => setEditando({ preset: null, chave: Date.now() })}>
            <Plus /> Novo preset
          </Button>
        ) : undefined
      }
    >
      {ordenados.length === 0 ? (
        <EmptyState
          icon={ImagePlus}
          title="Nenhum preset de cena"
          description="Sem presets, as imagens usam um ambiente neutro genérico. Crie o primeiro para guiar as cenas."
          action={
            podeEditar ? (
              <Button size="sm" onClick={() => setEditando({ preset: null, chave: Date.now() })}>
                <Plus /> Criar preset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/70">
          {ordenados.map((p, i) => (
            <LinhaPreset
              key={p.id}
              p={p}
              anterior={ordenados[i - 1] ?? null}
              proximo={ordenados[i + 1] ?? null}
              podeEditar={podeEditar}
              onEditar={() => setEditando({ preset: p, chave: Date.now() })}
            />
          ))}
        </ul>
      )}
      {!podeEditar && <p className="mt-4 text-caption text-muted-foreground">Somente administradores do ML podem alterar os presets.</p>}

      {editando && (
        <DialogPreset
          key={editando.chave}
          aberto
          onOpenChange={(v) => !v && setEditando(null)}
          preset={editando.preset}
          sortSugerido={proximoSort}
          podeEditar={podeEditar}
        />
      )}
    </Secao>
  );
}
