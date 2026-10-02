"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import { salvarSecao } from "@/app/ml/(painel)/configuracoes/actions";
import { cn } from "@/lib/utils";

/**
 * Formulários de configuração dirigidos por especificação de campos.
 * Os limites (min/max/inteiro) espelham os schemas Zod de `lib/ml/config.ts`;
 * o servidor valida de novo e é a autoridade.
 */

type Base = { chave: string; label: string; dica?: React.ReactNode; dependeDe?: string; largo?: boolean };
export type CampoSpec =
  | (Base & { tipo: "num"; min?: number; max?: number; inteiro?: boolean; passo?: number; sufixo?: string; escala?: number })
  | (Base & { tipo: "bool" })
  | (Base & { tipo: "texto"; max?: number; placeholder?: string })
  | (Base & { tipo: "textarea"; max?: number; placeholder?: string; linhas?: number })
  | (Base & { tipo: "select"; opcoes: { valor: string; label: string }[] })
  | (Base & { tipo: "cor" });

export type Valores = Record<string, unknown>;
type Estado = Record<string, string | boolean>;

function paraEstado(campos: CampoSpec[], valores: Valores): Estado {
  const e: Estado = {};
  for (const c of campos) {
    const v = valores[c.chave];
    if (c.tipo === "bool") e[c.chave] = Boolean(v);
    else if (c.tipo === "num") {
      const n = typeof v === "number" ? v : Number(v ?? 0);
      const exibido = c.escala ? Math.round(n * c.escala * 100) / 100 : n;
      e[c.chave] = String(exibido);
    } else e[c.chave] = v == null ? "" : String(v);
  }
  return e;
}

function validar(c: CampoSpec, bruto: string | boolean): { valor?: unknown; erro?: string } {
  if (c.tipo === "bool") return { valor: Boolean(bruto) };
  const s = String(bruto);
  if (c.tipo === "num") {
    const t = s.trim().replace(",", ".");
    if (t === "") return { erro: "Obrigatório." };
    const n = Number(t);
    if (!Number.isFinite(n)) return { erro: "Número inválido." };
    if (c.inteiro && !Number.isInteger(n)) return { erro: "Use um número inteiro." };
    if (c.min != null && n < c.min) return { erro: `Mínimo ${c.min}.` };
    if (c.max != null && n > c.max) return { erro: `Máximo ${c.max}.` };
    const real = c.escala ? Math.round((n / c.escala) * 10000) / 10000 : n;
    return { valor: real };
  }
  if (c.tipo === "cor") return /^#[0-9a-fA-F]{6}$/.test(s) ? { valor: s } : { erro: "Use o formato #RRGGBB." };
  if ((c.tipo === "texto" || c.tipo === "textarea") && c.max != null && s.length > c.max) return { erro: `Até ${c.max} caracteres.` };
  return { valor: s };
}

/** Estado + validação de um conjunto de campos. */
export function useCampos(campos: CampoSpec[], iniciais: Valores) {
  const [estado, setEstado] = useState<Estado>(() => paraEstado(campos, iniciais));
  const [base, setBase] = useState<Estado>(() => paraEstado(campos, iniciais));
  const { valores, erros } = useMemo(() => {
    const valores: Valores = {};
    const erros: Record<string, string> = {};
    for (const c of campos) {
      const r = validar(c, estado[c.chave] ?? "");
      if (r.erro) erros[c.chave] = r.erro;
      else valores[c.chave] = r.valor;
    }
    return { valores, erros };
  }, [campos, estado]);
  const sujo = campos.some((c) => estado[c.chave] !== base[c.chave]);
  return {
    estado,
    set: (chave: string, v: string | boolean) => setEstado((e) => ({ ...e, [chave]: v })),
    valores,
    erros,
    valido: Object.keys(erros).length === 0,
    sujo,
    /** Após salvar: o estado atual vira a nova base ("sem alterações"). */
    marcarSalvo: () => setBase(estado),
    descartar: () => setEstado(base),
  };
}

/** Salvar uma seção (`salvarSecao`) com toast + refresh. */
export function useSalvarSecao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const salvar = (secao: string, valores: Valores) =>
    new Promise<boolean>((resolve) =>
      iniciar(async () => {
        try {
          const r = await salvarSecao(secao, valores);
          if ("error" in r && r.error) {
            toast.error(r.error);
            resolve(false);
            return;
          }
          toast.success(r.ok ? r.mensagem : "Configurações salvas.");
          router.refresh();
          resolve(true);
        } catch {
          toast.error("Não foi possível salvar. Verifique sua conexão.");
          resolve(false);
        }
      }),
    );
  return { pendente, salvar };
}

type RespostaGenerica = { error?: string; mensagem?: string } & Record<string, unknown>;

/** Executa qualquer Server Action de configuração com toast + refresh. Devolve a resposta (ou null em erro). */
export function useExecutarAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const executar = <R extends RespostaGenerica>(acao: () => Promise<R>, opts?: { semToast?: boolean }) =>
    new Promise<R | null>((resolve) =>
      iniciar(async () => {
        try {
          const r = await acao();
          if (r.error) {
            toast.error(r.error);
            resolve(null);
            return;
          }
          if (!opts?.semToast && typeof r.mensagem === "string") toast.success(r.mensagem);
          router.refresh();
          resolve(r);
        } catch {
          toast.error("Não foi possível concluir. Verifique sua conexão e tente de novo.");
          resolve(null);
        }
      }),
    );
  return { pendente, executar };
}

