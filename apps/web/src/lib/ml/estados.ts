/**
 * Máquinas de estado do ML (produto, criativo, Pin). Fonte única das
 * transições permitidas — toda mudança de status passa por `assertTransicao`
 * no servidor (spec §28: "toda transição de status deve ser validada").
 */

export const PRODUCT_STATUSES = [
  "discovered",
  "enriching",
  "analyzed",
  "approved",
  "waiting_affiliate_link",
  "ready_for_creative",
  "creative_draft",
  "ready_to_schedule",
  "scheduled",
  "published",
  "paused",
  "rejected",
  "error",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const CREATIVE_STATUSES = [
  "to_generate",
  "generating",
  "waiting_manual_image",
  "review",
  "approved",
  "rejected",
  "published",
  "archived",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export const PIN_STATUSES = [
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "blocked",
  "canceled",
  "paused",
] as const;
export type PinStatus = (typeof PIN_STATUSES)[number];

/** Etapa "pós-aprovação": o status passa a ser derivado de link/criativos/Pins. */
const POS_APROVACAO: ProductStatus[] = [
  "approved",
  "waiting_affiliate_link",
  "ready_for_creative",
  "creative_draft",
  "ready_to_schedule",
  "scheduled",
  "published",
];

const PRODUCT_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  discovered: ["enriching", "analyzed", "rejected", "error", "paused"],
  enriching: ["analyzed", "discovered", "rejected", "error"],
  analyzed: ["approved", "rejected", "enriching", "discovered", "paused", "error", ...POS_APROVACAO],
  approved: POS_APROVACAO.filter((s) => s !== "approved").concat(["rejected", "paused"]),
  waiting_affiliate_link: ["ready_for_creative", "creative_draft", "ready_to_schedule", "rejected", "paused"],
  ready_for_creative: ["creative_draft", "waiting_affiliate_link", "ready_to_schedule", "rejected", "paused"],
  creative_draft: ["ready_to_schedule", "ready_for_creative", "waiting_affiliate_link", "scheduled", "published", "rejected", "paused"],
  ready_to_schedule: ["scheduled", "published", "creative_draft", "ready_for_creative", "waiting_affiliate_link", "rejected", "paused"],
  scheduled: ["published", "ready_to_schedule", "creative_draft", "waiting_affiliate_link", "paused", "error"],
  published: ["scheduled", "ready_to_schedule", "creative_draft", "ready_for_creative", "waiting_affiliate_link", "paused", "rejected"],
  // Despausar volta ao status anterior (paused_from) — validado à parte.
  paused: [...POS_APROVACAO, "discovered", "analyzed", "rejected"],
  rejected: ["analyzed", "discovered"],
  error: ["discovered", "enriching", "analyzed", "rejected"],
};

const CREATIVE_TRANSITIONS: Record<CreativeStatus, CreativeStatus[]> = {
  to_generate: ["generating", "waiting_manual_image", "review", "rejected", "archived"],
  generating: ["review", "waiting_manual_image", "to_generate", "rejected"],
  waiting_manual_image: ["review", "generating", "to_generate", "rejected", "archived"],
  review: ["approved", "rejected", "generating", "waiting_manual_image", "to_generate", "archived"],
  approved: ["published", "review", "rejected", "generating", "waiting_manual_image", "archived"],
  rejected: ["review", "to_generate", "generating", "waiting_manual_image", "archived"],
  published: ["published", "archived"],
  archived: ["review"],
};

const PIN_TRANSITIONS: Record<PinStatus, PinStatus[]> = {
  draft: ["pending_approval", "scheduled", "publishing", "canceled"],
  pending_approval: ["scheduled", "draft", "publishing", "canceled"],
  scheduled: ["publishing", "paused", "canceled", "blocked", "draft", "scheduled"],
  publishing: ["published", "failed", "blocked", "scheduled"],
  published: [],
  failed: ["scheduled", "publishing", "canceled", "draft"],
  blocked: ["scheduled", "draft", "canceled", "publishing"],
  canceled: ["draft"],
  paused: ["scheduled", "canceled", "draft"],
};

export type Entidade = "product" | "creative" | "pin";

const TABELAS = {
  product: PRODUCT_TRANSITIONS,
  creative: CREATIVE_TRANSITIONS,
  pin: PIN_TRANSITIONS,
} as const;

export function podeTransicionar(entidade: Entidade, de: string, para: string): boolean {
  if (de === para) return true;
  const mapa = TABELAS[entidade] as Record<string, readonly string[]>;
  return mapa[de]?.includes(para) ?? false;
}

export class TransicaoInvalidaError extends Error {
  constructor(entidade: Entidade, de: string, para: string) {
    super(`Transição inválida de ${entidade}: ${de} → ${para}`);
    this.name = "TransicaoInvalidaError";
  }
}

export function assertTransicao(entidade: Entidade, de: string, para: string): void {
  if (!podeTransicionar(entidade, de, para)) throw new TransicaoInvalidaError(entidade, de, para);
}

export function isPosAprovacao(status: ProductStatus): boolean {
  return POS_APROVACAO.includes(status);
}

/**
 * Status pós-aprovação derivado do que existe para o produto. Ordem de
 * precedência pensada para mostrar a PRÓXIMA ação necessária:
 * sem link → agendado → pronto p/ agendar → criativo em andamento → publicado → pronto p/ criativo.
 */
export interface SinaisDerivacao {
  exigeLink: boolean;
  temLinkAtivo: boolean;
  pinsAgendados: number;
  pinsPublicados: number;
  criativosAprovadosSemPin: number;
  criativosEmAndamento: number; // to_generate | generating | waiting_manual_image | review
}

export function derivarStatusProduto(s: SinaisDerivacao): ProductStatus {
  if (s.exigeLink && !s.temLinkAtivo) return "waiting_affiliate_link";
  if (s.pinsAgendados > 0) return "scheduled";
  if (s.criativosAprovadosSemPin > 0) return "ready_to_schedule";
  if (s.criativosEmAndamento > 0) return "creative_draft";
  if (s.pinsPublicados > 0) return "published";
  return "ready_for_creative";
}

/** Rótulos e tom visual (texto + ícone, nunca só cor — spec §25). */
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  discovered: "Descoberto",
  enriching: "Enriquecendo",
  analyzed: "Analisado",
  approved: "Aprovado",
  waiting_affiliate_link: "Aguardando link",
  ready_for_creative: "Pronto p/ criativo",
  creative_draft: "Criativos em produção",
  ready_to_schedule: "Pronto p/ agendar",
  scheduled: "Agendado",
  published: "Publicado",
  paused: "Pausado",
  rejected: "Descartado",
  error: "Erro",
};

export const CREATIVE_STATUS_LABEL: Record<CreativeStatus, string> = {
  to_generate: "A gerar",
  generating: "Em geração",
  waiting_manual_image: "Aguardando imagem",
  review: "Revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  published: "Publicado",
  archived: "Arquivado",
};

export const PIN_STATUS_LABEL: Record<PinStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  blocked: "Bloqueado",
  canceled: "Cancelado",
  paused: "Pausado",
};

export const MOTIVOS_DESCARTE = [
  { value: "repetido", label: "Repetido" },
  { value: "baixa_qualidade", label: "Baixa qualidade" },
  { value: "preco", label: "Preço" },
  { value: "pouco_visual", label: "Pouco visual" },
  { value: "outro", label: "Outro" },
] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number]["value"];
