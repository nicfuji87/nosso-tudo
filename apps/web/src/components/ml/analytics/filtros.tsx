"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarRange, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FiltroSelect } from "@/components/ml/publicacoes/filtro-select";
import { hrefCom, type ParamsUrl } from "@/components/ml/publicacoes/tipos";
import { TIPOS_ANGULO } from "@/lib/ml/conteudo/angulos";
import { cn } from "@/lib/utils";
import { FAIXAS_PRECO, FILTROS_URL, fmtData } from "./formato";

const BASE = "/ml/analytics";
const PERIODOS = ["7", "30", "90"] as const;

export function FiltrosAnalytics({
  params,
  de,
  ate,
  personalizado,
  categorias,
  boards,
  rotulos,
}: {
  params: ParamsUrl;
  de: string;
  ate: string;
  personalizado: boolean;
  categorias: { value: string; label: string }[];
  boards: { value: string; label: string }[];
  rotulos: { produto?: string; criativo?: string };
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(personalizado);
  const [deLocal, setDe] = useState(de);
  const [ateLocal, setAte] = useState(ate);
  const periodoAtivo = personalizado ? null : (params.periodo ?? "30");
  const temFiltro = Object.keys(FILTROS_URL).some((k) => params[k]);

  const aplicarIntervalo = () => {
    if (!deLocal || !ateLocal || deLocal > ateLocal) return;
    iniciar(() => router.replace(hrefCom(BASE, params, { de: deLocal, ate: ateLocal, periodo: null }), { scroll: false }));
  };

  const sel = (nome: string, rotulo: string, opcoes: { value: string; label: string }[], todos = "Todos") => (
    <FiltroSelect nome={nome} rotulo={rotulo} valor={params[nome]} opcoes={opcoes} params={params} base={BASE} limpar={[]} todos={todos} />
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-card sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-secondary p-1" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={hrefCom(BASE, params, { periodo: p === "30" ? null : p, de: null, ate: null })}
              scroll={false}
              aria-current={periodoAtivo === p ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-body-sm font-medium transition-colors",
                periodoAtivo === p ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p} dias
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-medium transition-colors",
              personalizado ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarRange className="size-4" aria-hidden />
            {personalizado ? `${fmtData(de, true)} – ${fmtData(ate, true)}` : "Personalizado"}
          </button>
        </div>
        {aberto && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              aplicarIntervalo();
            }}
          >
            <Input type="date" value={deLocal} max={ateLocal} onChange={(e) => setDe(e.target.value)} className="h-9 w-auto" aria-label="De" />
            <span className="text-caption text-muted-foreground">até</span>
            <Input type="date" value={ateLocal} min={deLocal} onChange={(e) => setAte(e.target.value)} className="h-9 w-auto" aria-label="Até" />
            <Button type="submit" size="sm" variant="outline" disabled={pendente || !deLocal || !ateLocal || deLocal > ateLocal}>
              {pendente && <Loader2 className="animate-spin" />}
              Aplicar
            </Button>
          </form>
        )}
        {!aberto && (
          <span className="text-caption text-muted-foreground">
            {fmtData(de)} – {fmtData(ate)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sel("categoria", "Categoria", categorias, "Todas")}
        {sel("board", "Board", boards)}
        {sel(
          "angulo",
          "Ângulo",
          [...TIPOS_ANGULO.map((a) => ({ value: a.tipo, label: a.label })), { value: "sem_angulo", label: "Sem ângulo" }],
        )}
        {sel("faixa", "Faixa de preço", FAIXAS_PRECO.map((f) => ({ value: f, label: f })), "Todas")}
        {sel("ambiente", "Ambiente", [
          { value: "production", label: "Produção" },
          { value: "sandbox", label: "Sandbox" },
        ])}
        {params.produto && (
          <Chip href={hrefCom(BASE, params, { produto: null })} rotulo={`Produto: ${rotulos.produto ?? "selecionado"}`} />
        )}
        {params.criativo && (
          <Chip href={hrefCom(BASE, params, { criativo: null })} rotulo={`Criativo: ${rotulos.criativo ?? "selecionado"}`} />
        )}
        {temFiltro && (
          <Button asChild variant="ghost" size="sm">
            <Link href={hrefCom(BASE, { periodo: params.periodo, de: params.de, ate: params.ate }, {})} scroll={false}>
              Limpar filtros
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Chip({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex h-9 max-w-[18rem] items-center gap-1.5 rounded-full bg-tech/10 px-3 text-caption text-tech hover:bg-tech/15"
      title="Remover filtro"
    >
      <span className="truncate">{rotulo}</span>
      <X className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">remover filtro</span>
    </Link>
  );
}
