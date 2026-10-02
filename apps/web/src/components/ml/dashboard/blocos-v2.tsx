import Link from "next/link";
import { ArrowRight, ImageOff, Layers, Mountain, PackageCheck, ShieldAlert, ShieldQuestion, Shapes, type LucideIcon } from "lucide-react";
import { Secao } from "@/components/ml/campos";
import { formatarNumero, formatarPercentual } from "@/components/ml/logs/formatos";
import { Button } from "@/components/ui/button";
import { TIPO_VISUAL_LABEL, TIPOS_VISUAIS } from "@/lib/ml/familias/plano";
import { ContadorLink } from "./contador";
import type { ContadoresV2, MelhorItem } from "./tipos";

const rotuloTipo = (t: string) => (TIPO_VISUAL_LABEL as Record<string, string>)[t] ?? t;

/** Bloco V2 do Dashboard (§11.1): famílias, referência, fidelidade, pacote Pinterest e desempenho por tipo/cena. */
export function FamiliasBloco({
  v2,
  melhorCena,
  melhorTipo,
  erro,
}: {
  v2: ContadoresV2;
  melhorCena: MelhorItem | null;
  melhorTipo: MelhorItem | null;
  erro?: string | null;
}) {
  const tom = (n: number, t: "acao" | "alerta" | "erro" = "acao") => (n > 0 ? t : "neutro");
  return (
    <Secao
      titulo="Famílias de criativos"
      descricao="Testes por hipótese: referências do anúncio, fidelidade ao produto e pacote pronto para o Pinterest."
      acoes={
        <Button asChild size="sm" variant="ghost">
          <Link href="/ml/criativos">
            Abrir criativos <ArrowRight />
          </Link>
        </Button>
      }
    >
      {erro && (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-caption text-destructive" role="alert">
          Não foi possível carregar os contadores V2: {erro}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <ContadorLink href="/ml/criativos" rotulo="Famílias de criativos em teste" valor={v2.familias_em_teste} icone={Layers} tom={v2.familias_em_teste > 0 ? "ok" : "neutro"} />
        <ContadorLink
          href="/ml/pendencias?tipo=referencias"
          rotulo="Produtos sem referência aprovada"
          dica="Escolha a imagem principal do anúncio"
          valor={v2.produtos_sem_referencia}
          icone={ImageOff}
          tom={tom(v2.produtos_sem_referencia)}
        />
        <ContadorLink
          href="/ml/pendencias?tipo=fidelidade"
          rotulo="Criativos com alerta de fidelidade"
          dica="Atenção ou reprovados na checagem"
          valor={v2.criativos_alerta_fidelidade}
          icone={ShieldAlert}
          tom={tom(v2.criativos_alerta_fidelidade, "erro")}
        />
        <ContadorLink
          href="/ml/pendencias?tipo=fidelidade"
          rotulo="Revisões de fidelidade pendentes"
          valor={v2.criativos_fidelidade_pendente}
          icone={ShieldQuestion}
          tom={tom(v2.criativos_fidelidade_pendente)}
        />
        <ContadorLink
          href="/ml/pendencias?tipo=pacote"
          rotulo="Pendências de pacote Pinterest"
          dica="Aprovados sem pacote completo"
          valor={v2.pacotes_pendentes}
          icone={PackageCheck}
          tom={tom(v2.pacotes_pendentes, "alerta")}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PorTipo porTipo={v2.publicados_por_tipo} />
        <div>
          <h3 className="mb-2 text-body-sm font-semibold">Destaques · 30 dias</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Destaque titulo="Melhor cena" icone={Mountain} item={melhorCena} href="/ml/analytics?coorte_por=scene" />
            <Destaque titulo="Melhor tipo de criativo" icone={Shapes} item={melhorTipo} href="/ml/analytics?coorte_por=visual_type" />
          </div>
          <p className="mt-2 text-caption text-muted-foreground">Por outbound clicks dos Pins publicados no período.</p>
        </div>
      </div>
    </Secao>
  );
}

function PorTipo({ porTipo }: { porTipo: Record<string, number> }) {
  const chaves = [...TIPOS_VISUAIS, ...Object.keys(porTipo).filter((k) => !(TIPOS_VISUAIS as readonly string[]).includes(k))];
  const linhas = chaves.map((k) => ({ k, n: Number(porTipo[k] ?? 0) || 0 }));
  const total = linhas.reduce((s, l) => s + l.n, 0);
  const max = Math.max(0, ...linhas.map((l) => l.n));
  return (
    <div>
      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-body-sm font-semibold">
        <span>Pins publicados por tipo visual · 30 dias</span>
        <span className="tabular text-caption font-normal text-muted-foreground">{formatarNumero(total)} no total</span>
      </h3>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-caption text-muted-foreground">
          Nenhum Pin publicado nos últimos 30 dias.
        </p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <li key={l.k}>
              <Link href={`/ml/analytics?tipo=${encodeURIComponent(l.k)}`} className="group block rounded-md px-1 py-0.5 hover:bg-secondary/60">
                <span className="flex items-baseline justify-between gap-2 text-caption">
                  <span className="truncate group-hover:text-foreground">{rotuloTipo(l.k)}</span>
                  <span className="tabular font-medium">
                    {formatarNumero(l.n)}
                    <span className="ml-1 text-muted-foreground">({formatarPercentual(l.n / total, 0)})</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <span className="block h-full rounded-full bg-tech/70" style={{ width: `${max > 0 ? (l.n / max) * 100 : 0}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Destaque({ titulo, icone: Icone, item, href }: { titulo: string; icone: LucideIcon; item: MelhorItem | null; href: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:bg-secondary/60">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-foreground">
        <Icone className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-overline uppercase tracking-wide text-muted-foreground">{titulo}</span>
        {item ? (
          <>
            <span className="block truncate text-body-sm font-semibold" title={item.rotulo}>
              {item.rotulo}
            </span>
            <span className="tabular block text-caption text-muted-foreground">
              {formatarNumero(item.outbound_clicks)} cliques · CTR {formatarPercentual(item.ctr)} · {formatarNumero(item.pins)} Pin(s)
            </span>
          </>
        ) : (
          <>
            <span className="block text-body-sm font-semibold">—</span>
            <span className="block text-caption text-muted-foreground">Sem cliques de saída no período</span>
          </>
        )}
      </span>
    </Link>
  );
}
