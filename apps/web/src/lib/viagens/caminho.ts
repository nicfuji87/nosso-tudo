import type {
  AlvoEmissao,
  ProgramaViagem,
  SaldoPrograma,
  TransferenciaViagem,
} from "@/lib/viagens/tipos";

/**
 * Motor de caminho de milhas — o coração do Nossa Viagem.
 *
 * Dado o que a família tem e quanto a emissão custa, responde: qual sequência
 * de transferências chega lá gastando menos, e o que dá errado no caminho.
 *
 * POR QUE ISTO É CÓDIGO E NÃO PROMPT (PLANO-VIAGENS.md §4.1): transferir
 * milhas é IRREVERSÍVEL. Um ratio alucinado pela LLM faz o usuário mover
 * pontos sem volta. Aqui a conta é determinística e testada; a Nia só explica
 * o resultado que este módulo produziu.
 *
 * Módulo PURO: sem I/O, sem Supabase, sem relógio global (`hoje` é injetado).
 * Isso é o que o torna testável — ver caminho.test.ts.
 */

// Ninguém no mundo real faz 4 transferências encadeadas para uma emissão.
// Além do custo, cada salto é irreversível: o limite é proteção, não performance.
const MAX_SALTOS_PADRAO = 3;

// Acima disso, a curadoria está velha o bastante para merecer aviso na tela.
const DIAS_ATE_DADO_VELHO = 90;

// Bônus que vence antes disso é risco real: o usuário planeja hoje e transfere
// depois do prazo, e a conta que ele viu deixa de valer.
const DIAS_BONUS_VENCENDO = 7;

export type TipoAviso =
  | "nao_verificado"
  | "dado_velho"
  | "bonus_expirado"
  | "bonus_vencendo"
  | "muitos_saltos"
  | "sem_valor_referencia";

export interface AvisoCaminho {
  tipo: TipoAviso;
  mensagem: string;
  /** Aresta que originou o aviso, quando aplicável. */
  transferenciaId?: string;
}

export interface PassoCaminho {
  transferenciaId: string;
  origemId: string;
  origemNome: string;
  destinoId: string;
  destinoNome: string;
  /** Quanto sai da origem neste salto (já arredondado ao múltiplo). */
  milhasEntrada: number;
  /** Quanto chega no destino. */
  milhasSaida: number;
  ratioOrigem: number;
  ratioDestino: number;
  /** Bônus efetivamente aplicado (0 se expirado). */
  bonusAplicado: number;
  prazoDiasMin: number;
  prazoDiasMax: number;
}

export interface CaminhoMilhas {
  origemId: string;
  origemNome: string;
  passos: PassoCaminho[];
  saltos: number;
  /** Milhas gastas NA ORIGEM. */
  milhasConsumidas: number;
  /** Milhas que chegam no programa alvo. */
  milhasEntregues: number;
  /** Excedente entregue além do alvo (perda por arredondamento de múltiplo). */
  sobra: number;
  saldoOrigem: number;
  /** Este caminho, sozinho, cobre a emissão inteira? */
  cobreSozinho: boolean;
  prazoDiasMin: number;
  prazoDiasMax: number;
  /** Custo estimado em centavos de BRL. null se a origem não tem valor de referência. */
  custoEstimadoCents: number | null;
  avisos: AvisoCaminho[];
}

export interface ParcelaCombinacao {
  caminho: CaminhoMilhas;
  /** Quanto este caminho contribui para o alvo. */
  contribuicao: number;
}

export interface CombinacaoCaminhos {
  parcelas: ParcelaCombinacao[];
  milhasEntregues: number;
  custoEstimadoCents: number | null;
  prazoDiasMax: number;
  cobreAlvo: boolean;
}

export interface ResultadoCaminhos {
  alvo: AlvoEmissao;
  alvoNome: string;
  /** Saldo que a família já tem no próprio programa alvo. */
  saldoNoAlvo: number;
  /** Caminhos viáveis, ordenados: melhor primeiro. */
  caminhos: CaminhoMilhas[];
  /**
   * Preenchido só quando NENHUM caminho cobre sozinho. É a resposta honesta
   * para "tenho milhas espalhadas": junta várias origens até fechar o alvo.
   */
  combinacao: CombinacaoCaminhos | null;
  /** Dá para emitir de algum jeito? */
  viavel: boolean;
  /** Motivo, quando não é viável. */
  motivo: string | null;
}

