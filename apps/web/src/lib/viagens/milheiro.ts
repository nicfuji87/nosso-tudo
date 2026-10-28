/**
 * Quanto custa o milheiro de cada programa PARA ESTA FAMÍLIA — PURO, testado
 * em milheiro.test.ts.
 *
 * Ordem de preferência:
 *   1. custo real dos lotes na carteira (o que a família pagou);
 *   2. derivado por transferência a partir de um programa que a família tem
 *      (ex.: Avios via Esfera 2:1 → o milheiro de Avios custa 2× o de Esfera);
 *   3. valor de referência do programa no grafo;
 *   4. padrão (estimado) — a UI marca como estimativa.
 *
 * Também diz quais programas buscáveis no seats.aero a família ALCANÇA
 * (saldo direto ou até 2 transferências) — é o filtro padrão do radar.
 */
import type { FonteCusto, PrecoMilheiro } from "./radar-calc";
import type { ProgramaViagem, TransferenciaViagem } from "./tipos";

/** Fontes aceitas pela Partner API do seats.aero (docs, 28/10/2026). */
export const FONTES_SEATS: Record<string, string> = {
  smiles: "Smiles",
  azul: "Azul Fidelidade",
  qatar: "Qatar (Avios)",
  flyingblue: "Flying Blue",
  turkish: "Turkish Miles&Smiles",
  american: "American AAdvantage",
  united: "United MileagePlus",
  delta: "Delta SkyMiles",
  aeroplan: "Aeroplan",
  alaska: "Alaska",
  virginatlantic: "Virgin Atlantic",
  emirates: "Emirates",
  etihad: "Etihad",
  lufthansa: "Lufthansa Miles&More",
  connectmiles: "Copa ConnectMiles",
  aeromexico: "Aeroméxico",
  eurobonus: "SAS EuroBonus",
  finnair: "Finnair Plus",
  singapore: "Singapore KrisFlyer",
  qantas: "Qantas",
  velocity: "Velocity",
  ethiopian: "Ethiopian",
  saudia: "Saudia",
  jetblue: "JetBlue",
};

/** Usado quando a carteira está vazia e o usuário ainda não escolheu. */
export const PROGRAMAS_PADRAO = ["smiles", "azul", "qatar", "flyingblue"];
export const MILHEIRO_PADRAO_CENTS = 2500;

export function nomeFonte(fonte: string): string {
  return FONTES_SEATS[fonte] ?? fonte;
}

export interface EntradaMilheiro {
  programas: ProgramaViagem[];
  transferencias: TransferenciaViagem[];
  /** Saldo por programa (id). */
  saldos: Map<string, number>;
  /** Custo real por mil (centavos) por programa (id), dos lotes. */
  custoCarteira: Map<string, number>;
  hoje: string;
}

function fator(t: TransferenciaViagem, hoje: string): number {
  const bonusValido = t.bonusPercent > 0 && (!t.bonusValidoAte || t.bonusValidoAte >= hoje);
  return (t.ratioDestino / t.ratioOrigem) * (bonusValido ? 1 + t.bonusPercent / 100 : 1);
}

export function calcularMilheiro(e: EntradaMilheiro): { precos: PrecoMilheiro; alcancaveis: string[] } {
  const porId = new Map(e.programas.map((p) => [p.id, p]));
  const arestas = e.transferencias.filter((t) => t.ativa);
  const temSaldo = (id: string) => (e.saldos.get(id) ?? 0) > 0;

  /** Custo "próprio" de um programa: carteira > referência. */
  const custoProprio = (id: string): { cents: number; fonte: FonteCusto } | null => {
    const c = e.custoCarteira.get(id);
    if (c && temSaldo(id)) return { cents: c, fonte: "carteira" };
    const v = porId.get(id)?.valorPorMilCents;
    return v ? { cents: v, fonte: "programa" } : null;
  };

  const porPrograma: PrecoMilheiro["porPrograma"] = {};
  const alcancaveis = new Set<string>();

  for (const p of e.programas) {
    if (!p.fonteSeatsAero || !p.ativo) continue;
    const fonte = p.fonteSeatsAero;

    // Caminhos de até 2 saltos que chegam em p: [origem] ou [origem → meio].
    const candidatos: { cents: number; fonte: FonteCusto; daFamilia: boolean }[] = [];
    for (const t1 of arestas.filter((t) => t.destinoId === p.id)) {
      const f1 = fator(t1, e.hoje);
      const c1 = custoProprio(t1.origemId);
      if (c1) candidatos.push({ cents: c1.cents / f1, fonte: c1.fonte, daFamilia: temSaldo(t1.origemId) });
      for (const t2 of arestas.filter((t) => t.destinoId === t1.origemId && t.origemId !== p.id)) {
        const c2 = custoProprio(t2.origemId);
        if (c2) candidatos.push({ cents: c2.cents / (fator(t2, e.hoje) * f1), fonte: c2.fonte, daFamilia: temSaldo(t2.origemId) });
      }
    }

    if (temSaldo(p.id) || candidatos.some((c) => c.daFamilia)) alcancaveis.add(fonte);

    const proprio = e.custoCarteira.get(p.id);
    if (proprio && temSaldo(p.id)) {
      porPrograma[fonte] = { cents: proprio, fonte: "carteira" };
      continue;
    }
    // Entre os caminhos, prefere os que partem de saldo que a família tem.
    const daFamilia = candidatos.filter((c) => c.daFamilia);
    const pool = daFamilia.length ? daFamilia : candidatos;
    const melhor = pool.sort((a, b) => a.cents - b.cents)[0];
    const ref = p.valorPorMilCents;
    if (melhor && (!ref || daFamilia.length)) {
      porPrograma[fonte] = { cents: Math.round(melhor.cents), fonte: melhor.fonte === "carteira" ? "carteira" : "programa" };
    } else if (ref) {
      porPrograma[fonte] = { cents: ref, fonte: "programa" };
    } else if (melhor) {
      porPrograma[fonte] = { cents: Math.round(melhor.cents), fonte: "programa" };
    }
  }

  return {
    precos: { porPrograma, padraoCents: MILHEIRO_PADRAO_CENTS },
    alcancaveis: [...alcancaveis].filter((f) => f in FONTES_SEATS),
  };
}