export function LinhaSwitch({
  id,
  label,
  dica,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  dica?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body-sm font-medium">
          {label}
        </label>
        {dica && <p className="mt-0.5 text-caption text-muted-foreground">{dica}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-caption text-muted-foreground" aria-hidden>
          {checked ? "Ligado" : "Desligado"}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

/** Renderiza os campos. `prefixo` evita colisão de ids entre seções. */
export function Campos({
  campos,
  form,
  disabled,
  prefixo,
  className,
}: {
  campos: CampoSpec[];
  form: ReturnType<typeof useCampos>;
  disabled?: boolean;
  prefixo: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {campos.map((c) => {
        const id = `${prefixo}-${c.chave}`;
        const v = form.estado[c.chave];
        const erro = form.erros[c.chave];
        const inativo = c.dependeDe ? form.estado[c.dependeDe] !== true : false;
        const dis = disabled || inativo;
        if (c.tipo === "bool") {
          return (
            <div key={c.chave} className="sm:col-span-2">
              <LinhaSwitch id={id} label={c.label} dica={c.dica} checked={v === true} onChange={(x) => form.set(c.chave, x)} disabled={dis} />
            </div>
          );
        }
        const dica = erro ? <span className="text-destructive">{erro}</span> : c.dica;
        const span = c.largo || c.tipo === "textarea" ? "sm:col-span-2" : undefined;
        return (
          <Campo key={c.chave} label={c.label} dica={dica} className={cn(span, inativo && "opacity-60")}>
            {c.tipo === "num" ? (
              <div className="relative">
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  value={String(v ?? "")}
                  min={c.min}
                  max={c.max}
                  step={c.passo ?? (c.inteiro ? 1 : "any")}
                  onChange={(e) => form.set(c.chave, e.target.value)}
                  aria-invalid={Boolean(erro)}
                  disabled={dis}
                  className={cn("tabular", c.sufixo && "pr-14")}
                />
                {c.sufixo && (
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-caption text-muted-foreground">{c.sufixo}</span>
                )}
              </div>
            ) : c.tipo === "select" ? (
              <NativeSelect id={id} value={String(v ?? "")} onChange={(e) => form.set(c.chave, e.target.value)} disabled={dis} className="w-full">
                {c.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            ) : c.tipo === "textarea" ? (
              <Textarea
                id={id}
                value={String(v ?? "")}
                onChange={(e) => form.set(c.chave, e.target.value)}
                maxLength={c.max}
                rows={c.linhas ?? 4}
                placeholder={c.placeholder}
                aria-invalid={Boolean(erro)}
                disabled={dis}
              />
            ) : c.tipo === "cor" ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : "#000000"}
                  onChange={(e) => form.set(c.chave, e.target.value.toUpperCase())}
                  disabled={dis}
                  aria-label={`${c.label} (seletor)`}
                  className="h-11 w-14 cursor-pointer rounded-md border border-input bg-card p-1 disabled:opacity-50"
                />
                <Input
                  id={id}
                  value={String(v ?? "")}
                  onChange={(e) => form.set(c.chave, e.target.value)}
                  maxLength={7}
                  className="font-mono uppercase"
                  aria-invalid={Boolean(erro)}
                  disabled={dis}
                />
              </div>
            ) : (
              <Input
                id={id}
                value={String(v ?? "")}
                onChange={(e) => form.set(c.chave, e.target.value)}
                maxLength={c.max}
                placeholder={c.placeholder}
                aria-invalid={Boolean(erro)}
                disabled={dis}
              />
            )}
          </Campo>
        );
      })}
    </div>
  );
}

/** Rodapé com "Salvar" / "Descartar" e aviso de alterações pendentes. */
export function BarraSalvar({
  sujo,
  valido,
  pendente,
  podeEditar,
  onSalvar,
  onDescartar,
  rotulo = "Salvar alterações",
}: {
  sujo: boolean;
  valido: boolean;
  pendente: boolean;
  podeEditar: boolean;
  onSalvar: () => void;
  onDescartar?: () => void;
  rotulo?: string;
}) {
  if (!podeEditar) {
    return <p className="mt-4 text-caption text-muted-foreground">Somente administradores do ML podem alterar estas configurações.</p>;
  }
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border/70 pt-4">
      {sujo && !valido && <span className="text-caption text-destructive">Corrija os campos destacados.</span>}
      {sujo && valido && <span className="text-caption text-warning">Alterações não salvas</span>}
      {onDescartar && sujo && (
        <Button type="button" variant="ghost" size="sm" onClick={onDescartar} disabled={pendente}>
          Descartar
        </Button>
      )}
      <Button type="button" size="sm" onClick={onSalvar} disabled={!sujo || !valido || pendente} aria-busy={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
        {rotulo}
      </Button>
    </div>
  );
}