export interface EntradaCalculo {
  programas: ProgramaViagem[];
  transferencias: TransferenciaViagem[];
  saldos: SaldoPrograma[];
  alvo: AlvoEmissao;
  /** ISO date (YYYY-MM-DD). Injetado para o teste não depender do relógio. */
  hoje: string;
  maxSaltos?: number;
}

// ---------------------------------------------------------------------------
// Simulação de um salto
// ---------------------------------------------------------------------------

/** O bônus só vale se não expirou. Sem data de validade = permanente. */
function bonusVigente(t: TransferenciaViagem, hoje: string): number {
  if (t.bonusPercent <= 0) return 0;
  if (t.bonusValidoAte && t.bonusValidoAte < hoje) return 0;
  return t.bonusPercent;
}

/**
 * Aplica um salto. Devolve null se o valor não atinge o mínimo da aresta.
 *
 * O arredondamento importa: com múltiplo de 1.000, quem tem 15.500 transfere
 * 15.000 e deixa 500 parados. Ignorar isso faz o motor prometer milhas que
 * não vão chegar.
 */
function aplicarSalto(
  t: TransferenciaViagem,
  disponivel: number,
  hoje: string,
): { entrada: number; saida: number; bonus: number } | null {
  const entrada = Math.floor(disponivel / t.multiplo) * t.multiplo;
  if (entrada <= 0 || entrada < t.minimoTransferencia) return null;

  const bonus = bonusVigente(t, hoje);
  const saida = Math.floor((entrada * t.ratioDestino * (100 + bonus)) / (t.ratioOrigem * 100));
  if (saida <= 0) return null;

  return { entrada, saida, bonus };
}

/** Quanto chega no fim do caminho ao partir de `origem` milhas. 0 = inviável. */
function simular(rota: TransferenciaViagem[], origem: number, hoje: string): number {
  let atual = origem;
  for (const t of rota) {
    const salto = aplicarSalto(t, atual, hoje);
    if (!salto) return 0;
    atual = salto.saida;
  }
  return atual;
}

/**
 * Menor quantia na origem que entrega >= `necessario` no destino.
 *
 * `simular` é monotônica não-decrescente em `origem` (mais milhas nunca
 * entregam menos), então busca binária resolve — e resolve exatamente,
 * respeitando os degraus de múltiplo/mínimo que uma divisão simples erraria.
 */
