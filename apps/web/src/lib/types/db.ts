/**
 * Enums e tipos de linha espelhando o schema.sql (packages/config + types do PRD §8.6).
 * Fonte única de verdade no app para os ENUMs do Postgres.
 */

export const WORKSPACE_ROLES = ["owner", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const SUBSCRIPTION_STATUS = [
  "trial",
  "active",
  "past_due",
  "canceled",
  "free",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const TIPOS_ENTIDADE = ["pessoa", "grupo"] as const;
export type TipoEntidade = (typeof TIPOS_ENTIDADE)[number];

export const COMPORTAMENTOS_CATEGORIA = ["basico", "projeto", "compromisso"] as const;
export type ComportamentoCategoria = (typeof COMPORTAMENTOS_CATEGORIA)[number];

export const TIPOS_TRANSACAO = [
  "despesa",
  "receita",
  "transferencia",
  "investimento_aporte",
  "investimento_resgate",
] as const;
export type TipoTransacao = (typeof TIPOS_TRANSACAO)[number];

export const MEIOS_PAGAMENTO = [
  "cartao_credito",
  "cartao_debito",
  "pix",
  "dinheiro",
  "transferencia",
  "boleto",
  "vr",
  "va",
  "cartao_escola",
  "outro",
] as const;
export type MeioPagamento = (typeof MEIOS_PAGAMENTO)[number];

export const STATUS_CONCILIACAO = ["nao_conciliado", "conciliado", "pendente_revisao"] as const;
export type StatusConciliacao = (typeof STATUS_CONCILIACAO)[number];

export const ORIGENS_TRANSACAO = [
  "whatsapp",
  "fatura_cartao",
  "manual",
  "recorrente",
  "importacao",
  "app",
] as const;
export type OrigemTransacao = (typeof ORIGENS_TRANSACAO)[number];

export const TIPOS_CONTA_BANCARIA = [
  "corrente",
  "poupanca",
  "salario",
  "pagamento",
  "investimento",
] as const;
export type TipoContaBancaria = (typeof TIPOS_CONTA_BANCARIA)[number];

export const FREQUENCIAS_RECORRENCIA = [
  "diaria",
  "semanal",
  "quinzenal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
] as const;
export type FrequenciaRecorrencia = (typeof FREQUENCIAS_RECORRENCIA)[number];

export const STATUS_REVISAO = ["confirmado", "sugerido", "novo", "rejeitado"] as const;
export type StatusRevisao = (typeof STATUS_REVISAO)[number];

export const ESSENCIALIDADES = [
  "essencial",
  "necessario",
  "superfluo",
  "investimento",
] as const;
export type Essencialidade = (typeof ESSENCIALIDADES)[number];

/** Tipos sugeridos de contexto/evento. `tipo` é texto livre; isto é só o padrão da UI. */
export const TIPOS_CONTEXTO = [
  "passeio",
  "compra_mes",
  "trabalho",
  "viagem",
  "festa",
  "saude",
  "escola",
  "casa",
  "outro",
] as const;
export type TipoContexto = (typeof TIPOS_CONTEXTO)[number];

/* ------------------------------------------------------------------ */
/* Rótulos pt-BR para UI                                               */
/* ------------------------------------------------------------------ */

export const LABEL_TIPO_TRANSACAO: Record<TipoTransacao, string> = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
  investimento_aporte: "Aporte",
  investimento_resgate: "Resgate",
};

export const LABEL_MEIO_PAGAMENTO: Record<MeioPagamento, string> = {
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  pix: "Pix",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  boleto: "Boleto",
  vr: "Vale-refeição",
  va: "Vale-alimentação",
  cartao_escola: "Cartão escola",
  outro: "Outro",
};

export const LABEL_TIPO_ENTIDADE: Record<TipoEntidade, string> = {
  pessoa: "Pessoa",
  grupo: "Grupo",
};

export const LABEL_COMPORTAMENTO: Record<ComportamentoCategoria, string> = {
  basico: "Básica",
  projeto: "Projeto",
  compromisso: "Compromisso",
};

export const LABEL_ESSENCIALIDADE: Record<Essencialidade, string> = {
  essencial: "Essencial",
  necessario: "Necessário",
  superfluo: "Supérfluo",
  investimento: "Investimento",
};

export const LABEL_TIPO_CONTEXTO: Record<TipoContexto, string> = {
  passeio: "Passeio",
  compra_mes: "Compra do mês",
  trabalho: "Trabalho",
  viagem: "Viagem",
  festa: "Festa/aniversário",
  saude: "Saúde",
  escola: "Escola",
  casa: "Casa",
  outro: "Outro",
};

export const LABEL_TIPO_CONTA: Record<TipoContaBancaria, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  salario: "Conta salário",
  pagamento: "Conta pagamento",
  investimento: "Conta investimento",
};

