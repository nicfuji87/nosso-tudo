import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtBrl, fmtDecimal, fmtNum, fmtPct, type Resumo } from "./formato";

function Kpi({ label, valor, dica, ajuda, destaque }: { label: string; valor: string; dica?: string; ajuda?: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-4 shadow-card", destaque && "border-tech/40 bg-tech/5")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-overline uppercase tracking-wide text-muted-foreground">{label}</p>
        {ajuda && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="-m-1 rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label={`Sobre ${label}`}>
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{ajuda}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className={cn("tabular mt-1.5 text-h3 font-semibold tracking-tight", destaque && "text-tech")}>{valor}</p>
      {dica && <p className="mt-0.5 text-caption text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function Kpis({ r }: { r: Resumo }) {
  const semComissao = r.comissao <= 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      <Kpi
        label="Pins publicados"
        valor={fmtNum(r.pins_publicados)}
        dica={`${fmtNum(r.pins_com_metricas)} com métricas no período`}
        ajuda="Pins publicados dentro do período (com os filtros aplicados)."
      />
      <Kpi label="Impressões" valor={fmtNum(r.impressions)} />
      <Kpi label="Saves" valor={fmtNum(r.saves)} />
      <Kpi label="Pin clicks" valor={fmtNum(r.pin_clicks)} ajuda="Cliques que abrem o Pin dentro do Pinterest." />
      <Kpi
        label="Outbound clicks"
        valor={fmtNum(r.outbound_clicks)}
        destaque
        ajuda="Cliques que saem do Pinterest para o link de afiliado — é o que pode virar comissão."
      />
      <Kpi label="CTR de outbound" valor={fmtPct(r.ctr_outbound)} ajuda="Outbound clicks ÷ impressões." destaque />
      <Kpi
        label="Outbound por mil impressões"
        valor={fmtDecimal(r.outbound_por_mil)}
        dica="cliques a cada 1.000 impressões"
        ajuda="Outbound clicks × 1.000 ÷ impressões — compara criativos com alcance diferente."
      />
      <Kpi
        label="Comissão"
        valor={fmtBrl(r.comissao)}
        dica={r.pedidos || r.gmv ? `${fmtNum(r.pedidos)} pedido(s) · ${fmtBrl(r.gmv)} vendidos` : "Importe comissões abaixo"}
        ajuda="Comissões lançadas/importadas cujo período cruza o selecionado (o ML não tem API de relatórios de afiliado)."
      />
      <Kpi
        label="Receita por Pin"
        valor={r.receita_por_pin == null ? "—" : fmtBrl(r.receita_por_pin)}
        ajuda="Comissão do período ÷ Pins publicados que atendem aos filtros (todo o histórico)."
      />
      <Kpi
        label="Famílias"
        valor={fmtNum(r.familias)}
        dica="com Pins publicados nos filtros"
        ajuda="Famílias de criativos distintas entre os Pins publicados que atendem aos filtros (todo o histórico)."
      />
      <Kpi
        label="Receita por família"
        valor={r.receita_por_familia == null ? "—" : fmtBrl(r.receita_por_familia)}
        ajuda={
          r.familias === 0
            ? "Comissão do período ÷ famílias. Ainda não há Pins de famílias de criativos nos filtros."
            : "Comissão do período ÷ famílias com Pins publicados que atendem aos filtros."
        }
      />
      <Kpi
        label="EPC"
        valor={r.epc == null ? "—" : fmtBrl(r.epc)}
        dica="por outbound click"
        ajuda={
          r.epc == null
            ? semComissao
              ? "Ganho por clique (comissão ÷ outbound clicks). Precisa de comissões importadas no período."
              : "Ganho por clique (comissão ÷ outbound clicks). Precisa de outbound clicks no período."
            : "Ganho por clique: comissão ÷ outbound clicks."
        }
      />
    </div>
  );
}