function menorOrigemPara(
  rota: TransferenciaViagem[],
  necessario: number,
  teto: number,
  hoje: string,
): number | null {
  if (simular(rota, teto, hoje) < necessario) return null;

  let lo = 0;
  let hi = teto;
  while (lo < hi) {
    const meio = Math.floor((lo + hi) / 2);
    if (simular(rota, meio, hoje) >= necessario) hi = meio;
    else lo = meio + 1;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Enumeração de rotas
// ---------------------------------------------------------------------------

/**
 * Todas as rotas simples (sem repetir programa) de `origem` até `destino`,
 * com no máximo `maxSaltos` arestas.
 *
 * DFS exaustiva em vez de Dijkstra de propósito: o grafo é minúsculo (dezenas
 * de nós) e os bônus tornam arestas "ganhadoras" (fator > 1), o que quebra a
 * premissa de peso não-negativo do Dijkstra. Enumerar tudo é simples, correto,
 * e ainda deixa ranquear por várias dimensões em vez de um escalar só.
 */
function enumerarRotas(
  origemId: string,
  destinoId: string,
  porOrigem: Map<string, TransferenciaViagem[]>,
  maxSaltos: number,
): TransferenciaViagem[][] {
  const rotas: TransferenciaViagem[][] = [];
  const visitados = new Set<string>([origemId]);
  const atual: TransferenciaViagem[] = [];

  function dfs(noAtual: string) {
    if (atual.length >= maxSaltos) return;
    for (const t of porOrigem.get(noAtual) ?? []) {
      if (visitados.has(t.destinoId)) continue;
      atual.push(t);
      if (t.destinoId === destinoId) {
        rotas.push([...atual]);
      } else {
        visitados.add(t.destinoId);
        dfs(t.destinoId);
        visitados.delete(t.destinoId);
      }
      atual.pop();
    }
  }

  dfs(origemId);
  return rotas;
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function avisosDaRota(
  rota: TransferenciaViagem[],
  nomes: Map<string, string>,
  hoje: string,
): AvisoCaminho[] {
  const avisos: AvisoCaminho[] = [];

  for (const t of rota) {
    const trecho = `${nomes.get(t.origemId) ?? "?"} → ${nomes.get(t.destinoId) ?? "?"}`;

    if (!t.verificadoEm) {
      avisos.push({
        tipo: "nao_verificado",
        transferenciaId: t.id,
        mensagem: `A transferência ${trecho} nunca foi verificada. Confirme o ratio no site do programa antes de transferir.`,
      });
    } else {
      const idade = diasEntre(t.verificadoEm, hoje);
      if (idade > DIAS_ATE_DADO_VELHO) {
        avisos.push({
          tipo: "dado_velho",
          transferenciaId: t.id,
          mensagem: `O ratio de ${trecho} foi conferido há ${idade} dias. Ratios mudam — vale reconferir.`,
        });
      }
    }

    if (t.bonusPercent > 0 && t.bonusValidoAte) {
      if (t.bonusValidoAte < hoje) {
        avisos.push({
          tipo: "bonus_expirado",
          transferenciaId: t.id,
          mensagem: `O bônus de ${t.bonusPercent}% em ${trecho} expirou em ${t.bonusValidoAte} e não entrou nesta conta.`,
        });
      } else {
        const restam = diasEntre(hoje, t.bonusValidoAte);
        if (restam <= DIAS_BONUS_VENCENDO) {
          avisos.push({
            tipo: "bonus_vencendo",
            transferenciaId: t.id,
            mensagem: `Esta conta depende do bônus de ${t.bonusPercent}% em ${trecho}, que vence em ${restam} dia(s). Depois disso o caminho fica mais caro.`,
          });
        }
      }
    }
  }

  if (rota.length >= 3) {
    avisos.push({
      tipo: "muitos_saltos",
      mensagem: `São ${rota.length} transferências encadeadas, e cada uma é irreversível. Confira cada etapa antes de começar.`,
    });
  }

  return avisos;
}

// ---------------------------------------------------------------------------
// Montagem de um caminho
// ---------------------------------------------------------------------------

function montarCaminho(
  rota: TransferenciaViagem[],
  origem: ProgramaViagem,
  saldoOrigem: number,
  necessario: number,
  nomes: Map<string, string>,
  hoje: string,
): CaminhoMilhas | null {
  // Quanto realmente precisa sair da origem para entregar o alvo. Se nem o
  // saldo inteiro dá conta, o caminho ainda serve para a combinação — por isso
  // caímos para "usa tudo que tem" em vez de descartar.
  const exato = menorOrigemPara(rota, necessario, saldoOrigem, hoje);
  const cobreSozinho = exato !== null;
  const consumido = exato ?? Math.floor(saldoOrigem / (rota[0]?.multiplo ?? 1)) * (rota[0]?.multiplo ?? 1);

  const entregue = simular(rota, consumido, hoje);
  if (entregue <= 0) return null;

  // Reconstrói os passos com os números reais para a UI mostrar o caminho.
  const passos: PassoCaminho[] = [];
  let atual = consumido;
  for (const t of rota) {
    const salto = aplicarSalto(t, atual, hoje);
    if (!salto) return null;
    passos.push({
      transferenciaId: t.id,
      origemId: t.origemId,
      origemNome: nomes.get(t.origemId) ?? "?",
      destinoId: t.destinoId,
      destinoNome: nomes.get(t.destinoId) ?? "?",
      milhasEntrada: salto.entrada,
      milhasSaida: salto.saida,
      ratioOrigem: t.ratioOrigem,
      ratioDestino: t.ratioDestino,
      bonusAplicado: salto.bonus,
      prazoDiasMin: t.prazoDiasMin,
      prazoDiasMax: t.prazoDiasMax,
    });
    atual = salto.saida;
  }

  const avisos = avisosDaRota(rota, nomes, hoje);
  const custoEstimadoCents =
    origem.valorPorMilCents != null
      ? Math.round((consumido / 1000) * origem.valorPorMilCents)
      : null;
  if (custoEstimadoCents === null && rota.length > 0) {
    avisos.push({
      tipo: "sem_valor_referencia",
      mensagem: `${origem.nome} não tem valor de referência cadastrado, então este caminho não entra na comparação por custo em reais.`,
    });
  }

  return {
    origemId: origem.id,
    origemNome: origem.nome,
    passos,
    saltos: rota.length,
    milhasConsumidas: consumido,
    milhasEntregues: entregue,
    sobra: Math.max(0, entregue - necessario),
    saldoOrigem,
    cobreSozinho,
    prazoDiasMin: rota.reduce((s, t) => s + t.prazoDiasMin, 0),
    prazoDiasMax: rota.reduce((s, t) => s + t.prazoDiasMax, 0),
    custoEstimadoCents,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Ordena do melhor para o pior. Não é um escalar só: custo em reais é o
 * critério quando existe dos dois lados, mas saltos (risco irreversível) e
 * prazo desempatam — um caminho 2% mais barato com um salto a mais raramente
 * compensa.
 */
function compararCaminhos(a: CaminhoMilhas, b: CaminhoMilhas): number {
  if (a.cobreSozinho !== b.cobreSozinho) return a.cobreSozinho ? -1 : 1;

  if (a.custoEstimadoCents != null && b.custoEstimadoCents != null) {
    const diff = a.custoEstimadoCents - b.custoEstimadoCents;
    // Diferença menor que 5% é empate técnico — aí quem decide é o risco.
    const base = Math.max(a.custoEstimadoCents, b.custoEstimadoCents, 1);
    if (Math.abs(diff) / base > 0.05) return diff;
  } else if (a.custoEstimadoCents != null || b.custoEstimadoCents != null) {
    // Com valor de referência conhecido vem antes: é comparável, o outro não.
    return a.custoEstimadoCents != null ? -1 : 1;
  }

  if (a.saltos !== b.saltos) return a.saltos - b.saltos;
  if (a.prazoDiasMax !== b.prazoDiasMax) return a.prazoDiasMax - b.prazoDiasMax;
  return a.milhasConsumidas - b.milhasConsumidas;
}

/** Custo por milha entregue — a métrica certa para escolher o que combinar. */
function eficiencia(c: CaminhoMilhas): number {
  if (c.milhasEntregues <= 0) return Number.POSITIVE_INFINITY;
  if (c.custoEstimadoCents == null) return Number.POSITIVE_INFINITY;
  return c.custoEstimadoCents / c.milhasEntregues;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function calcularCaminhos(entrada: EntradaCalculo): ResultadoCaminhos {
  const { alvo, hoje } = entrada;
  const maxSaltos = entrada.maxSaltos ?? MAX_SALTOS_PADRAO;

  const programas = entrada.programas.filter((p) => p.ativo);
  const porId = new Map(programas.map((p) => [p.id, p]));
  const nomes = new Map(programas.map((p) => [p.id, p.nome]));
  const alvoPrograma = porId.get(alvo.programaId);

  const vazio = (motivo: string): ResultadoCaminhos => ({
    alvo,
    alvoNome: alvoPrograma?.nome ?? "?",
    saldoNoAlvo: 0,
    caminhos: [],
    combinacao: null,
    viavel: false,
    motivo,
  });

  if (!alvoPrograma) return vazio("O programa da emissão não está cadastrado ou está inativo.");
  if (alvo.milhas <= 0) return vazio("A emissão precisa de um custo em milhas maior que zero.");

  // Só arestas ativas entre programas ativos.
  const porOrigem = new Map<string, TransferenciaViagem[]>();
  for (const t of entrada.transferencias) {
    if (!t.ativa || !porId.has(t.origemId) || !porId.has(t.destinoId)) continue;
    porOrigem.set(t.origemId, [...(porOrigem.get(t.origemId) ?? []), t]);
  }

  const saldos = entrada.saldos.filter((s) => s.saldo > 0 && porId.has(s.programaId));
  const saldoNoAlvo = saldos.find((s) => s.programaId === alvo.programaId)?.saldo ?? 0;

  const caminhos: CaminhoMilhas[] = [];

  // Caso 0 saltos: já tem milhas no próprio programa alvo. É sempre o melhor
  // caminho quando cobre — nada a transferir, nada a arriscar.
  if (saldoNoAlvo > 0) {
    const usado = Math.min(saldoNoAlvo, alvo.milhas);
    caminhos.push({
      origemId: alvoPrograma.id,
      origemNome: alvoPrograma.nome,
      passos: [],
      saltos: 0,
      milhasConsumidas: usado,
      milhasEntregues: usado,
      sobra: 0,
      saldoOrigem: saldoNoAlvo,
      cobreSozinho: saldoNoAlvo >= alvo.milhas,
      prazoDiasMin: 0,
      prazoDiasMax: 0,
      custoEstimadoCents:
        alvoPrograma.valorPorMilCents != null
          ? Math.round((usado / 1000) * alvoPrograma.valorPorMilCents)
          : null,
      avisos: [],
    });
  }

  // Demais origens: melhor rota de cada uma.
  for (const s of saldos) {
    if (s.programaId === alvo.programaId) continue;
    const origem = porId.get(s.programaId);
    if (!origem) continue;

    const rotas = enumerarRotas(s.programaId, alvo.programaId, porOrigem, maxSaltos);
    const daOrigem: CaminhoMilhas[] = [];
    for (const rota of rotas) {
      const c = montarCaminho(rota, origem, s.saldo, alvo.milhas, nomes, hoje);
      if (c) daOrigem.push(c);
    }
    daOrigem.sort(compararCaminhos);
    const melhor = daOrigem[0];
    if (melhor) caminhos.push(melhor);
  }

  caminhos.sort(compararCaminhos);

  if (caminhos.length === 0) {
    return vazio(
      "Não há caminho de transferência entre os programas onde a família tem saldo e o programa da emissão.",
    );
  }

  const cobreSozinho = caminhos.some((c) => c.cobreSozinho);
  const combinacao = cobreSozinho ? null : combinar(caminhos, alvo.milhas);

  return {
    alvo,
    alvoNome: alvoPrograma.nome,
    saldoNoAlvo,
    caminhos,
    combinacao,
    viavel: cobreSozinho || (combinacao?.cobreAlvo ?? false),
    motivo:
      cobreSozinho || combinacao?.cobreAlvo
        ? null
        : "Mesmo somando todos os programas, o saldo não cobre esta emissão.",
  };
}

/**
 * Junta várias origens até fechar o alvo, da mais eficiente para a menos.
 *
 * Guloso, não ótimo — e isso é deliberado: o ótimo exigiria resolver um
 * problema de fluxo, e com meia dúzia de origens a diferença não paga a
 * complexidade nem a dificuldade de explicar o resultado para o usuário.
 */
function combinar(caminhos: CaminhoMilhas[], necessario: number): CombinacaoCaminhos {
  // Uma origem só pode ser usada uma vez, mesmo aparecendo em várias rotas.
  const melhorPorOrigem = new Map<string, CaminhoMilhas>();
  for (const c of caminhos) {
    const atual = melhorPorOrigem.get(c.origemId);
    if (!atual || eficiencia(c) < eficiencia(atual)) melhorPorOrigem.set(c.origemId, c);
  }

  const ordenados = [...melhorPorOrigem.values()].sort((a, b) => {
    const ea = eficiencia(a);
    const eb = eficiencia(b);
    if (ea !== eb) return ea - eb;
    return b.milhasEntregues - a.milhasEntregues;
  });

  const parcelas: ParcelaCombinacao[] = [];
  let acumulado = 0;
  let custo = 0;
  let custoConhecido = true;
  let prazo = 0;

  for (const c of ordenados) {
    if (acumulado >= necessario) break;
    const contribuicao = Math.min(c.milhasEntregues, necessario - acumulado);
    if (contribuicao <= 0) continue;
    parcelas.push({ caminho: c, contribuicao });
    acumulado += contribuicao;
    if (c.custoEstimadoCents == null) custoConhecido = false;
    else custo += c.custoEstimadoCents;
    prazo = Math.max(prazo, c.prazoDiasMax);
  }

  return {
    parcelas,
    milhasEntregues: acumulado,
    custoEstimadoCents: custoConhecido ? custo : null,
    prazoDiasMax: prazo,
    cobreAlvo: acumulado >= necessario,
  };
}
