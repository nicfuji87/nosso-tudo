/**
 * Catálogo de jobs do ML: rótulo, prioridade, timeout e tentativas por tipo.
 * Payloads são validados por Zod no handler (lib/ml/jobs/handlers).
 */
export const JOB_TYPES = [
  "DISCOVER_BESTSELLERS",
  "DISCOVER_TRENDS",
  "SYNC_CATEGORIES",
  "ENRICH_PRODUCT",
  "SCORE_PRODUCT",
  "PROCESS_PIPELINE",
  "CHECK_PRODUCT",
  "GENERATE_ANGLES",
  "GENERATE_CREATIVES",
  "GENERATE_COPY",
  "GENERATE_IMAGE",
  "GENERATE_PENDING_CREATIVES",
  "DISPATCH_PUBLICATIONS",
  "REVALIDATE_SCHEDULED",
  "REVALIDATE_CATALOG",
  "PUBLISH_PIN",
  "FETCH_PIN_ANALYTICS",
  "COMPUTE_PERFORMANCE",
  "REFRESH_TOKENS",
  "SYNC_BOARDS",
  "DIAGNOSTICS",
  "CLEANUP",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface MetaJob {
  label: string;
  prioridade: number; // menor = antes
  timeoutSeg: number;
  maxTentativas: number;
}

export const META_JOB: Record<JobType, MetaJob> = {
  DISCOVER_BESTSELLERS: { label: "Descoberta de mais vendidos", prioridade: 50, timeoutSeg: 240, maxTentativas: 5 },
  DISCOVER_TRENDS: { label: "Coleta de tendências", prioridade: 60, timeoutSeg: 180, maxTentativas: 5 },
  SYNC_CATEGORIES: { label: "Sincronizar categorias", prioridade: 40, timeoutSeg: 120, maxTentativas: 3 },
  ENRICH_PRODUCT: { label: "Enriquecer produto", prioridade: 80, timeoutSeg: 120, maxTentativas: 5 },
  SCORE_PRODUCT: { label: "Analisar e pontuar", prioridade: 90, timeoutSeg: 120, maxTentativas: 4 },
  PROCESS_PIPELINE: { label: "Processar pipeline", prioridade: 70, timeoutSeg: 120, maxTentativas: 2 },
  CHECK_PRODUCT: { label: "Checar produto", prioridade: 30, timeoutSeg: 60, maxTentativas: 4 },
  GENERATE_ANGLES: { label: "Gerar ângulos", prioridade: 60, timeoutSeg: 120, maxTentativas: 3 },
  GENERATE_CREATIVES: { label: "Gerar criativos", prioridade: 60, timeoutSeg: 60, maxTentativas: 3 },
  GENERATE_COPY: { label: "Gerar textos", prioridade: 60, timeoutSeg: 120, maxTentativas: 3 },
  GENERATE_IMAGE: { label: "Gerar imagem", prioridade: 65, timeoutSeg: 240, maxTentativas: 3 },
  GENERATE_PENDING_CREATIVES: { label: "Geração automática de criativos", prioridade: 70, timeoutSeg: 60, maxTentativas: 2 },
  DISPATCH_PUBLICATIONS: { label: "Despachar publicações", prioridade: 20, timeoutSeg: 60, maxTentativas: 2 },
  REVALIDATE_SCHEDULED: { label: "Revalidar agendados", prioridade: 25, timeoutSeg: 120, maxTentativas: 2 },
  REVALIDATE_CATALOG: { label: "Revalidar catálogo", prioridade: 100, timeoutSeg: 240, maxTentativas: 2 },
  PUBLISH_PIN: { label: "Publicar Pin", prioridade: 10, timeoutSeg: 90, maxTentativas: 5 },
  FETCH_PIN_ANALYTICS: { label: "Coletar métricas", prioridade: 110, timeoutSeg: 240, maxTentativas: 4 },
  COMPUTE_PERFORMANCE: { label: "Calcular performance", prioridade: 120, timeoutSeg: 120, maxTentativas: 2 },
  REFRESH_TOKENS: { label: "Renovar tokens", prioridade: 5, timeoutSeg: 60, maxTentativas: 4 },
  SYNC_BOARDS: { label: "Sincronizar boards", prioridade: 40, timeoutSeg: 90, maxTentativas: 3 },
  DIAGNOSTICS: { label: "Diagnóstico completo", prioridade: 15, timeoutSeg: 120, maxTentativas: 1 },
  CLEANUP: { label: "Limpeza", prioridade: 150, timeoutSeg: 240, maxTentativas: 2 },
};

export function labelJob(tipo: string): string {
  return (META_JOB as Record<string, MetaJob>)[tipo]?.label ?? tipo;
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Executando",
  succeeded: "Concluído",
  failed: "Falhou (vai tentar de novo)",
  dead: "Falhou definitivamente",
  canceled: "Cancelado",
};