export const LABEL_FREQUENCIA: Record<FrequenciaRecorrencia, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

/* ------------------------------------------------------------------ */
/* Linhas (subconjunto usado pela UI)                                 */
/* ------------------------------------------------------------------ */

export interface Profile {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  avatar_url: string | null;
  default_workspace_id: string | null;
  onboarding_concluido: boolean;
  aceitou_termos_em: string | null;
  aceitou_privacidade_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  slug: "free" | "pro";
  nome: string;
  descricao: string | null;
  preco_mensal_brl: number | null;
  preco_anual_brl: number | null;
  exibe_anuncios: boolean;
  limites: Record<string, number | null>;
  features: Record<string, boolean>;
  ativo: boolean;
  ordem: number;
}

export interface Anuncio {
  id: string;
  posicao: string;
  titulo: string;
  texto: string | null;
  imagem_url: string | null;
  url_destino: string | null;
  prioridade: number;
  inicio_em: string | null;
  fim_em: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  nome: string;
  slug: string;
  owner_id: string;
  moeda_principal: string;
  timezone: string;
  settings: Record<string, unknown>;
  plan_id: string;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  profile_id: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface Entidade {
  id: string;
  workspace_id: string;
  nome: string;
  tipo: TipoEntidade;
  profile_id: string | null;
  cor: string | null;
  icone: string | null;
  ativa: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  workspace_id: string;
  nome: string;
  slug: string;
  icone: string | null;
  cor: string | null;
  categoria_pai_id: string | null;
  comportamento: ComportamentoCategoria;
  essencialidade_padrao: Essencialidade | null;
  ordem: number;
  ativa: boolean;
  created_at: string;
}

/** Contexto/Evento — "por que esse gasto aconteceu?" (Passeio, Compra do mês). */
export interface Contexto {
  id: string;
  workspace_id: string;
  nome: string;
  tipo: string | null;
  data_referencia: string | null;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  arquivado: boolean;
  created_at: string;
  updated_at: string;
}

/** Linha de uma nota fiscal (itemização). Só usada em modo detalhado. */
export interface ItemTransacao {
  id: string;
  workspace_id: string;
  transacao_id: string;
  produto_id: string | null;
  descricao_original: string;
  quantidade: number;
  unidade: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  desconto: number;
  categoria_id: string | null;
  essencialidade: Essencialidade;
  tipo_item: string | null;
  contexto_id: string | null;
  status_revisao: StatusRevisao;
  score_confianca: number | null;
  ordem_na_nota: number | null;
  created_at: string;
}

export interface ContaBancaria {
  id: string;
  workspace_id: string;
  titular_id: string;
  banco: string;
  apelido: string;
  tipo: TipoContaBancaria;
  agencia: string | null;
  numero: string | null;
  eh_conta_compartilhada: boolean;
  ativa: boolean;
  created_at: string;
}

export interface Cartao {
  id: string;
  workspace_id: string;
  titular_id: string;
  banco: string;
  bandeira: string | null;
  apelido: string;
  ultimos_digitos: string | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  limite: number | null;
  conta_pagamento_id: string | null;
  ativo: boolean;
  created_at: string;
}

/** Conta fixa / lançamento recorrente — gera transações no vencimento. */
export interface Recorrencia {
  id: string;
  workspace_id: string;
  descricao: string;
  tipo: TipoTransacao;
  valor_previsto: number;
  categoria_id: string | null;
  meio_pagamento: MeioPagamento | null;
  cartao_id: string | null;
  conta_id: string | null;
  frequencia: FrequenciaRecorrencia;
  dia_vencimento: number | null;
  data_inicio: string;
  data_fim: string | null;
  proxima_geracao: string | null;
  ultima_geracao: string | null;
  ativa: boolean;
  created_at: string;
}

export interface Transacao {
  id: string;
  workspace_id: string;
  tipo: TipoTransacao;
  descricao: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  categoria_id: string | null;
  pagador_id: string | null;
  beneficiario_id: string | null;
  meio_pagamento: MeioPagamento | null;
  cartao_id: string | null;
  conta_id: string | null;
  estabelecimento_id: string | null;
  colecao_id: string | null;
  contexto_id: string | null;
  status_conciliacao: StatusConciliacao;
  status_revisao: StatusRevisao;
  score_confianca: number | null;
  origem: OrigemTransacao;
  observacoes: string | null;
  tags: string[];
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Transação com joins frequentes para listagem. */
export interface TransacaoComRelacoes extends Transacao {
  categoria: Pick<Categoria, "id" | "nome" | "icone" | "cor"> | null;
  estabelecimento: { id: string; nome: string } | null;
  pagador: Pick<Entidade, "id" | "nome"> | null;
}
